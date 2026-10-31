"""Status de estoque por produto (in_stock / depleted / never_stocked) e filtro de publicados.

Semântica atual: `Product.is_catalog=True` significa PUBLICADO no catálogo público. `include_catalog=False` devolve só os
publicados; `include_catalog=True` devolve todos os ativos da loja (o admin vê também os não publicados).
"""
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entry_item import EntryItem
from app.services.inventory_service import InventoryService
from app.services.product_service import ProductService
from tests.test_lot_costs import _loja, _lote, _produto

pytestmark = pytest.mark.asyncio


async def _carrega_variacoes(db, *produtos):
    """Contorno do BUG REAL de get_products_status (ver test_status_em_sessao_nova): deixa `variants` carregado para
    `Product.sku` não disparar lazy-load assíncrono. Assim os testes abaixo exercitam só a regra de status."""
    for p in produtos:
        await db.refresh(p, ["variants"])


async def test_products_status_flags(db: AsyncSession):
    tenant_id, _token, cat_id = await _loja(db)
    prod_a, _va = await _produto(db, tenant_id, cat_id, "A")   # nunca teve entrada
    prod_b, vb = await _produto(db, tenant_id, cat_id, "B")    # com saldo
    prod_c, vc = await _produto(db, tenant_id, cat_id, "C")    # teve entrada e zerou
    await _lote(db, tenant_id, [(vb, prod_b, 5, "2.00")])
    lote_c = await _lote(db, tenant_id, [(vc, prod_c, 3, "2.00")])
    item_c = (await db.execute(select(EntryItem).where(EntryItem.entry_id == lote_c.id))).scalar_one()
    item_c.quantity_remaining = 0  # vendeu tudo
    await db.commit()

    await InventoryService(db).rebuild_all_from_fifo(tenant_id=tenant_id)
    await _carrega_variacoes(db, prod_a, prod_b, prod_c)
    statuses = await ProductService(db).get_products_status(tenant_id=tenant_id)
    by_id = {s.product_id: s for s in statuses}

    a, b, c = by_id[prod_a.id], by_id[prod_b.id], by_id[prod_c.id]
    assert a.never_stocked and not a.in_stock and not a.depleted
    assert b.in_stock and not b.never_stocked and not b.depleted and b.current_stock == 5
    assert c.depleted and not c.in_stock and not c.never_stocked and c.current_stock == 0
    assert a.sku and b.sku and c.sku  # SKU vem da primeira variação ativa


async def test_products_status_include_catalog_and_soft_delete(db: AsyncSession):
    tenant_id, _token, cat_id = await _loja(db)
    publicado, v1 = await _produto(db, tenant_id, cat_id, "Publicado")
    interno, v2 = await _produto(db, tenant_id, cat_id, "Interno")
    apagado, v3 = await _produto(db, tenant_id, cat_id, "Apagado")
    publicado.is_catalog = True
    interno.is_catalog = False
    apagado.is_catalog = True
    await _lote(db, tenant_id, [(v1, publicado, 2, "5.00"), (v2, interno, 2, "5.00"), (v3, apagado, 1, "6.00")])
    apagado.is_active = False  # soft delete
    await db.commit()

    await InventoryService(db).rebuild_all_from_fifo(tenant_id=tenant_id)
    await _carrega_variacoes(db, publicado, interno, apagado)
    service = ProductService(db)

    so_publicados = {s.product_id for s in await service.get_products_status(tenant_id=tenant_id, include_catalog=False)}
    assert publicado.id in so_publicados
    assert interno.id not in so_publicados   # não publicado fica de fora
    assert apagado.id not in so_publicados   # soft delete fora

    todos = {s.product_id for s in await service.get_products_status(tenant_id=tenant_id, include_catalog=True)}
    assert publicado.id in todos
    assert interno.id in todos               # admin vê também o não publicado
    assert apagado.id not in todos           # soft delete continua fora


async def test_status_em_sessao_nova_nao_quebra(db: AsyncSession):
    tenant_id, _token, cat_id = await _loja(db)
    prod, _v = await _produto(db, tenant_id, cat_id, "Sem variações carregadas")
    await db.commit()
    db.expunge_all()  # como numa requisição nova: nada do produto em memória
    statuses = await ProductService(db).get_products_status(tenant_id=tenant_id, include_catalog=True)
    assert [s.product_id for s in statuses] == [prod.id]
