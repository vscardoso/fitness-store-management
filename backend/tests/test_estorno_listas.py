"""Devolução PARCIAL não é estorno da venda inteira: as telas mostram o que foi de fato devolvido (caso real: venda de
R$ 59,80 com estorno de R$ 39,89 aparecia como -R$ 59,80)."""
from datetime import date

import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _config
from tests.test_estorno_consistencia import _venda

pytestmark = pytest.mark.asyncio
API = "/api/v1"


async def test_venda_informa_quanto_foi_devolvido_e_o_relatorio_do_mes_nao_zera_a_venda(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    ano_mes = {"year": date.today().year, "month": date.today().month}
    sale_id, item_id = await _venda(test_client, h, p, va, 3)
    sem_devolucao, _ = await _venda(test_client, h, p, va, 1)

    r = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    assert r["refunded_amount"] == 0
    resumo0 = (await test_client.get(f"{API}/sales/reports/by-period", params=ano_mes, headers=h)).json()["summary"]
    assert resumo0["total_sales"] == 400 and resumo0["estorno_count"] == 0 and resumo0["net_sales"] == 400

    # devolve 1 das 3 peças (R$ 100 de R$ 300)
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "não serviu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text

    d = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    assert d["status"] == "partially_refunded" and float(d["total_amount"]) == 300 and d["refunded_amount"] == 100
    lista = (await test_client.get(f"{API}/sales/", params={"limit": 50}, headers=h)).json()
    assert next(x for x in lista if x["id"] == sale_id)["refunded_amount"] == 100
    assert next(x for x in lista if x["id"] == sem_devolucao)["refunded_amount"] == 0
    hoje = date.today().isoformat()
    por_data = (await test_client.get(f"{API}/sales/", params={"start_date": hoje, "end_date": hoje, "limit": 50}, headers=h)).json()
    assert next(x for x in por_data if x["id"] == sale_id)["refunded_amount"] == 100

    rel = (await test_client.get(f"{API}/sales/reports/by-period", params=ano_mes, headers=h)).json()
    s = rel["summary"]
    # a venda parcialmente devolvida CONTINUA valendo (R$ 300 bruto); só os R$ 100 devolvidos são estorno
    assert s["total_sales"] == 400 and s["total_count"] == 2
    assert s["estorno_count"] == 1 and s["estorno_amount"] == 100 and s["net_sales"] == 300
    assert s["average_ticket"] == 150
    assert next(x for x in rel["sales"] if x["id"] == sale_id)["refunded_amount"] == 100

    # devolve o resto: venda devolvida por inteiro
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "desistiu", "items": [{"sale_item_id": item_id, "quantity": 2}]})
    assert r.status_code == 201, r.text
    d = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    assert d["status"] == "refunded" and d["refunded_amount"] == 300
    s = (await test_client.get(f"{API}/sales/reports/by-period", params=ano_mes, headers=h)).json()["summary"]
    assert s["estorno_amount"] == 300 and s["net_sales"] == 100

    # venda cancelada não é estorno: fica à parte
    r = await test_client.post(f"{API}/sales/{sem_devolucao}/cancel?reason=teste", headers=h)
    assert r.status_code == 200
    s = (await test_client.get(f"{API}/sales/reports/by-period", params=ano_mes, headers=h)).json()["summary"]
    assert s["cancelled_count"] == 1 and s["cancelled_amount"] == 100
    assert s["total_sales"] == 300 and s["net_sales"] == 0


async def test_rentabilidade_da_venda_com_devolucao_e_liquida(test_client, async_session, test_user):
    """Custo, lucro e margem do detalhe da venda descontam o que foi devolvido (antes mostravam a venda inteira)."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)          # custo 40, preço 100
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    sale_id, item_id = await _venda(test_client, h, p, va, 3)

    def conta(d):
        return d["total_cost"], d["total_profit"], d["profit_margin_percent"]

    d = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    assert conta(d) == (120.0, 180.0, 60.0) and d["items"][0]["quantity_returned"] == 0

    # devolve 1 das 3 (volta ao estoque): fica 2 peças, R$ 200 vendidos, R$ 80 de custo, R$ 120 de lucro, 60%
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={"reason": "teste", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    d = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    assert conta(d) == (80.0, 120.0, 60.0), d
    it = d["items"][0]
    assert it["quantity_returned"] == 1 and it["profit"] == 120.0 and it["margin_percent"] == 60.0
    # a lista traz a mesma conta
    lista = (await test_client.get(f"{API}/sales/", params={"limit": 50}, headers=h)).json()
    assert conta(next(x for x in lista if x["id"] == sale_id)) == (80.0, 120.0, 60.0)

    # devolve as 2 que sobraram: venda sem custo e sem lucro
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={"reason": "teste", "items": [{"sale_item_id": item_id, "quantity": 2}]})
    assert r.status_code == 201, r.text
    d = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    assert conta(d) == (0.0, 0.0, 0.0) and d["items"][0]["margin_percent"] == 0.0


async def test_rentabilidade_peca_com_defeito_continua_como_custo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    sale_id, item_id = await _venda(test_client, h, p, va, 2)
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "rasgada", "items": [{"sale_item_id": item_id, "quantity": 1, "restock": False}]})
    assert r.status_code == 201, r.text
    d = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    # devolveu R$ 100 mas a peça não voltou: os dois custos (R$ 80) continuam, receita líquida R$ 100, lucro R$ 20
    assert (d["total_cost"], d["total_profit"], d["profit_margin_percent"]) == (80.0, 20.0, 20.0), d


async def test_vendedor_nao_ve_custo_devolvido(test_client, async_session, test_user):
    from app.models.user import UserRole
    from tests.test_short_codes import _user
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _venda(test_client, h, p, va, 2)
    await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={"reason": "teste", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    vend = await _user(async_session, t_id, UserRole.SELLER)
    d = (await test_client.get(f"{API}/sales/{sale_id}", headers=vend)).json()
    assert d["total_cost"] is None and d["total_profit"] is None and d["items"][0]["cost_returned"] is None
