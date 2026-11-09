"""
Brinde no Postgres de verdade, com pedidos simultâneos (uma sessão por pedido, como em produção):
- seis brindes da ÚLTIMA peça ao mesmo tempo: só um passa e o estoque nunca fica negativo;
- (brinde não aceita devolução: só cancelar por engano).

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55437/postgres pytest tests/pg/test_brinde_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_brinde_test` (use SÓ um Postgres local descartável).
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
DB = "provador_brinde_test"


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module")
async def maker():
    from app.models.base import BaseModel
    from app.models.category import Category
    from app.models.entry_item import EntryItem
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import EntryType, StockEntry
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
        s.add(User(id=1, email="u1@example.com", full_name="Dona", hashed_password="x", role=UserRole.ADMIN, is_active=True, tenant_id=1))
        cat = Category(name="Cat", slug="cat", tenant_id=1)
        s.add(cat)
        await s.flush()
        p = Product(name="Faixa", category_id=cat.id, tenant_id=1, base_price=Decimal("10"))
        s.add(p)
        await s.flush()
        for i, qtd in enumerate((1, 6)):                      # a variação 1 tem UMA peça; a 2 tem seis
            v = ProductVariant(product_id=p.id, sku=f"FX-{i}", price=Decimal("10"), tenant_id=1)
            s.add(v)
            await s.flush()
            e = StockEntry(entry_code=f"LOTE-{i}", entry_date=date.today(), entry_type=EntryType.LOCAL, supplier_name="Fornecedor", total_cost=Decimal("4") * qtd, tenant_id=1)
            s.add(e)
            await s.flush()
            s.add(EntryItem(entry_id=e.id, variant_id=v.id, product_id=p.id, quantity_received=qtd, quantity_remaining=qtd,
                            unit_cost=Decimal("4"), tenant_id=1))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def _variantes(mk):
    from app.models.product_variant import ProductVariant
    async with mk() as s:
        return [v.id for v in (await s.execute(select(ProductVariant).order_by(ProductVariant.id))).scalars().all()]


async def _estoque(mk, variant_id):
    from app.models.entry_item import EntryItem
    async with mk() as s:
        return (await s.execute(select(func.coalesce(func.sum(EntryItem.quantity_remaining), 0)).where(EntryItem.variant_id == variant_id))).scalar()


async def test_seis_brindes_da_ultima_peca_so_um_passa(maker):
    from app.models.gift import Gift
    from app.models.user import User
    from app.services.gift_service import GiftError, GiftService
    ultima, _ = await _variantes(maker)

    async def dar():
        async with maker() as s:
            user = await s.get(User, 1)
            try:
                await GiftService(s).create(1, user, {"items": [{"variant_id": ultima, "quantity": 1}],
                                                      "reason_type": "promotion", "recipient_name": "Influenciadora"})
                return "ok"
            except GiftError:
                return "recusado"

    res = await asyncio.gather(*[dar() for _ in range(6)])
    assert res.count("ok") == 1 and res.count("recusado") == 5, res
    assert await _estoque(maker, ultima) == 0                              # nunca -1
    async with maker() as s:
        assert (await s.execute(select(func.count()).select_from(Gift))).scalar() == 1
