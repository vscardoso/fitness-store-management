"""Resultado do Mês: o que a tela recebe fecha com uma conta feita à parte (livro em Python, sem usar o serviço).

Fecha significa: vendeu - custo das peças - gastos - brindes = lucro do mês, e a lista por produto soma o mesmo
vendido e o mesmo custo. Casos: mês sem venda, desconto por peça, devolução parcial, venda cancelada, gasto e brinde
(o brinde do admin é linha própria; para quem não é admin passa para os gastos e a conta continua fechando).
"""
from datetime import date
from decimal import Decimal

import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_short_codes import _user
from tests.test_troca import _cenario, _config

pytestmark = pytest.mark.asyncio
API = "/api/v1"
D = Decimal
CUSTO = D("40.00")          # custo de cada peça no _cenario


async def _mes(client, h):
    hoje = date.today()
    p = {"year": hoje.year, "month": hoje.month}
    res = (await client.get(f"{API}/expenses/resultado-mes", params=p, headers=h)).json()
    prod = (await client.get(f"{API}/expenses/resultado-mes/produtos", params=p, headers=h))
    return res, prod


def _fecha(res):
    """A conta que a tela mostra: vendeu - custo - gastos - brindes = lucro do mês."""
    d = lambda k: D(str(res[k] or 0))
    return d("revenue") - d("cmv") - d("total_expenses") - d("gifts_total"), d("net_profit")


async def test_mes_sem_venda_e_zero_e_fecha(test_client, async_session, test_user):
    t_id, h, *_ = await _cenario(async_session, test_user)
    res, prod = await _mes(test_client, h)
    assert D(str(res["revenue"])) == 0 and D(str(res["cmv"])) == 0 and D(str(res["net_profit"])) == 0
    assert res["sales_count"] == 0 and res["units_sold"] == 0
    a, b = _fecha(res)
    assert a == b


async def test_conta_fecha_com_desconto_por_peca_devolucao_cancelada_gasto_e_brinde(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7, discount_mode="piece")

    # venda 1: 3 x R$ 100 com R$ 30 de desconto na linha (R$ 270 pagos)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 3, "unit_price": "100.00", "discount_amount": "30.00"}],
        "payments": [{"amount": "270.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    s1, item1 = r.json()["id"], r.json()["items"][0]["id"]
    # venda 2: 2 x R$ 100 sem desconto, depois cancelada (não conta em nada)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": vb.id, "quantity": 2, "unit_price": "100.00"}],
        "payments": [{"amount": "200.00", "payment_method": "cash"}]})
    s2 = r.json()["id"]
    assert (await test_client.post(f"{API}/sales/{s2}/cancel", params={"reason": "cliente desistiu"}, headers=h)).status_code in (200, 204)
    # devolução de 1 das 3 peças da venda 1 (volta ao estoque): devolve R$ 90 (preço pago pela peça)
    r = await test_client.post(f"{API}/returns/{s1}", headers=h, json={
        "reason": "não serviu", "items": [{"sale_item_id": item1, "quantity": 1}]})
    assert r.status_code == 201, r.text
    # gasto da loja de R$ 55,50 e brinde de 1 peça (custo R$ 40)
    hoje = date.today().isoformat()
    r = await test_client.post(f"{API}/expenses", headers=h, json={"amount": "55.50", "description": "Luz", "expense_date": hoje})
    assert r.status_code in (200, 201), r.text
    r = await test_client.post(f"{API}/gifts/", headers=h, json={
        "items": [{"variant_id": vb.id, "quantity": 1}], "reason_type": "promotion", "recipient_name": "Influenciadora Maria"})
    assert r.status_code == 201, r.text

    # livro independente
    vendeu = D("270.00") - D("90.00")                    # venda 1 menos a devolução
    custo = CUSTO * 3 - CUSTO * 1                        # 3 peças vendidas, 1 voltou ao estoque
    gastos, brindes = D("55.50"), CUSTO
    esperado = vendeu - custo - gastos - brindes

    res, prod = await _mes(test_client, h)
    assert D(str(res["revenue"])) == vendeu
    assert D(str(res["cmv"])) == custo
    assert D(str(res["total_expenses"])) == gastos and D(str(res["gifts_total"])) == brindes
    assert D(str(res["net_profit"])) == esperado
    a, b = _fecha(res)
    assert a == b == esperado
    assert res["sales_count"] == 1 and res["units_sold"] == 2

    # a lista por produto soma o mesmo vendido e o mesmo custo
    assert prod.status_code == 200
    linhas = prod.json()
    assert sum(D(str(x["revenue"])) for x in linhas).quantize(D("0.01")) == vendeu
    assert sum(D(str(x["cost"])) for x in linhas).quantize(D("0.01")) == custo
    assert sum(D(str(x["profit"])) for x in linhas).quantize(D("0.01")) == vendeu - custo

    # quem não é admin não vê brinde: vai para os gastos e o lucro e a conta continuam iguais
    from app.models.user import UserRole
    hm = await _user(async_session, t_id, UserRole.MANAGER)
    rm = await test_client.get(f"{API}/expenses/resultado-mes", params={"year": date.today().year, "month": date.today().month}, headers=hm)
    if rm.status_code == 200:
        res_m = rm.json()
        assert D(str(res_m["gifts_total"] or 0)) == 0
        assert D(str(res_m["total_expenses"])) == gastos + brindes
        a, b = _fecha(res_m)
        assert a == b == esperado


