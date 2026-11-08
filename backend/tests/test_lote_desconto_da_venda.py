"""Desconto dado na VENDA inteira (sales.discount_amount) também reduz a receita de cada item.

Caso real (loja 2, 08/11/2026): três vendas com desconto na venda (R$ 89,94, R$ 32,97 e R$ 30,00) e os itens com desconto 0.
A tela Lucro por lote somava o preço cheio dos itens (R$ 309,71) em vez do que foi pago (R$ 156,80) e mostrava lucro de
R$ 191,71 em vez de R$ 38,80. Agora lote, Produtos mais vendidos e retorno da viagem usam a mesma regra do money_ledger."""
from datetime import date

import pytest

from app.services.money_ledger import period_totals
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _config

pytestmark = pytest.mark.asyncio
API = "/api/v1"


async def _vender_com_desconto(client, h, p, v, qtd, preco, desconto):
    total = float(preco) * qtd - float(desconto)
    r = await client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "discount_amount": str(desconto),
        "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": str(preco)}],
        "payments": [{"amount": str(total), "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"], r.json()["items"][0]["id"], total


async def test_lucro_do_lote_usa_o_que_a_cliente_pagou_e_bate_com_a_conta_unica(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)          # lote: 10 de A e 10 de B, custo 40, preço 100
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    from sqlalchemy import select
    from app.models.stock_entry import StockEntry
    entry_id = (await async_session.execute(select(StockEntry.id).where(StockEntry.tenant_id == t_id).order_by(StockEntry.id.desc()))).scalars().first()

    sale_id, item_id, pago = await _vender_com_desconto(test_client, h, p, va, 2, "100.00", "60.00")      # 200 - 60 = 140
    a = (await test_client.get(f"{API}/stock-entries/{entry_id}/analytics", headers=h)).json()
    assert pago == 140 and a["real_revenue"] == 140, a["real_revenue"]       # antes: 200
    assert a["cost_of_sold"] == 80 and a["gross_profit"] == 60

    # bate com a conta única do dinheiro (a mesma do início e do Resultado do Mês)
    hoje = date.today()
    led = await period_totals(async_session, t_id, hoje.replace(day=1), hoje)
    assert float(led.revenue) == a["real_revenue"] and float(led.profit) == a["gross_profit"]

    # devolve 1 das 2 peças: o estorno também respeita o desconto (R$ 70) e o lote acompanha
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "não serviu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    a = (await test_client.get(f"{API}/stock-entries/{entry_id}/analytics", headers=h)).json()
    assert a["real_revenue"] == 70 and a["cost_of_sold"] == 40 and a["gross_profit"] == 30
    led = await period_totals(async_session, t_id, hoje.replace(day=1), hoje)
    assert float(led.revenue) == 70 and float(led.profit) == 30


async def test_produtos_mais_vendidos_tambem_usa_o_valor_pago(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _vender_com_desconto(test_client, h, p, va, 2, "100.00", "60.00")
    r = await test_client.get(f"{API}/sales/reports/top-products", headers=h, params={"period": "this_month", "limit": 50})
    assert r.status_code == 200, r.text
    d = r.json()
    linha = next(x for x in d["products"] if x["product_id"] == p.id)
    assert linha["total_revenue"] == 140 and linha["total_profit"] == 60, linha     # antes: 200 e 120
    assert d["total_revenue"] >= 140
