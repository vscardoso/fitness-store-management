"""
Fila de etiquetas no Postgres de verdade, com pedidos simultâneos (uma sessão por pedido, como em produção):
- vários "pôr o que falta da entrada na fila" ao mesmo tempo: a fila recebe o que falta UMA vez (sem a trava somava em dobro);
- várias pessoas imprimindo a MESMA fila ao mesmo tempo: só uma impressão é salva, as outras recebem "A fila mudou" e nada é gravado.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_fila_etiquetas_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_fila_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import os
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
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
DB = "provador_fila_test"
USER = SimpleNamespace(id=1, full_name="Dona", email="u1@example.com")


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture
async def cena():
    from app.models.base import BaseModel
    from app.models.category import Category
    from app.models.entry_item import EntryItem
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import StockEntry
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
        p = Product(name="Legging", category_id=cat.id, tenant_id=1, base_price=Decimal("10"))
        s.add(p)
        await s.flush()
        entry = StockEntry(entry_code="ENT-PG-1", entry_date=date.today(), entry_type="local", supplier_name="F", tenant_id=1, total_cost=Decimal("0"))
        s.add(entry)
        await s.flush()
        vids = []
        for i, qtd in enumerate((5, 4)):
            v = ProductVariant(product_id=p.id, sku=f"LG-{i}", color="Preto", size=("M", "G")[i], price=Decimal("10"), tenant_id=1)
            s.add(v)
            await s.flush()
            s.add(EntryItem(entry_id=entry.id, product_id=p.id, variant_id=v.id, quantity_received=qtd, quantity_remaining=qtd,
                            unit_cost=Decimal("5"), tenant_id=1))
            vids.append(v.id)
        await s.commit()
    yield mk, entry.id, vids
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


async def _total_fila(mk) -> int:
    from app.models.label_queue import LabelQueueItem
    async with mk() as s:
        return int((await s.execute(select(func.coalesce(func.sum(LabelQueueItem.quantity), 0)).where(
            LabelQueueItem.tenant_id == 1, LabelQueueItem.is_active == True))).scalar())  # noqa: E712


async def test_pedidos_simultaneos_de_por_o_que_falta_nao_somam_em_dobro(cena):
    from app.services import label_queue_service as q
    mk, entry_id, _ = cena

    async def um():
        async with mk() as s:
            r = await q.add_entry_missing(s, 1, USER, entry_id)
            await s.commit()
            return r["added"]

    adds = await asyncio.gather(*[um() for _ in range(6)])
    assert sum(adds) == 9, adds                       # a entrada tem 9 peças: entram 9 UMA vez
    assert await _total_fila(mk) == 9


async def test_varias_pessoas_imprimindo_a_mesma_fila_so_uma_impressao_e_salva(cena):
    from app.models.label_queue import LabelPrintJob
    from app.services import label_queue_service as q
    mk, entry_id, (va, vb) = cena
    async with mk() as s:
        await q.add_entry_missing(s, 1, USER, entry_id)
        await s.commit()
    itens = [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 4}]

    async def imprimir():
        async with mk() as s:
            try:
                r = await q.confirm_print(s, 1, USER, "sheet", 47, 42, 1, itens, True, None)
                await s.commit()
                return "ok", r["total"]
            except q.QueueError as e:
                await s.rollback()
                return "recusou", str(e)

    res = await asyncio.gather(*[imprimir() for _ in range(6)])
    assert [r[0] for r in res].count("ok") == 1, res
    assert all("A fila mudou" in r[1] for r in res if r[0] == "recusou")
    async with mk() as s:
        jobs = (await s.execute(select(func.count()).select_from(LabelPrintJob).where(LabelPrintJob.is_active == True))).scalar()  # noqa: E712
    assert jobs == 1                                  # impresso uma vez só
    assert await _total_fila(mk) == 0
