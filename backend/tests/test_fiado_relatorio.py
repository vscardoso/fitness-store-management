"""Fiado no relatório de vendas x tela Fiado: as duas contas têm que fechar uma com a outra.

Caso real (loja 2, 19/11/2026): o relatório mostrava "Fiado R$ 4.307,13 (12 vendas)" e a tela Fiado "A receber R$ 5.501,63".
Os dois estavam certos e eram coisas diferentes: o relatório conta o que foi VENDIDO no fiado no período; a tela conta o que FALTA
receber de tudo, inclusive o fiado anterior ao app (sem venda). 4.307,13 - 50,00 recebido - 94,90 devolvido = 4.162,23 que
falta das vendas; + 1.339,40 de fiado antigo = 5.501,63."""
from datetime import date, timedelta

import pytest

from tests.test_fiado import _aberto, _cliente, _venda
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
REC = "/api/v1/receivables"


def _linha(rep, forma):
    return next((b for b in rep["payment_breakdown"] if b["method"].lower() == forma), None)


async def test_linha_do_fiado_diz_quanto_foi_recebido_devolvido_e_quanto_falta(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ana = await _cliente(async_session, t_id, "Ana Fiado")
    bia = await _cliente(async_session, t_id, "Bia Fiado")
    antiga = await _cliente(async_session, t_id, "Antiga Fiado")

    # venda A: 2 peças a R$ 100 no fiado em 2 parcelas; venda B: 1 peça a R$ 100 no fiado; uma venda em PIX
    first = date.today() + timedelta(days=7)
    r = await _venda(test_client, h, p, va, ana, [{"amount": "200.00", "payment_method": "on_account", "installments": 2,
                                                    "first_due_date": first.isoformat()}], qtd=2)
    assert r.status_code in (200, 201), r.text
    r = await _venda(test_client, h, p, va, bia, [{"amount": "100.00", "payment_method": "on_account"}])
    assert r.status_code in (200, 201), r.text
    venda_b = r.json()
    r = await _venda(test_client, h, p, vb, None, [{"amount": "100.00", "payment_method": "pix"}])
    assert r.status_code in (200, 201), r.text

    # a Ana paga R$ 50; a venda da Bia volta inteira (devolução abate o fiado dela)
    r = await test_client.post(f"{REC}/receive", headers=h, json={"customer_id": ana, "amount": "50.00", "payment_method": "cash"})
    assert r.status_code == 200, r.text
    r = await test_client.post(f"/api/v1/returns/{venda_b['id']}", headers=h, json={
        "reason": "Não serviu", "items": [{"sale_item_id": venda_b["items"][0]["id"], "quantity": 1}]})
    assert r.status_code == 201, r.text

    # fiado anterior ao app (sem venda): não pode aparecer no relatório de vendas
    r = await test_client.post(f"{REC}/opening", headers=h, json={
        "customer_id": antiga, "description": "Caderno", "amount": "300,00", "due_date": (date.today() - timedelta(days=5)).isoformat()})
    assert r.status_code == 200, r.text

    rep = (await test_client.get("/api/v1/reports/sales?period=this_month", headers=h)).json()
    fiado = _linha(rep, "on_account")
    assert fiado is not None
    assert (float(fiado["total"]), fiado["count"]) == (300.0, 2)          # o que foi vendido no fiado no período
    sit = fiado["fiado"]
    assert (sit["received"], sit["returned"], sit["open"]) == (50.0, 100.0, 150.0)
    # fecha: vendido = recebido + devolvido + falta receber
    assert round(sit["received"] + sit["returned"] + sit["open"], 2) == float(fiado["total"])
    # só a linha do fiado traz essa situação
    assert _linha(rep, "pix")["fiado"] is None

    # tela Fiado: o total a receber é o que falta das vendas + o fiado anterior ao app
    s = (await test_client.get(f"{REC}/summary", headers=h)).json()
    assert s["open_from_sales"] == sit["open"] == 150.0
    assert s["open_from_opening"] == 300.0
    assert s["open_total"] == 450.0 == round(s["open_from_sales"] + s["open_from_opening"], 2)
    assert (await _aberto(test_client, h, ana))["summary"]["open_from_sales"] == 150.0


async def test_sem_fiado_no_periodo_a_linha_nem_existe(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await _venda(test_client, h, p, va, None, [{"amount": "100.00", "payment_method": "pix"}])
    assert r.status_code in (200, 201), r.text
    rep = (await test_client.get("/api/v1/reports/sales?period=this_month", headers=h)).json()
    assert _linha(rep, "on_account") is None
    s = (await test_client.get(f"{REC}/summary", headers=h)).json()
    assert (s["open_from_sales"], s["open_from_opening"], s["open_total"]) == (0, 0, 0)
