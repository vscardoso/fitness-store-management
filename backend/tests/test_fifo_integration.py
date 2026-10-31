"""
FIFO Integration Tests - fluxo de compra e venda com controle FIFO no modelo atual.

Produto + variação + EntryItem por variação. O saldo do estoque é sempre a soma de
EntryItem.quantity_remaining (Inventory.quantity nunca é atualizado à mão). O custo da venda
é o custo posto: unit_cost + extra_unit_cost (rateio de viagem/despesas do lote).
"""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entry_item import EntryItem
from app.services import lot_cost_service
from app.services.fifo_service import FIFOService
from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto, _viagem  # noqa: F401

pytestmark = pytest.mark.asyncio
D = Decimal


async def _saldo(db: AsyncSession, variant_id: int) -> int:
    """Estoque da variação = soma de quantity_remaining dos itens de entrada."""
    return (await db.execute(
        select(func.coalesce(func.sum(EntryItem.quantity_remaining), 0)).where(EntryItem.variant_id == variant_id)
    )).scalar()


async def test_fifo_real_workflow(async_session: AsyncSession, test_user):
    """3 lotes em datas diferentes, venda de 120 consome do mais antigo, cancelamento devolve."""
    t_id, _token, cat = await _loja_api(async_session, test_user)
    product, variant = await _produto(async_session, t_id, cat, "Legging Fitness Preta", "150.00")
    e1 = await _lote(async_session, t_id, [(variant, product, 100, "50.00")], entry_date=date(2025, 1, 1))
    e2 = await _lote(async_session, t_id, [(variant, product, 50, "45.00")], entry_date=date(2025, 2, 1))
    e3 = await _lote(async_session, t_id, [(variant, product, 75, "48.00")], entry_date=date(2025, 3, 1))
    await async_session.commit()
    items = {}
    for k, e in (("1", e1), ("2", e2), ("3", e3)):
        items[k] = (await async_session.execute(select(EntryItem).where(EntryItem.entry_id == e.id))).scalar_one()
    fifo = FIFOService(async_session)

    assert await _saldo(async_session, variant.id) == 225, "Estoque inicial deve ser 225 unidades"

    sources = await fifo.process_sale(product.id, 120, variant_id=variant.id, tenant_id=t_id)

    assert [(s["entry_item_id"], s["quantity_taken"]) for s in sources] == [(items["1"].id, 100), (items["2"].id, 20)]
    assert all(s["entry_item_id"] != items["3"].id for s in sources), "Lote mais recente não pode ser tocado"
    for it in items.values():
        await async_session.refresh(it)
    assert (items["1"].quantity_remaining, items["2"].quantity_remaining, items["3"].quantity_remaining) == (0, 30, 75)
    assert await _saldo(async_session, variant.id) == 105, "225 - 120"

    assert await fifo.reverse_sale(sources) is True
    for it in items.values():
        await async_session.refresh(it)
    assert (items["1"].quantity_remaining, items["2"].quantity_remaining, items["3"].quantity_remaining) == (100, 50, 75)
    assert await _saldo(async_session, variant.id) == 225


async def test_fifo_multiple_products_same_sale(async_session: AsyncSession, test_user):
    """Dois produtos na mesma venda: cada um baixa só do próprio lote."""
    t_id, _token, cat = await _loja_api(async_session, test_user)
    p1, v1 = await _produto(async_session, t_id, cat, "Faixa de Cabeça", "30.00")
    p2, v2 = await _produto(async_session, t_id, cat, "Toalha Fitness", "40.00")
    e = await _lote(async_session, t_id, [(v1, p1, 50, "30.00"), (v2, p2, 50, "40.00")], entry_date=date(2025, 1, 1))
    await async_session.commit()
    fifo = FIFOService(async_session)

    s1 = await fifo.process_sale(p1.id, 20, variant_id=v1.id, tenant_id=t_id)
    s2 = await fifo.process_sale(p2.id, 10, variant_id=v2.id, tenant_id=t_id)

    assert len(s1) == 1 and s1[0]["quantity_taken"] == 20
    assert len(s2) == 1 and s2[0]["quantity_taken"] == 10
    assert s1[0]["entry_item_id"] != s2[0]["entry_item_id"]
    assert await _saldo(async_session, v1.id) == 30
    assert await _saldo(async_session, v2.id) == 40


async def test_fifo_insufficient_stock_error(async_session: AsyncSession, test_user):
    """Pedir mais que o saldo falha e não baixa nada."""
    t_id, _token, cat = await _loja_api(async_session, test_user)
    product, variant = await _produto(async_session, t_id, cat, "Whey Protein", "120.00")
    await _lote(async_session, t_id, [(variant, product, 10, "100.00")], entry_date=date(2025, 1, 1))
    await async_session.commit()

    with pytest.raises(ValueError, match="Insufficient stock"):
        await FIFOService(async_session).process_sale(product.id, 50, variant_id=variant.id, tenant_id=t_id)
    assert await _saldo(async_session, variant.id) == 10


async def test_fifo_cost_calculation(async_session: AsyncSession, test_user):
    """CMV FIFO sem rateio: (10 x 40) + (5 x 50) = 650; lucro 1200 - 650 = 550."""
    t_id, _token, cat = await _loja_api(async_session, test_user)
    product, variant = await _produto(async_session, t_id, cat, "Halteres 5kg", "80.00")
    await _lote(async_session, t_id, [(variant, product, 10, "40.00")], entry_date=date(2025, 1, 1))
    await _lote(async_session, t_id, [(variant, product, 10, "50.00")], entry_date=date(2025, 2, 1))
    await async_session.commit()

    sources = await FIFOService(async_session).process_sale(product.id, 15, variant_id=variant.id, tenant_id=t_id)

    cmv = sum(D(str(s["quantity_taken"])) * D(str(s["unit_cost"])) for s in sources)
    assert cmv == D("650.00"), f"CMV deve ser 650.00, mas foi {cmv}"
    gross_profit = D("1200.00") - cmv
    assert gross_profit == D("550.00")
    margin = gross_profit / D("1200.00") * 100
    assert 45 < margin < 46


async def test_fifo_cost_is_landed_cost_with_trip_share(async_session: AsyncSession, test_user):
    """Com viagem de R$ 1.000 sobre 100 peças a R$ 100, o custo da venda é o custo posto (110 por peça), não 100."""
    t_id, _token, cat = await _loja_api(async_session, test_user)
    product, variant = await _produto(async_session, t_id, cat, "Legging Viagem", "200.00")
    trip = await _viagem(async_session, t_id, fuel=1000)
    lote = await _lote(async_session, t_id, [(variant, product, 100, "100.00")], trip=trip)
    await lot_cost_service.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    await async_session.commit()

    sources = await FIFOService(async_session).process_sale(product.id, 10, variant_id=variant.id, tenant_id=t_id)

    assert sources[0]["merchandise_unit_cost"] == 100.0
    assert sources[0]["extra_unit_cost"] == 10.0
    assert sources[0]["unit_cost"] == 110.0
    assert sources[0]["total_cost"] == 1100.0
