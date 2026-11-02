"""
Caixa no Postgres de verdade: duas aberturas ao mesmo tempo (só uma vale), sangrias simultâneas nunca deixam o caixa
negativo e a janela do turno (timestamptz) conta só o dinheiro do turno.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_caixa_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_caixa_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import os
from decimal import Decimal
from urllib.parse import urlparse

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

PG_URL = os.getenv("TEST_PG_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not PG_URL, reason="defina TEST_PG_URL para testar no Postgres"),
]
DB = "provador_caixa_test"


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
        for sid in (1, 2, 3):
            s.add(Store(id=sid, name=f"Loja {sid}", slug=f"loja-{sid}", subdomain=f"loja-{sid}", is_default=sid == 1, is_active=True))
        await s.flush()
        for sid in (1, 2, 3):
            s.add(User(id=sid, email=f"u{sid}@example.com", full_name=f"Usuaria {sid}", hashed_password="x",
                       role=UserRole.ADMIN, is_active=True, tenant_id=sid))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def _user(mk, uid):
    from app.models.user import User
    async with mk() as s:
        return (await s.execute(select(User).where(User.id == uid))).scalar_one()


async def test_oito_aberturas_ao_mesmo_tempo_so_uma_vale(maker):
    from app.services.cash_register_service import CashConflict, CashRegisterService
    u = await _user(maker, 1)

    async def abrir(i):
        async with maker() as s:
            try:
                await CashRegisterService(s).open(1, u, "10", f"tentativa {i}")
                return "ok"
            except CashConflict:
                return "conflito"

    res = await asyncio.gather(*[abrir(i) for i in range(8)])
    assert res.count("ok") == 1 and res.count("conflito") == 7, res
    async with maker() as s:
        n = (await s.execute(text("select count(*) from cash_sessions where tenant_id = 1 and status = 'open'"))).scalar_one()
        assert n == 1
        await CashRegisterService(s).close(1, u, "10", None)


async def test_sangrias_simultaneas_nunca_deixam_o_caixa_negativo(maker):
    from app.services.cash_register_service import CashError, CashRegisterService
    u = await _user(maker, 2)
    async with maker() as s:
        await CashRegisterService(s).open(2, u, "100", None)

    async def sangria():
        async with maker() as s:
            try:
                await CashRegisterService(s).add_movement(2, u, "withdrawal", "30", "sangria", None)
                return "ok"
            except CashError:
                return "recusada"

    res = await asyncio.gather(*[sangria() for _ in range(10)])
    assert res.count("ok") == 3 and res.count("recusada") == 7, res        # 100 / 30 = 3 sangrias; sobram 10
    async with maker() as s:
        cur = await CashRegisterService(s).current(2)
        assert cur["session"]["expected_amount"] == 10.0 and cur["session"]["withdrawals"] == 90.0


async def test_janela_do_turno_com_timestamptz_conta_so_o_dinheiro_do_turno(maker):
    from app.models.sale import Payment, PaymentMethod, Sale, SaleStatus
    from app.services.cash_register_service import CashRegisterService
    u = await _user(maker, 3)

    async def venda(n, valor, metodo, status=SaleStatus.COMPLETED):
        async with maker() as s:
            sale = Sale(sale_number=f"CX-{n}", status=status.value, subtotal=float(valor), discount_amount=0, tax_amount=0,
                        total_amount=float(valor), payment_method=metodo.value, loyalty_points_earned=0, seller_id=3, tenant_id=3, is_active=True)
            s.add(sale)
            await s.flush()
            s.add(Payment(sale_id=sale.id, amount=float(valor), payment_method=metodo, status="confirmed", tenant_id=3, is_active=True))
            await s.commit()

    await venda(1, "100.00", PaymentMethod.CASH)            # antes de abrir
    await asyncio.sleep(0.3)
    async with maker() as s:
        await CashRegisterService(s).open(3, u, "50.55", None)
    await asyncio.sleep(0.3)
    await venda(2, "29.90", PaymentMethod.CASH)
    await venda(3, "10.10", PaymentMethod.CASH)
    await venda(4, "70.00", PaymentMethod.PIX)
    await venda(5, "500.00", PaymentMethod.CASH, SaleStatus.CANCELLED)     # cancelada: fora
    async with maker() as s:
        cur = (await CashRegisterService(s).current(3))["session"]
        assert (cur["cash_sales"], cur["expected_amount"], cur["sales_count"]) == (40.0, 90.55, 3), cur
        assert cur["other_methods"] == {"pix": {"amount": 70.0, "sales": 1}}
        fech = await CashRegisterService(s).close(3, u, "90.55", None)
        assert fech["difference"] == 0.0 and fech["expected_amount"] == 90.55
    await asyncio.sleep(0.2)
    await venda(6, "300.00", PaymentMethod.CASH)                            # depois de fechar: não muda
    async with maker() as s:
        d = await CashRegisterService(s).detail(3, fech["id"])
        assert d["cash_sales"] == 40.0 and d["expected_amount"] == 90.55
