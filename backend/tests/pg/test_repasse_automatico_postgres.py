"""
Repasse automático da maquininha no Postgres de verdade, com rodadas simultâneas (dois processos do servidor, ou a rodada
de 30 em 30 minutos sobreposta a outra): o mesmo dia de cartão NUNCA é lançado duas vezes.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55436/postgres pytest tests/pg/test_repasse_automatico_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_repasse_auto_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import os
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from urllib.parse import urlparse

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

PG_URL = os.getenv("TEST_PG_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not PG_URL, reason="defina TEST_PG_URL para testar no Postgres"),
]
DB = "provador_repasse_auto_test"


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


def _dias_uteis(n: int):
    """`n` dias de semana (segunda a quinta) distintos nos últimos dias: o cartão de cada um cai no dia seguinte."""
    out, d = [], date.today() - timedelta(days=3)
    while len(out) < n:
        if d.weekday() <= 3:
            out.append(d)
        d -= timedelta(days=1)
    return out


@pytest.fixture(scope="module")
async def maker():
    from app.models.base import BaseModel
    from app.models.sale import Payment, PaymentMethod, Sale, SaleStatus
    from app.models.store import Store
    from app.models.user import User, UserRole
    from app.services.finance_service import FinanceService
    import app.models  # noqa: F401

    root = create_async_engine(_url("postgres"), isolation_level="AUTOCOMMIT")
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
        await c.execute(text(f"CREATE DATABASE {DB}"))
    engine = create_async_engine(_url(DB), poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    mk = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with mk() as s:
        s.add(Store(id=1, name="Loja 1", slug="loja-1", subdomain="loja-1", is_default=True, is_active=True))
        await s.flush()
        s.add(User(id=1, email="u1@example.com", full_name="Usuaria", hashed_password="x", role=UserRole.ADMIN,
                   is_active=True, tenant_id=1))
        await s.commit()
    async with mk() as s:
        user = await s.get(User, 1)
        await FinanceService(s).setup(1, user, {"start_date": (date.today() - timedelta(days=12)).isoformat(),
                                                "cash_balance": "0", "card_balance": "0",
                                                "banks": [{"name": "Banco", "balance": "0", "receives_pix": True}]})
        for i, dia in enumerate(_dias_uteis(3)):
            venda = Sale(tenant_id=1, sale_number=f"V-{i}", status=SaleStatus.COMPLETED, subtotal=Decimal("100"), seller_id=1, payment_method=PaymentMethod.CREDIT_CARD,
                         total_amount=Decimal("100"))
            s.add(venda)
            await s.flush()
            s.add(Payment(tenant_id=1, sale_id=venda.id, amount=Decimal("100"), payment_method=PaymentMethod.CREDIT_CARD,
                          status="confirmed", created_at=datetime.combine(dia, time(15, 0))))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def test_rodadas_simultaneas_nunca_lancam_o_mesmo_dia_duas_vezes(maker):
    from app.models.finance import AccountTransfer
    from app.models.store import Store
    from app.services.finance_service import FinanceService

    async with maker() as s:
        loja = await s.get(Store, 1)
        loja.card_auto_settlement = True
        loja.card_auto_through = date.today() - timedelta(days=30)
        await s.commit()

    now = datetime.combine(date.today(), time(15, 0))

    async def rodar():
        async with maker() as s:
            return await FinanceService(s).auto_settle_card(1, now=now)

    res = await asyncio.gather(*[rodar() for _ in range(6)])
    assert sum(r["settled"] for r in res) == 3, res                    # um por dia de cartão, no total das 6 rodadas
    async with maker() as s:
        rows = (await s.execute(select(AccountTransfer).where(AccountTransfer.is_auto == True))).scalars().all()  # noqa: E712
        assert len(rows) == 3 and len({r.card_day for r in rows}) == 3
        assert sum(r.amount for r in rows) == Decimal("300.00")
        pagos = (await s.execute(select(func.count()).select_from(AccountTransfer).where(AccountTransfer.is_auto == True))).scalar()  # noqa: E712
        assert pagos == 3
    again = await asyncio.gather(*[rodar() for _ in range(4)])
    assert sum(r["settled"] for r in again) == 0                       # idempotente
