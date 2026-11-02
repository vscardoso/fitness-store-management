"""
Importação de estoque no Postgres de verdade: duas planilhas simultâneas com o mesmo produto novo não duplicam o
produto nem a variação (a trava do catálogo serializa e a segunda vê o que a primeira criou) e o estoque fecha.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_importacao_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_import_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import os
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
DB = "provador_import_test"
CAB = "Produto;Categoria;Cor;Tamanho;Quantidade;Custo;Preço\n"


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module")
async def maker():
    from app.models.base import BaseModel
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
        s.add(Store(id=1, name="Loja 1", slug="loja-1", subdomain="loja-1", is_default=True, is_active=True))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


def _table(txt):
    from app.services.stock_import_service import read_table
    return read_table(text_=txt)


async def _importar(mk, txt):
    from app.services.stock_import_service import StockImportError, StockImportService
    async with mk() as s:
        try:
            return await StockImportService(s).commit(1, _table(txt))
        except StockImportError as exc:
            return str(exc)


async def test_planilhas_simultaneas_com_o_mesmo_produto_novo_nao_duplicam(maker):
    from app.models.entry_item import EntryItem
    from app.models.inventory import Inventory
    from app.models.product import Product
    from app.models.product_variant import ProductVariant

    # 6 planilhas diferentes (quantidades diferentes) ao mesmo tempo, todas com "Legging Corrida" M e a mesma categoria nova
    txts = [CAB + f"Legging Corrida;Corrida;Preto;M;{n};30,00;90,00\nLegging Corrida;Corrida;Preto;G;{n};30,00;90,00\n" for n in range(1, 7)]
    res = await asyncio.gather(*[_importar(maker, t) for t in txts])
    assert all(isinstance(r, dict) for r in res), res
    async with maker() as s:
        assert (await s.execute(select(func.count()).select_from(Product).where(Product.name == "Legging Corrida"))).scalar() == 1
        pid = (await s.execute(select(Product.id).where(Product.name == "Legging Corrida"))).scalar()
        assert (await s.execute(select(func.count()).select_from(ProductVariant).where(ProductVariant.product_id == pid))).scalar() == 2
        assert (await s.execute(text("select count(*) from categories where name = 'Corrida'"))).scalar() == 1
        total = (await s.execute(select(func.sum(EntryItem.quantity_remaining)).where(EntryItem.product_id == pid))).scalar()
        assert total == 2 * sum(range(1, 7))                       # cada planilha somou o seu
        inv = (await s.execute(select(Inventory.quantity).where(Inventory.product_id == pid))).scalar()
        assert inv == total                                         # o saldo do produto bate com os lotes
        codes = (await s.execute(select(ProductVariant.short_code, ProductVariant.sku).where(ProductVariant.product_id == pid))).all()
        assert len({c for c, _ in codes}) == 2 and len({k for _, k in codes}) == 2 and all(c and k for c, k in codes)
        entries = (await s.execute(text("select count(distinct entry_code) from stock_entries where entry_type = 'initial'"))).scalar()
        assert entries == 6                                         # um código de entrada para cada planilha


async def test_mesma_planilha_duas_vezes_ao_mesmo_tempo_so_entra_uma(maker):
    from app.models.entry_item import EntryItem
    from app.models.product import Product
    txt = CAB + "Top Treino;Tops;Rosa;P;4;20,00;60,00\n"
    res = await asyncio.gather(*[_importar(maker, txt) for _ in range(5)])
    ok = [r for r in res if isinstance(r, dict)]
    assert len(ok) == 1, res
    assert all("já foi importada" in r for r in res if isinstance(r, str)), res
    async with maker() as s:
        pid = (await s.execute(select(Product.id).where(Product.name == "Top Treino"))).scalar()
        assert (await s.execute(select(func.sum(EntryItem.quantity_remaining)).where(EntryItem.product_id == pid))).scalar() == 4
