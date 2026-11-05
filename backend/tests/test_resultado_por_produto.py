"""Resultado do mês por produto: soma dos produtos = receita e custo do Resultado do Mês (mesma conta)."""
from datetime import date

import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio


async def test_produtos_do_mes_somam_o_resultado(test_client, async_session, test_user):
    from tests.test_troca import _cenario, _vender
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _vender(test_client, h, p, va, 3, "100.00")                      # 3 x 100, custo 40 cada
    venda2, item2 = await _vender(test_client, h, p, vb, 2, "90.00")       # 2 x 90
    r = await test_client.post(f"/api/v1/returns/{venda2}", headers=h, json={
        "reason": "Não serviu", "refund_method": "cash", "items": [{"sale_item_id": item2, "quantity": 1}]})
    assert r.status_code == 201, r.text                                     # devolve 1 (volta ao estoque)

    hoje = date.today()
    q = f"year={hoje.year}&month={hoje.month}"
    res = (await test_client.get(f"/api/v1/expenses/resultado-mes?{q}", headers=h)).json()
    prods = (await test_client.get(f"/api/v1/expenses/resultado-mes/produtos?{q}", headers=h))
    assert prods.status_code == 200, prods.text
    prods = prods.json()
    meu = next(x for x in prods if x["product_id"] == p.id)
    assert meu["pieces_sold"] == 5 and meu["pieces_returned"] == 1 and meu["pieces_net"] == 4
    assert meu["revenue"] == 300.0 + 180.0 - 90.0
    assert meu["cost"] == 40.0 * 4 and meu["profit"] == 390.0 - 160.0
    assert meu["average_price"] == 96.0 and meu["average_cost"] == 40.0
    # a soma de todos os produtos bate com o resultado do mês
    assert round(sum(x["revenue"] for x in prods), 2) == round(float(res["revenue"]), 2)
    assert round(sum(x["cost"] for x in prods), 2) == round(float(res["cmv"]), 2)
