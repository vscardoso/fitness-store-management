"""Financeiro: corrigir valores já lançados no lugar (transferência, conta a pagar, retirada e empréstimo).
O saldo é calculado na hora, então corrigir o valor tem que mexer no saldo e nunca deixar gaveta ou maquininha negativa."""
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models.expense import Expense
from tests.test_financeiro import _implantar, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"


async def _saldos(client, h):
    d = (await client.get(f"{API}/accounts", headers=h)).json()
    return {a["name"]: a["balance"] for a in d["accounts"]}


async def _ids(client, h):
    d = (await client.get(f"{API}/accounts", headers=h)).json()
    return {a["name"]: a["id"] for a in d["accounts"]}


async def test_corrigir_transferencia_mexe_no_saldo_e_nunca_negativa_a_gaveta(test_client, async_session, test_user):
    t_id, h, *_ = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h)).status_code == 200
    ids = await _ids(test_client, h)
    r = await test_client.post(f"{API}/transfers", headers=h, json={
        "from_account_id": ids["Gaveta"], "to_account_id": ids["Nubank"], "amount": "100.00"})
    assert r.status_code == 200, r.text
    tid = (await test_client.get(f"{API}/transfers", headers=h)).json()[0]["id"]
    s = await _saldos(test_client, h)
    assert (s["Gaveta"], s["Nubank"]) == (50.0, 1100.0)

    r = await test_client.patch(f"{API}/transfers/{tid}", headers=h, json={"amount": "60.00", "description": "Depósito de sexta"})
    assert r.status_code == 200, r.text
    s = await _saldos(test_client, h)
    assert (s["Gaveta"], s["Nubank"]) == (90.0, 1060.0)           # o saldo acompanhou o valor corrigido
    assert (await test_client.get(f"{API}/transfers", headers=h)).json()[0]["description"] == "Depósito de sexta"

    # a gaveta tinha 150: tirar 200 dela deixaria negativa -> recusa e NADA muda
    r = await test_client.patch(f"{API}/transfers/{tid}", headers=h, json={"amount": "200.00"})
    assert r.status_code == 400 and "negativa" in r.json()["detail"]
    s = await _saldos(test_client, h)
    assert (s["Gaveta"], s["Nubank"]) == (90.0, 1060.0)
    # data antes do começo da contagem e valor zero são recusados
    antes = (date.today() - timedelta(days=30)).isoformat()
    assert (await test_client.patch(f"{API}/transfers/{tid}", headers=h, json={"occurred_on": antes})).status_code == 400
    assert (await test_client.patch(f"{API}/transfers/{tid}", headers=h, json={"amount": "0"})).status_code == 400
    assert (await test_client.patch(f"{API}/transfers/999999", headers=h, json={"amount": "10"})).status_code == 404


