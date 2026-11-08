"""Validação D-03 (parcela mínima R$ 1,00) e D-04 (caixa conta fiado em dinheiro pela data do recebimento)."""
from datetime import date, timedelta
from decimal import Decimal as D

import pytest

from tests.test_caixa import _abrir, _atual
from tests.test_fiado import _aberto, _cliente, _venda
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/receivables"
CASH = "/api/v1/cash"


def _fiado(valor, n=1):
    return [{"amount": valor, "payment_method": "on_account", "installments": n}]


async def _receber(c, h, cid, valor, **kw):
    r = await c.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": valor, "payment_method": "cash", **kw})
    assert r.status_code == 200, r.text


async def test_d03_bordas_de_parcela_minima(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _venda(test_client, h, p, va, cid, _fiado("12.00", 12), preco="12.00")
    assert r.status_code in (200, 201), r.text
    its = (await test_client.get(f"{API}?customer_id={cid}&status=all", headers=h)).json()["items"]
    assert len(its) == 12 and all(D(str(i["amount"])) == D("1.00") for i in its)
    r = await _venda(test_client, h, p, va, cid, _fiado("11.99", 12), preco="11.99")
    assert r.status_code == 400 and "R$ 1,00" in r.text and "vezes" in r.text, (r.status_code, r.text)
    r = await _venda(test_client, h, p, va, cid, _fiado("0.05", 1), preco="0.05")      # parcela única de qualquer valor
    assert r.status_code in (200, 201), r.text
    r = await _venda(test_client, h, p, va, cid, _fiado("0.05", 2), preco="0.05")
    assert r.status_code == 400
    r = await _venda(test_client, h, p, va, cid, _fiado("1.99", 2), preco="1.99")      # 0,99 < 1,00
    assert r.status_code == 400
    r = await _venda(test_client, h, p, va, cid, _fiado("2.00", 2), preco="2.00")
    assert r.status_code in (200, 201), r.text
    # as vendas recusadas não deixaram parcela nem tiraram estoque
    from tests.test_troca import _estoque
    assert await _estoque(async_session, va.id) == 10 - 3
    assert (await _aberto(test_client, h, cid))["summary"]["installments"] == 12 + 1 + 2


async def test_d04_dois_turnos_no_mesmo_dia_nao_contam_o_mesmo_recebimento_duas_vezes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    await _venda(test_client, h, p, va, cid, _fiado("100.00", 2), preco="100.00")
    await _abrir(test_client, h, "50.00")
    await _receber(test_client, h, cid, "30.00")
    a = (await _atual(test_client, h))["session"]
    assert a["receivables_cash"] == 30.0 and a["expected_amount"] == 80.0
    f = (await test_client.post(f"{CASH}/close", headers=h, json={"counted_amount": 80})).json()
    assert f["difference"] == 0.0
    await _abrir(test_client, h, "80.00")                      # 2º turno do mesmo dia, gaveta começa com os 80 contados
    b = (await _atual(test_client, h))["session"]
    assert b["receivables_cash"] == 0.0, b                      # os 30 já foram do turno 1
    assert b["expected_amount"] == 80.0, b


async def test_d04_dois_turnos_o_recebimento_vai_so_para_o_turno_em_que_aconteceu(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    await _venda(test_client, h, p, va, cid, _fiado("100.00", 2), preco="100.00")
    await _abrir(test_client, h, "0")
    await test_client.post(f"{CASH}/close", headers=h, json={"counted_amount": 0})
    await _abrir(test_client, h, "0")
    await _receber(test_client, h, cid, "20.00")               # acontece no turno 2
    s2 = (await _atual(test_client, h))["session"]
    assert s2["receivables_cash"] == 20.0
    hist = (await test_client.get(f"{CASH}/sessions", headers=h)).json()
    turno1 = next(x for x in hist if x["status"] == "closed")
    d1 = (await test_client.get(f"{CASH}/sessions/{turno1['id']}", headers=h)).json()
    assert d1["expected_amount"] == 0.0, d1                   # turno 1 já fechado não pode ganhar o dinheiro depois


async def test_d04_recebimento_retroativo_e_de_outro_mes_nao_entram_no_turno_de_hoje(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    await _venda(test_client, h, p, va, cid, _fiado("300.00", 3), preco="300.00")
    await _abrir(test_client, h, "10.00")
    await _receber(test_client, h, cid, "50.00", received_on=(date.today() - timedelta(days=1)).isoformat())
    await _receber(test_client, h, cid, "70.00", received_on=(date.today() - timedelta(days=45)).isoformat())
    s = (await _atual(test_client, h))["session"]
    assert s["receivables_cash"] == 0.0 and s["expected_amount"] == 10.0, s
    await _receber(test_client, h, cid, "5.00")                # hoje: entra
    s = (await _atual(test_client, h))["session"]
    assert s["receivables_cash"] == 5.0 and s["expected_amount"] == 15.0
    # PIX e recebimento desfeito não entram
    r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "9", "payment_method": "pix"})
    assert r.status_code == 200
    assert (await _atual(test_client, h))["session"]["receivables_cash"] == 5.0
