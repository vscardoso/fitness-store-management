"""
Conferir recebimento no Postgres de verdade, com pedidos simultâneos (várias vendedoras bipando a mesma entrada):
- 8 pessoas bipam a MESMA peça ao mesmo tempo na primeira bipada: nasce UMA conferência e a contagem soma as 8;
- 6 lotes iguais (mesmo batch_id) chegando ao mesmo tempo contam uma vez só.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_receber_conferencia_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_recebimento_test` (use SÓ um Postgres local descartável).
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
DB = "provador_recebimento_test"


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
        for i in range(1, 9):
            s.add(User(id=i, email=f"u{i}@example.com", full_name=f"Vendedora {i}", hashed_password="x", role=UserRole.SELLER,
                       is_active=True, tenant_id=1))
        cat = Category(name="Cat", slug="cat", tenant_id=1)
        s.add(cat)
        await s.flush()
        p = Product(name="Legging PG", category_id=cat.id, tenant_id=1, base_price=Decimal("100"))
        s.add(p)
        await s.flush()
        v = ProductVariant(product_id=p.id, sku="PG-1", color="Preto", size="M", price=Decimal("100"), tenant_id=1)
        s.add(v)
        await s.flush()
        e = StockEntry(entry_code="PG-ENTRADA", entry_date=date.today(), entry_type=EntryType.LOCAL, supplier_name="F",
                       total_cost=Decimal("100"), tenant_id=1)
        s.add(e)
        await s.flush()
        s.add(EntryItem(entry_id=e.id, variant_id=v.id, product_id=p.id, quantity_received=20, quantity_remaining=20,
                        unit_cost=Decimal("5"), tenant_id=1))
        await s.commit()
        mk.entry_id, mk.variant_id = e.id, v.id
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def _bipa(mk, user_id, batch_id=None):
    from app.models.user import User
    from app.services.stock_count_service import StockCountService
    async with mk() as s:
        user = (await s.execute(select(User).where(User.id == user_id))).scalar_one()
        svc = StockCountService(s)
        count = await svc.open_for_entry(tenant_id=1, user=user, entry_id=mk.entry_id)
        await svc.apply(tenant_id=1, user=user, count_id=count.id, ops=[{"variant_id": mk.variant_id, "delta": 1}], batch_id=batch_id)


async def test_oito_pessoas_bipando_ao_mesmo_tempo_somam_numa_conferencia_so(maker):
    from app.models.stock_count import StockCount, StockCountItem
    await asyncio.gather(*[_bipa(maker, i) for i in range(1, 9)])
    async with maker() as s:
        counts = (await s.execute(select(StockCount).where(StockCount.entry_id == maker.entry_id))).scalars().all()
        assert len(counts) == 1, f"nasceram {len(counts)} conferências para a mesma entrada"
        qty = (await s.execute(select(func.sum(StockCountItem.counted_quantity)).where(StockCountItem.count_id == counts[0].id))).scalar()
        assert qty == 8, f"8 bipadas simultâneas viraram {qty}"
        assert counts[0].revision == 1 + 8


async def test_lote_repetido_ao_mesmo_tempo_conta_uma_vez(maker):
    from app.models.stock_count import StockCount, StockCountItem
    async with maker() as s:
        antes = (await s.execute(select(func.sum(StockCountItem.counted_quantity)))).scalar() or 0
    await asyncio.gather(*[_bipa(maker, 1, batch_id="mesmo-lote") for _ in range(6)])
    async with maker() as s:
        depois = (await s.execute(select(func.sum(StockCountItem.counted_quantity)))).scalar() or 0
    assert depois - antes == 1, f"6 envios do mesmo lote somaram {depois - antes}"