async def test_corrigir_conta_a_pagar_acompanha_a_despesa_e_o_dinheiro(test_client, async_session, test_user):
    t_id, h, *_ = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h)).status_code == 200
    ids = await _ids(test_client, h)
    venc = (date.today() + timedelta(days=3)).isoformat()
    p = (await test_client.post(f"{API}/payables", headers=h, json={
        "description": "Energia", "amount": "200.00", "due_date": venc, "counts_as_expense": True})).json()

    # em aberto: muda tudo
    r = await test_client.patch(f"{API}/payables/{p['id']}", headers=h, json={
        "description": "Energia de outubro", "amount": "230.00", "due_date": (date.today() + timedelta(days=6)).isoformat(),
        "notes": "segunda via"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert (j["description"], j["amount"], j["notes"]) == ("Energia de outubro", 230.0, "segunda via")

    # paga: o valor corrigido sai da conta e a despesa do mês acompanha
    assert (await test_client.post(f"{API}/payables/{p['id']}/pay", headers=h, json={"account_id": ids["Nubank"]})).status_code == 200
    s = await _saldos(test_client, h)
    assert s["Nubank"] == 770.0                                   # 1000 - 230
    r = await test_client.patch(f"{API}/payables/{p['id']}", headers=h, json={"amount": "210.50"})
    assert r.status_code == 200, r.text
    s = await _saldos(test_client, h)
    assert s["Nubank"] == 789.5                                   # 1000 - 210,50
    gastos = (await async_session.execute(select(Expense.amount).where(
        Expense.payable_id == p["id"], Expense.is_active == True))).scalars().all()  # noqa: E712
    assert [float(x) for x in gastos] == [210.5]
    # texto vazio e valor inválido são recusados; cancelada não muda
    assert (await test_client.patch(f"{API}/payables/{p['id']}", headers=h, json={"description": "  "})).status_code == 400
    assert (await test_client.patch(f"{API}/payables/{p['id']}", headers=h, json={"amount": "-5"})).status_code == 400
    q = (await test_client.post(f"{API}/payables", headers=h, json={"description": "Cancelar", "amount": "10", "due_date": venc})).json()
    await test_client.post(f"{API}/payables/{q['id']}/cancel", headers=h)
    assert (await test_client.patch(f"{API}/payables/{q['id']}", headers=h, json={"amount": "11"})).status_code == 409


async def test_corrigir_retirada_e_emprestimo_respeita_o_que_ja_foi_pago(test_client, async_session, test_user):
    t_id, h, *_ = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h)).status_code == 200
    ids = await _ids(test_client, h)
    hoje = date.today().isoformat()

    ret = (await test_client.post(f"{API}/entries", headers=h, json={
        "kind": "owner_withdrawal", "account_id": ids["Nubank"], "amount": "100.00", "person": "Ana"})).json()
    r = await test_client.patch(f"{API}/entries/{ret['id']}", headers=h, json={"amount": "70.00", "description": "Retirada de sexta"})
    assert r.status_code == 200, r.text
    s = await _saldos(test_client, h)
    assert s["Nubank"] == 930.0                                   # 1000 - 70
    # sócio é obrigatório na retirada
    assert (await test_client.patch(f"{API}/entries/{ret['id']}", headers=h, json={"person": ""})).status_code == 400
    # gaveta nunca fica negativa: mudar a retirada para uma conta que não aguenta é recusado
    r = await test_client.patch(f"{API}/entries/{ret['id']}", headers=h, json={"account_id": ids["Gaveta"], "amount": "400"})
    assert r.status_code == 400 and "negativa" in r.json()["detail"]
    s = await _saldos(test_client, h)
    assert (s["Gaveta"], s["Nubank"]) == (150.0, 930.0)

    # empréstimo: dei 200 e recebi 150 de volta
    dado = (await test_client.post(f"{API}/entries", headers=h, json={
        "kind": "loan_given", "account_id": ids["Nubank"], "amount": "200.00", "person": "Bia", "occurred_on": hoje})).json()
    volta = (await test_client.post(f"{API}/entries", headers=h, json={
        "kind": "loan_repaid", "account_id": ids["Nubank"], "amount": "150.00", "person": "Bia", "occurred_on": hoje})).json()
    r = await test_client.patch(f"{API}/entries/{dado['id']}", headers=h, json={"amount": "100.00"})
    assert r.status_code == 400 and "pagos" in r.json()["detail"]                 # já voltaram 150
    r = await test_client.patch(f"{API}/entries/{volta['id']}", headers=h, json={"amount": "250.00"})
    assert r.status_code == 400 and "em aberto" in r.json()["detail"]             # só deve 200
    assert (await test_client.patch(f"{API}/entries/{volta['id']}", headers=h, json={"amount": "200.00"})).status_code == 200
    assert (await test_client.patch(f"{API}/entries/{dado['id']}", headers=h, json={"amount": "300.00"})).status_code == 200
    # trocar a pessoa de um empréstimo não pode (muda o saldo de duas pessoas)
    r = await test_client.patch(f"{API}/entries/{dado['id']}", headers=h, json={"person": "Carla"})
    assert r.status_code == 400 and "apague" in r.json()["detail"]
    loans = (await test_client.get(f"{API}/loans", headers=h)).json()
    bia = next(x for x in loans["people"] if x["person"] == "Bia")
    assert bia["to_receive"] == 100.0                                             # 300 dados - 200 devolvidos
    assert (await test_client.patch(f"{API}/entries/999999", headers=h, json={"amount": "1"})).status_code == 404
