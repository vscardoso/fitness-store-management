"""
Feed de catálogo da Meta no Postgres de verdade: a consulta (booleanos, estoque FIFO, fotos) e a coluna nova em stores.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_catalog_feed_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_feed_test` (use SÓ um Postgres local descartável).
"""
import csv
import io
import os
from urllib.parse import urlparse

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

PG_URL = os.getenv("TEST_PG_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not PG_URL, reason="defina TEST_PG_URL para testar no Postgres"),
]
DB = "provador_feed_test"


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module")
async def maker():
    from app.models.base import BaseModel
    import app.models  # noqa: F401
    import app.services.short_code_service  # noqa: F401  (registra o evento)

    root = create_async_engine(_url("postgres"), isolation_level="AUTOCOMMIT")
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
        await c.execute(text(f"CREATE DATABASE {DB}"))
    engine = create_async_engine(_url(DB), poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    yield sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def test_feed_no_postgres_foto_marca_estoque_e_preco(maker):
    from app.models.category import Category
    from app.models.entry_item import EntryItem
    from app.models.product import Product
    from app.models.product_media import ProductMedia
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import StockEntry
    from app.models.store import Store
    from app.services import catalog_feed_service as svc

    async with maker() as db:
        loja = Store(name="Loja Feed", slug="loja-feed", subdomain="loja-feed", is_default=True, is_active=True,
                     catalog_feed_token=svc.new_token())
        db.add(loja)
        await db.flush()
        cat = Category(name="Cat", slug="cat-feed", tenant_id=loja.id)
        db.add(cat)
        await db.flush()
        com_foto = Product(name="Legging Nike Cintura Alta", description="Legging Lupo, compressão alta.", brand="Nike",
                           category_id=cat.id, tenant_id=loja.id, base_price=129.9, image_url="/uploads/products/1.jpg", is_catalog=True)
        sem_foto = Product(name="Top Sem Foto", category_id=cat.id, tenant_id=loja.id, base_price=59.9, is_catalog=True)
        fora = Product(name="Top Nao Publicado", category_id=cat.id, tenant_id=loja.id, base_price=59.9,
                       image_url="/uploads/products/3.jpg", is_catalog=False)
        db.add_all([com_foto, sem_foto, fora])
        await db.flush()
        v1 = ProductVariant(product_id=com_foto.id, sku="F-1", color="Preto", size="M", price=129.9, tenant_id=loja.id)
        v2 = ProductVariant(product_id=com_foto.id, sku="F-2", color="Preto", size="G", price=129.9, tenant_id=loja.id)
        v3 = ProductVariant(product_id=sem_foto.id, sku="F-3", color="Rosa", size="P", price=59.9, tenant_id=loja.id)
        v4 = ProductVariant(product_id=fora.id, sku="F-4", color="Rosa", size="P", price=59.9, tenant_id=loja.id)
        db.add_all([v1, v2, v3, v4])
        await db.flush()
        db.add(ProductMedia(product_id=com_foto.id, variant_id=v2.id, tenant_id=loja.id, url="/uploads/products/g.jpg", is_cover=True, position=0))
        entrada = StockEntry(entry_code="FEED-1", entry_type="local", supplier_name="Fornecedor", tenant_id=loja.id, entry_date=__import__("datetime").date.today())
        db.add(entrada)
        await db.flush()
        db.add(EntryItem(entry_id=entrada.id, variant_id=v1.id, product_id=com_foto.id, tenant_id=loja.id, quantity_received=3,
                         quantity_remaining=3, unit_cost=40, is_active=True))
        await db.commit()

        feed = await svc.build_feed(db, loja)
        linhas = list(csv.DictReader(io.StringIO(svc.render_csv(feed.items))))
        assert [x["id"] for x in linhas] == [f"p{com_foto.id}"]          # um item por produto
        x = linhas[0]
        assert x["availability"] == "in stock"                             # Preto M tem peça (Preto G não)
        assert x["image_link"].endswith("/uploads/products/1.jpg?w=1200")
        assert x["price"] == "129.90 BRL" and x["brand"] == "Loja Feed"
        assert x["description"].endswith("Cores disponíveis: Preto. Tamanhos disponíveis: M.")
        texto = svc.render_csv(feed.items).lower()
        assert "nike" not in texto and "lupo" not in texto
        assert feed.products == 2 and feed.skipped_no_photo == 1 and [m["name"] for m in feed.missing_photo_products] == ["Top Sem Foto"]
