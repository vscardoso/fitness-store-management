"""
Fiado no Postgres de verdade: dois recebimentos simultâneos da mesma dívida nunca recebem mais do que ela deve.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_fiado_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_fiado_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import os
from datetime import date
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
DB = "provador_fiado_test"


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module")
async def maker():
    from app.models.base import BaseModel
    from app.models.customer import Customer
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
        s.add(User(id=1, email="u1@example.com", full_name="Usuaria", hashed_password="x", role=UserRole.ADMIN, is_active=True, tenant_id=1))
        s.add(Customer(id=1, full_name="Cliente Fiado", email="c1@example.com", phone="34999990000", tenant_id=1))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def test_recebimentos_simultaneos_nao_passam_do_que_ela_deve(maker):
    from app.models.receivable import ReceivablePayment
    from app.models.user import User
    from app.services.finance_service import FinanceError
    from app.services.receivable_service import ReceivableService

    async with maker() as s:
        user = await s.get(User, 1)
        await ReceivableService(s).create_opening(1, user, {"customer_id": 1, "installments": [
            {"amount": "60", "due_date": date.today().isoformat()}, {"amount": "40", "due_date": date.today().isoformat()}]})

    async def receber():
        async with maker() as s:
            user = await s.get(User, 1)
            original = s.execute

            async def devagar(stmt, *a, **kw):   # pausa depois de ler as parcelas: as 6 leem ao mesmo tempo
                res = await original(stmt, *a, **kw)
                if "FROM receivables" in str(stmt) and "receivable_payments" not in str(stmt):
                    await asyncio.sleep(0.3)
                return res
            s.execute = devagar
            try:
                await ReceivableService(s).receive(1, user, {"customer_id": 1, "amount": "70", "payment_method": "cash"})
                return "ok"
            except FinanceError:
                return "recusado"

    res = await asyncio.gather(*[receber() for _ in range(6)])
    assert res.count("ok") == 1, res     # 70 cabe uma vez nos 100; a segunda (140) passaria do que ela deve
    async with maker() as s:
        total = (await s.execute(select(func.sum(ReceivablePayment.amount)).where(ReceivablePayment.is_active == True))).scalar()  # noqa: E712
        assert Decimal(total) == Decimal("70.00")
        left = (await ReceivableService(s).summary(1))["open_total"]
        assert left == 30.0
