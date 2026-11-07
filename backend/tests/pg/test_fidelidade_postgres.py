"""
Fidelidade no Postgres de verdade, com pedidos simultâneos: oito resgates ao mesmo tempo nunca gastam mais pontos do que a
cliente tem (o saldo é gasto uma vez só), e o extrato fecha com o saldo.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_fidelidade_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_fidelidade_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import os
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
DB = "provador_fidelidade_test"


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
        s.add(Store(id=1, name="Loja 1", slug="loja-1", subdomain="loja-1", is_default=True, is_active=True,
                    loyalty_enabled=True, loyalty_spend_per_point=10, loyalty_point_value=Decimal("0.10")))
        await s.flush()
        s.add(Customer(id=1, full_name="Cliente", phone="34999990001", tenant_id=1, is_active=True))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def test_resgates_simultaneos_nao_gastam_o_mesmo_saldo(maker):
    from app.models.customer import Customer
    from app.models.loyalty import LoyaltyEntry
    from app.services.loyalty_service import LoyaltyError, LoyaltyService

    async with maker() as s:
        c = await s.get(Customer, 1)
        await LoyaltyService(s).adjust(c, Decimal("100"), 1, "saldo de teste")
        await s.commit()

    async def tenta():
        async with maker() as s:
            c = await s.get(Customer, 1)
            try:
                pts = await LoyaltyService(s).redeem_amount(c, None, Decimal("3.00"), 1)    # R$ 3,00 = 30 pontos
                await s.commit()
                return pts
            except LoyaltyError:
                await s.rollback()
                return None

    resultados = await asyncio.gather(*[tenta() for _ in range(8)])
    deu_certo = [r for r in resultados if r is not None]
    assert len(deu_certo) == 3, resultados          # 100 pontos dão para 3 resgates de 30 (sobram 10)
    async with maker() as s:
        saldo = await LoyaltyService(s).balance(1, 1)
        assert saldo == Decimal("10.00")
        extrato = (await s.execute(select(func.coalesce(func.sum(LoyaltyEntry.points), 0)).where(LoyaltyEntry.customer_id == 1))).scalar()
        assert Decimal(str(extrato)) == saldo       # o extrato fecha com o saldo
        c = await s.get(Customer, 1)
        assert Decimal(str(c.loyalty_points)) == saldo
