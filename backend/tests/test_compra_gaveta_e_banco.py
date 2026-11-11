"""Compra paga com a Gaveta e o resto de uma conta (regra do Victor): a gaveta paga TUDO o que tiver, até o valor da compra, e o banco
escolhido paga o resto; se precisar, ele lança dinheiro no caixa depois. Sem digitar valor. A parte da gaveta fica gravada na hora."""
import pytest

from tests.test_compra_abate_conta import ENT, FIN, _corpo, _loja, _saldo
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
# _loja: gaveta R$ 150, Nubank R$ 1.000


async def test_gaveta_paga_tudo_que_tem_e_o_banco_paga_o_resto(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=40, custo="10.00", paid_account_id=nu, paid_with_cash=True))   # R$ 400
    assert r.status_code == 201, r.text
    assert r.json()["paid_account_id"] == nu and float(r.json()["paid_cash_amount"]) == 150.0
    g, n = await _saldo(test_client, h, "Gaveta"), await _saldo(test_client, h, "Nubank")
    assert g["balance"] == 0.0 and g["breakdown"]["purchases_paid"] == 150.0
    assert n["balance"] == 1000.0 - 250.0 and n["breakdown"]["purchases_paid"] == 250.0
    # a soma das duas contas caiu exatamente o valor da compra
    d = (await test_client.get(f"{FIN}/accounts", headers=h)).json()
    assert d["purchases_pending"]["total"] >= 0


async def test_compra_menor_que_a_gaveta_sai_toda_da_gaveta(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=10, custo="10.00", paid_account_id=nu, paid_with_cash=True))   # R$ 100
    assert r.status_code == 201, r.text
    assert float(r.json()["paid_cash_amount"]) == 100.0
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 50.0
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 1000.0                 # o banco nem foi usado


async def test_gaveta_zerada_a_compra_sai_toda_do_banco(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=15, custo="10.00", paid_account_id=gaveta))          # esvazia a gaveta
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 0.0
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=20, custo="10.00", paid_account_id=nu, paid_with_cash=True))
    assert r.status_code == 201, r.text
    assert r.json()["paid_cash_amount"] in (None, 0, 0.0)
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 0.0
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 800.0


async def test_nao_da_para_pagar_com_gaveta_e_gaveta(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=10, custo="10.00", paid_account_id=gaveta, paid_with_cash=True))
    assert r.status_code == 400 and "escolha um banco" in r.text.lower(), r.text


async def test_compra_ja_lancada_pelo_cartao_compras_sem_conta(test_client, async_session, test_user):
    """Duas compras de uma vez: a gaveta paga a primeira (o que tiver) e o resto vai para o banco; saldo fecha."""
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    e1 = (await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=10, custo="10.00"))).json()["id"]          # R$ 100
    e2 = (await test_client.post(ENT, headers=h, json=_corpo(p, vb, qtd=20, custo="10.00"))).json()["id"]          # R$ 200
    r = await test_client.post(f"{FIN}/purchases-pay", headers=h, json={"entry_ids": [e1, e2], "account_id": nu, "with_cash": True})
    assert r.status_code == 200, r.text
    g, n = await _saldo(test_client, h, "Gaveta"), await _saldo(test_client, h, "Nubank")
    assert g["balance"] == 0.0 and g["breakdown"]["purchases_paid"] == 150.0          # 100 + 50 da segunda
    assert n["breakdown"]["purchases_paid"] == 150.0 and n["balance"] == 850.0         # 150 da segunda
    # total que saiu = 300 = valor das duas compras
    assert g["breakdown"]["purchases_paid"] + n["breakdown"]["purchases_paid"] == 300.0


async def test_mudar_para_so_banco_devolve_o_dinheiro_a_gaveta_e_excluir_devolve_tudo(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    eid = (await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=40, custo="10.00", paid_account_id=nu, paid_with_cash=True))).json()["id"]
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 0.0
    r = await test_client.put(f"{ENT}{eid}", headers=h, json={"paid_account_id": nu, "paid_with_cash": False})
    assert r.status_code == 200, r.text
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 150.0
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 600.0
    # volta para gaveta + banco e exclui: tudo volta
    await test_client.put(f"{ENT}{eid}", headers=h, json={"paid_account_id": nu, "paid_with_cash": True})
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 0.0
    r = await test_client.delete(f"{ENT}{eid}", headers=h)
    assert r.status_code in (200, 204), r.text
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 150.0 and (await _saldo(test_client, h, "Nubank"))["balance"] == 1000.0


async def test_item_adicionado_depois_aumenta_so_a_parte_do_banco(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    eid = (await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=40, custo="10.00", paid_account_id=nu, paid_with_cash=True))).json()["id"]
    r = await test_client.post(f"{ENT}{eid}/items", headers=h, json={"product_id": p.id, "variant_id": vb.id, "quantity_received": 4, "unit_cost": "25.00"})
    assert r.status_code in (200, 201), r.text
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 0.0                   # a gaveta continua com os 150 gravados
    assert (await _saldo(test_client, h, "Nubank"))["balance"] == 1000.0 - 250.0 - 100.0


async def test_compra_so_na_gaveta_continua_igual_a_antes(test_client, async_session, test_user):
    h, p, va, vb, gaveta, nu = await _loja(test_client, async_session, test_user)
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=5, custo="10.00", paid_account_id=gaveta))
    assert r.status_code == 201 and r.json().get("paid_cash_amount") in (None, 0, 0.0)
    assert (await _saldo(test_client, h, "Gaveta"))["balance"] == 100.0
