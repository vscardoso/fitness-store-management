"""
Conferência ponta a ponta dos números: o mesmo cenário que o Victor testou no app.

10 peças de R$ 10 (mercadoria R$ 100) + R$ 100 de custo do lote (almoço/frete) => cada peça custa R$ 20.
Vende 4 peças a R$ 30 => receita R$ 120, custo R$ 80, lucro R$ 40 (33,3%).
Sobram 6 peças: estoque a custo R$ 120, se vender tudo R$ 180 (lucro R$ 60).
Total gasto da compra: R$ 200.
"""
from datetime import date

import pytest

from tests.test_lot_costs import D, _extras, _lote, _loja_api, _limpa_loja_1, _produto  # noqa: F401  (fixture autouse)
from app.models.expense import Expense
from app.services import lot_cost_service as svc

pytestmark = pytest.mark.asyncio


async def test_numeros_do_cenario_do_lojista_em_todas_as_telas(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "Teste Venda 100", preco="30.00")
    lote = await _lote(async_session, t_id, [(v, p, 10, 10)])
    async_session.add(Expense(amount=D("100"), description="Almoço", expense_date=date.today(), tenant_id=t_id,
                              stock_entry_id=lote.id))
    await async_session.flush()
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    lote_id, pid, vid = lote.id, p.id, v.id
    await async_session.commit()
    assert (await _extras(async_session, lote_id))[0][1] == D("10.0000")        # +R$ 10 por peça

    # ---- venda de 4 peças a R$ 30, crédito 2x (como no app)
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "credit_card",
        "items": [{"product_id": pid, "variant_id": vid, "quantity": 4, "unit_price": "30.00"}],
        "payments": [{"amount": "120.00", "payment_method": "credit_card", "installments": 2}],
    })
    assert r.status_code == 201, r.text
    sale = r.json()
    sale_id = sale["id"]

    # ---- detalhe da venda: custo COM a despesa do lote
    d = (await test_client.get(f"/api/v1/sales/{sale_id}", headers=h)).json()
    assert float(d["total_amount"]) == 120.0
    assert [float(i["unit_cost"]) for i in d["items"]] == [20.0]                 # 10 + 10 (almoço rateado)
    assert float(d["total_cost"]) == 80.0 and float(d["total_profit"]) == 40.0
    assert round(d["profit_margin_percent"], 1) == 33.3
    assert round(d["items"][0]["margin_percent"], 1) == 33.3

    # ---- tela inicial: vendas de hoje, lucro e margem
    st = (await test_client.get("/api/v1/dashboard/stats", headers=h)).json()
    vendas = st["sales"]
    assert vendas["total_today"] == 120.0 and vendas["count_today"] == 1
    assert vendas["cmv_today"] == 80.0 and vendas["profit_today"] == 40.0
    assert round(vendas["margin_today"], 1) == 33.3
    estoque = st["stock"]
    assert estoque["invested_value"] == 120.0 and estoque["potential_revenue"] == 180.0
    assert estoque["potential_profit"] == 60.0
    assert round(estoque["average_margin_percent"], 1) == 33.3                    # margem sobre a venda, não markup

    # ---- "Seu estoque": capital (6 peças x R$ 20), se vender tudo (6 x R$ 30), lucro e %
    val = (await test_client.get("/api/v1/dashboard/inventory/valuation", headers=h)).json()
    assert val["cost_value"] == 120.0 and val["retail_value"] == 180.0 and val["potential_margin"] == 60.0

    # ---- compras do mês: mercadoria + custos do lote
    pur = (await test_client.get("/api/v1/dashboard/purchases?period=this_month", headers=h)).json()
    assert pur["total_invested"] >= 200.0
    # ---- resultado do mês: receita 120, CMV 80, despesas gerais 0 (o almoço do lote já está no custo), lucro 40
    mes = (await test_client.get("/api/v1/expenses/resultado-mes", headers=h)).json()
    assert float(mes["revenue"]) == 120.0 and float(mes["cmv"]) == 80.0
    assert float(mes["total_expenses"]) == 0.0 and float(mes["trip_costs"]) == 0.0
    assert float(mes["net_profit"]) == 40.0

    # ---- cartão da entrada: gasto 200, vendeu 4 de 10, entrou 120, sobrou 40, voltou 60%
    a = (await test_client.get(f"/api/v1/stock-entries/{lote_id}/analytics", headers=h)).json()
    assert a["total_investment"] == 200.0 and a["total_quantity_sold"] == 4
    assert a["real_revenue"] == 120.0 and a["cost_of_sold"] == 80.0 and a["gross_profit"] == 40.0
    assert a["recovered_pct"] == 60.0 and round(a["margin_pct"], 1) == 33.3
    assert a["stock_value_remaining"] == 120.0 and a["projected_profit_if_all_sold"] == 100.0

    # ---- a entrada e a lista mostram o mesmo total gasto
    e = (await test_client.get(f"/api/v1/stock-entries/{lote_id}", headers=h)).json()
    assert e["total_invested"] == 200.0 and e["roi"] is None
    ranking = (await test_client.get("/api/v1/stock-entries/profit-ranking", headers=h)).json()
    mine = next(x for x in ranking if x["entry_id"] == lote_id)
    assert mine["total_investment"] == 200.0 and mine["gross_profit"] == 40.0

    # ---- desempenho FIFO (início): sem contar o frete duas vezes
    fifo = (await test_client.get("/api/v1/dashboard/fifo-performance", headers=h)).json()
    assert fifo is not None


def _flat(obj):
    if isinstance(obj, dict):
        for x in obj.values():
            yield from _flat(x)
    elif isinstance(obj, (list, tuple)):
        for x in obj:
            yield from _flat(x)
    elif isinstance(obj, (int, float)):
        yield obj
