"""Invariantes do FIFO: soma dos saldos, saldo <= recebido e recebido = vendido + restante (em custo)."""
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entry_item import EntryItem
from app.services.fifo_service import FIFOService
from tests.test_lot_costs import _loja, _lote, _produto

pytestmark = pytest.mark.asyncio


async def _items(db, variant_id):
    return (await db.execute(select(EntryItem).where(EntryItem.variant_id == variant_id).order_by(EntryItem.id))).scalars().all()


async def test_fifo_basic_invariants(db: AsyncSession):
    tenant_id, _token, cat_id = await _loja(db)
    prod, variant = await _produto(db, tenant_id, cat_id, "Teste FIFO", "10.00")
    # um lote com dois itens da mesma variação (10 a 5.00 e 5 a 6.00)
    await _lote(db, tenant_id, [(variant, prod, 10, "5.00"), (variant, prod, 5, "6.00")])
    await db.commit()

    # Invariantes iniciais
    items = await _items(db, variant.id)
    assert len(items) == 2
    assert sum(i.quantity_remaining for i in items) == 15, "Soma FIFO incorreta"
    assert all(i.quantity_remaining <= i.quantity_received for i in items)
    custo_restante = sum(i.quantity_remaining * i.landed_unit_cost for i in items)
    custo_recebido_total = sum(i.quantity_received * i.landed_unit_cost for i in items)
    custo_vendido = sum((i.quantity_received - i.quantity_remaining) * i.landed_unit_cost for i in items)
    assert abs(custo_recebido_total - custo_vendido - custo_restante) < Decimal("0.001"), "Divergência custo inicial"

    # Venda real de 12 unidades pelo FIFOService: 10 do primeiro item + 2 do segundo
    sources = await FIFOService(db).process_sale(prod.id, 12, variant_id=variant.id, tenant_id=tenant_id)
    await db.commit()
    assert [(s["entry_item_id"], s["quantity_taken"]) for s in sources] == [(items[0].id, 10), (items[1].id, 2)]

    items_after = await _items(db, variant.id)
    assert sum(i.quantity_remaining for i in items_after) == 3, "FIFO após venda incorreto"
    # Ordem FIFO preservada: primeiro item esgotado antes de consumir o segundo
    assert items_after[0].quantity_remaining == 0
    assert items_after[1].quantity_remaining == 3
    custo_restante_after = sum(i.quantity_remaining * i.landed_unit_cost for i in items_after)
    custo_vendido_after = sum((i.quantity_received - i.quantity_remaining) * i.landed_unit_cost for i in items_after)
    assert abs(custo_recebido_total - custo_vendido_after - custo_restante_after) < Decimal("0.001"), "Divergência custo pós venda"
    assert custo_vendido_after == Decimal("10") * Decimal("5.00") + Decimal("2") * Decimal("6.00")
