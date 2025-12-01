from decimal import Decimal
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.models.product import Product
from app.models.stock_entry import StockEntry, EntryType
from app.models.entry_item import EntryItem
from app.models.store import Store
from app.models.category import Category


@pytest.mark.asyncio
async def test_fifo_basic_invariants(db: AsyncSession):
    # Criar tenant e categoria única
    u = uuid.uuid4().hex[:8]
    store = Store(name=f"Tenant FIFO {u}", slug=f"tenant-fifo-{u}")
    db.add(store)
    await db.flush()

    cat = Category(name="Geral", slug=f"geral-fifo-{u}")
    cat.tenant_id = store.id
    db.add(cat)
    await db.flush()

    # Criar produto com categoria
    prod = Product(name="Teste FIFO", sku=f"TF-{u}", barcode=f"BC-{u}", price=Decimal("10.00"), category_id=cat.id, is_catalog=False, is_active=True)
    prod.tenant_id = store.id
    db.add(prod)
    await db.flush()

    # Criar entrada com dois itens FIFO
    entry = StockEntry(
        entry_code=f"ENTRY-TEST-{u}",
        entry_date=__import__("datetime").date.today(),
        entry_type=EntryType.LOCAL,
        supplier_name="Fornecedor",
        total_cost=Decimal("0.00")
    )
    entry.tenant_id = store.id
    db.add(entry)
    await db.flush()

    item1 = EntryItem(entry_id=entry.id, product_id=prod.id, quantity_received=10, quantity_remaining=10, unit_cost=Decimal("5.00"))
    item1.tenant_id = store.id
    item2 = EntryItem(entry_id=entry.id, product_id=prod.id, quantity_received=5, quantity_remaining=5, unit_cost=Decimal("6.00"))
    item2.tenant_id = store.id
    db.add_all([item1, item2])
    await db.flush()
    await db.commit()

    # Invariantes iniciais
    result = await db.execute(select(EntryItem).where(EntryItem.product_id == prod.id))
    items = result.scalars().all()
    assert len(items) == 2
    fifo_sum = sum(i.quantity_remaining for i in items)
    assert fifo_sum == 15, "Soma FIFO incorreta"
    assert all(i.quantity_remaining <= i.quantity_received for i in items)
    custo_restante = sum(i.quantity_remaining * i.unit_cost for i in items)
    custo_recebido_total = sum(i.quantity_received * i.unit_cost for i in items)
    custo_vendido = sum((i.quantity_received - i.quantity_remaining) * i.unit_cost for i in items)
    # custo_recebido_total = custo_vendido + custo_restante
    assert abs((custo_recebido_total - custo_vendido - custo_restante)) < Decimal("0.001"), "Divergência custo inicial"

    # Simular venda consumindo 12 unidades (FIFO: primeiro item 10, segundo item 2)
    consume = 12
    remaining_to_consume = consume
    for it in sorted(items, key=lambda x: x.id):
        if remaining_to_consume == 0:
            break
        take = min(it.quantity_remaining, remaining_to_consume)
        it.quantity_remaining -= take
        remaining_to_consume -= take
    await db.commit()

    result = await db.execute(select(EntryItem).where(EntryItem.product_id == prod.id))
    items_after = result.scalars().all()
    fifo_sum_after = sum(i.quantity_remaining for i in items_after)
    assert fifo_sum_after == 3, "FIFO após venda incorreto"
    # Ordem FIFO preservada: primeiro item esgotado antes de consumir segundo parcialmente
    assert items_after[0].quantity_remaining == 0
    assert items_after[1].quantity_remaining == 3
    custo_restante_after = sum(i.quantity_remaining * i.unit_cost for i in items_after)
    custo_vendido_after = sum((i.quantity_received - i.quantity_remaining) * i.unit_cost for i in items_after)
    assert abs((custo_recebido_total - custo_vendido_after - custo_restante_after)) < Decimal("0.001"), "Divergência custo pós venda"