async def test_periodo_livre_entre_datas_bate_com_o_mes_e_recusa_datas_ruins(test_client, async_session, test_user):
    """Entre duas datas vale a mesma conta do mês; datas ruins dão 400 com frase clara e a lista por produto acompanha."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7, discount_mode="piece")
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 2, "unit_price": "100.00"}],
        "payments": [{"amount": "200.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text

    hoje = date.today()
    mes, _ = await _mes(test_client, h)
    ini = hoje.replace(day=1).isoformat()
    per = await test_client.get(f"{API}/expenses/resultado-periodo",
                                params={"start_date": ini, "end_date": hoje.isoformat()}, headers=h)
    assert per.status_code == 200, per.text
    per = per.json()
    for k in ("revenue", "cmv", "total_expenses", "net_profit", "sales_count", "units_sold"):
        assert D(str(per[k] or 0)) == D(str(mes[k] or 0)), k
    assert per["period_label"].count("/") == 4          # "01/11/2026 a 18/11/2026"

    prod = await test_client.get(f"{API}/expenses/resultado-mes/produtos",
                                 params={"start_date": ini, "end_date": hoje.isoformat()}, headers=h)
    assert prod.status_code == 200
    assert sum(D(str(x["revenue"])) for x in prod.json()) == D(str(per["revenue"]))

    # um dia sem venda (ontem do mês passado) é zero, e data final no futuro vira hoje
    antigo = date(hoje.year - 1, 1, 10).isoformat()
    vazio = (await test_client.get(f"{API}/expenses/resultado-periodo",
                                   params={"start_date": antigo, "end_date": antigo}, headers=h)).json()
    assert D(str(vazio["revenue"])) == 0
    fut = await test_client.get(f"{API}/expenses/resultado-periodo",
                                params={"start_date": ini, "end_date": "2999-01-01"}, headers=h)
    assert fut.status_code == 200 and D(str(fut.json()["revenue"])) == D(str(per["revenue"]))

    for params, trecho in [
        ({"start_date": ini}, "data inicial e a data final"),
        ({"start_date": hoje.isoformat(), "end_date": ini}, "depois da data final") if hoje.day > 1 else ({"start_date": "2999-01-01", "end_date": "2999-01-02"}, "ainda não chegou"),
        ({"start_date": "2999-01-01", "end_date": "2999-01-02"}, "ainda não chegou"),
        ({"start_date": date(hoje.year - 3, 1, 1).isoformat(), "end_date": hoje.isoformat()}, "no máximo 1 ano"),
    ]:
        bad = await test_client.get(f"{API}/expenses/resultado-periodo", params=params, headers=h)
        assert bad.status_code == 400 and trecho in bad.json()["detail"], (params, bad.text)
