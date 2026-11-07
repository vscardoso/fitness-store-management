"""
Fechamento do mês e empréstimos no Postgres de verdade, com pedidos simultâneos:
- seis "recebi o empréstimo de volta" ao mesmo tempo nunca passam do que a pessoa deve;
- quatro "fechar o mês" ao mesmo tempo gravam UM fechamento e um ajuste por conta.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_fechamento_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_fechamento_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import os
from datetime import date, timedelta
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
DB = "provador_fechamento_test"
MES_PASSADO = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1)


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module")
async def maker():
    from app.models.base import BaseModel
    from app.models.store import Store
    from app.models.user import User, UserRole
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
        from app.services.finance_service import FinanceService
        user = await s.get(User, 1)
        await FinanceService(s).setup(1, user, {"start_date": MES_PASSADO.isoformat(), "cash_balance": "100",
                                                "banks": [{"name": "Banco", "balance": "1000"}]})
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


def _devagar(s, trecho):
    """Pausa depois de ler `trecho`: todos os pedidos leem ao mesmo tempo antes de gravar."""
    original = s.execute

    async def devagar(stmt, *a, **kw):
        res = await original(stmt, *a, **kw)
        if trecho in str(stmt):
            await asyncio.sleep(0.3)
        return res
    s.execute = devagar


async def test_recebimentos_simultaneos_do_emprestimo_nao_passam_do_devido(maker):
    from app.models.finance import AccountEntry, FinancialAccount
    from app.models.user import User
    from app.services.finance_service import FinanceError, FinanceService

    async with maker() as s:
        user = await s.get(User, 1)
        banco = (await s.execute(select(FinancialAccount).where(FinancialAccount.name == "Banco"))).scalar_one()
        await FinanceService(s).create_entry(1, user, {"kind": "loan_given", "account_id": banco.id, "amount": "100",
                                                       "person": "Ana"})
        banco_id = banco.id

    async def receber():
        async with maker() as s:
            user = await s.get(User, 1)
            _devagar(s, "FROM account_entries")
            try:
                await FinanceService(s).create_entry(1, user, {"kind": "loan_repaid", "account_id": banco_id,
                                                               "amount": "70", "person": "ana"})
                return "ok"
            except FinanceError:
                return "recusado"

    res = await asyncio.gather(*[receber() for _ in range(6)])
    assert res.count("ok") == 1, res
    async with maker() as s:
        total = (await s.execute(select(func.sum(AccountEntry.amount)).where(
            AccountEntry.kind == "loan_repaid", AccountEntry.is_active == True))).scalar()  # noqa: E712
        assert Decimal(total) == Decimal("70.00")
        assert (await FinanceService(s).loans(1))["to_receive_total"] == 30.0


async def test_fechamentos_simultaneos_gravam_um_so(maker):
    from app.models.finance import AccountEntry, MonthClosing
    from app.models.user import User
    from app.services.finance_service import FinanceError
    from app.services.month_closing_service import MonthClosingService

    async with maker() as s:
        f = await MonthClosingService(s).compute(1, MES_PASSADO.year, MES_PASSADO.month)
        contado = {str(a["id"]): str(Decimal(str(a["expected"])) - Decimal("10")) for a in f["accounts"]}

    async def fechar():
        async with maker() as s:
            user = await s.get(User, 1)
            _devagar(s, "FROM month_closings")
            try:
                await MonthClosingService(s).close(1, user, MES_PASSADO.year, MES_PASSADO.month,
                                                   {"counted": contado, "notes": "teste"})
                return "ok"
            except FinanceError:
                return "recusado"

    res = await asyncio.gather(*[fechar() for _ in range(4)])
    assert res.count("ok") == 1, res
    async with maker() as s:
        n = (await s.execute(select(func.count(MonthClosing.id)).where(MonthClosing.is_active == True))).scalar()  # noqa: E712
        adj = (await s.execute(select(func.count(AccountEntry.id)).where(
            AccountEntry.kind == "closing_adjustment", AccountEntry.is_active == True))).scalar()  # noqa: E712
        assert n == 1 and adj == len(contado)
