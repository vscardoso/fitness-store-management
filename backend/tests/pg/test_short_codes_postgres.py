"""
Código curto da etiqueta no Postgres de verdade: criações simultâneas nunca repetem número e
transação desfeita não deixa buraco.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_codigo_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import os
import random
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
DB = "provador_codigo_test"


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module")
async def maker():
    from app.models.base import BaseModel
    from app.models.category import Category
    from app.models.product import Product
    from app.models.store import Store
    import app.models  # noqa: F401
    import app.services.short_code_service  # noqa: F401  (registra o evento)

    root = create_async_engine(_url("postgres"), isolation_level="AUTOCOMMIT")
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
        await c.execute(text(f"CREATE DATABASE {DB}"))
    engine = create_async_engine(_url(DB), poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    mk = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with mk() as s:
        for sid in (1, 2):
            s.add(Store(id=sid, name=f"Loja {sid}", slug=f"loja-{sid}", subdomain=f"loja-{sid}", is_default=sid == 1, is_active=True))
        await s.flush()
        for sid in (1, 2):
            s.add(Category(id=sid, name=f"Cat {sid}", slug=f"cat-{sid}", tenant_id=sid))
        await s.flush()
        for sid in (1, 2):
            s.add(Product(id=sid, name=f"Produto {sid}", category_id=sid, tenant_id=sid, base_price=Decimal("10")))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def _create(mk, tenant: int, i: int, commit: bool):
    from app.models.product_variant import ProductVariant
    async with mk() as s:
        v = ProductVariant(product_id=tenant, sku=f"SKU-{tenant}-{i}", color=f"Cor {i}", size="M",
                           price=Decimal("10"), tenant_id=tenant)
        s.add(v)
        await s.flush()  # reserva o número (trava a linha do contador)
        await asyncio.sleep(random.uniform(0, 0.05))
        if commit:
            await s.commit()
            return v.short_code
        await s.rollback()
        return None


async def test_simultaneas_sem_repetir_nem_buraco(maker):
    from app.models.product_variant import ProductVariant

    random.seed(7)
    plan = [(1 if i % 3 else 2, i, i % 5 != 0) for i in range(40)]  # 2 lojas; 1 em cada 5 desfaz
    results = await asyncio.gather(*[_create(maker, t, i, ok) for t, i, ok in plan])
    async with maker() as s:
        for tenant in (1, 2):
            codes = sorted((await s.execute(
                select(ProductVariant.short_code).where(ProductVariant.tenant_id == tenant)
            )).scalars().all())
            committed = sum(1 for t, _, ok in plan if t == tenant and ok)
            assert codes == list(range(1, committed + 1)), (tenant, codes)  # sem repetir e sem buraco
            counter = (await s.execute(text("select next_short_code from catalog_counters where tenant_id = :t"), {"t": tenant})).scalar_one()
            assert counter == committed + 1
    assert all(r is None for (t, i, ok), r in zip(plan, results) if not ok)
