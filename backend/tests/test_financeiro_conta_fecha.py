"""A conta do mês fecha? (GET /finance/reconciliation) Começou + entrou - saiu = deveria ter; o que as contas mostram a mais ou a
menos é o que foi corrigido à mão (Corrigir saldo, contagem do caixa) e aparece como "a conta não fecha", com quem e por quê."""
from datetime import date, timedelta

import pytest
from sqlalchemy import update

from app.models.user import User, UserRole
from tests.test_financeiro import _conta, _implantar, _pagar_com, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_short_codes import _user
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"
MOTIVO = "Conferi o extrato do banco e o valor lançado estava errado"


async def _loja(client, db, user):
    t_id, h, p, va, vb = await _cenario(db, user)
    await db.execute(update(User).where(User.tenant_id == t_id, User.role == UserRole.ADMIN, User.id != user.id).values(is_active=False))
    await db.commit()                                   # um administrador só: as correções valem na hora (sem pedido)
    await _zerar_implantacao(db, t_id)
    d = (await _implantar(client, h, cash_balance="1000.00", card_balance="300.00")).json()
    return t_id, h, p, va, {a["name"]: a["id"] for a in d["accounts"]}


async def _rec(client, h, **params):
    r = await client.get(f"{API}/reconciliation", headers=h, params=params)
    assert r.status_code == 200, r.text
    return r.json()


async def test_a_conta_fecha_sem_correcao_e_nao_fecha_com_correcao_a_mao(test_client, async_session, test_user):
    t_id, h, p, va, ids = await _loja(test_client, async_session, test_user)
    base = await _rec(test_client, h)
    assert base["status"] == "ok" and base["difference"] == 0 and base["adjustments"] == []
    inicio = base["opening"]

    await _pagar_com(test_client, h, p, va, "cash", "200.00")                                    # entrou 200 na gaveta
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "50.00", "description": "Material", "expense_date": date.today().isoformat(), "account_id": ids["Gaveta"]})
    assert r.status_code in (200, 201), r.text
    rec = await _rec(test_client, h)
    assert rec["sales"] == 200.0 and rec["expenses_paid"] == 50.0 and rec["entered"] == 200.0 and rec["left"] == 50.0
    assert rec["should_have"] == inicio + 150.0 == rec["have"] and rec["status"] == "ok" and rec["difference"] == 0

    # transferência entre contas não muda a conta
    assert (await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": ids["Gaveta"], "to_account_id": ids["Nubank"], "amount": "100"})).status_code == 200
    assert (await _rec(test_client, h))["status"] == "ok"

    # corrigir a gaveta à mão (contou R$ 5 a menos): a conta não fecha, e diz por quê
    r = await test_client.post(f"{API}/accounts/{ids['Gaveta']}/adjust", headers=h, json={"target_balance": "1045.00", "reason": "Contagem do dinheiro"})
    assert r.status_code == 200, r.text
    rec = await _rec(test_client, h)
    assert rec["status"] == "adjusted" and rec["difference"] == -5.0 and rec["adjustments_total"] == -5.0
    assert rec["should_have"] == inicio + 150.0 and rec["have"] == inicio + 145.0
    assert len(rec["adjustments"]) == 1 and rec["adjustments"][0]["account"] == "Gaveta" and "Contagem do dinheiro" in rec["adjustments"][0]["reason"]
    assert "não fecha" in rec["message"] and "R$ 5,00" in rec["message"]

    # e uma do banco para cima: soma na diferença
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "1130.00", "reason": MOTIVO})
    assert r.status_code == 200, r.text
    rec = await _rec(test_client, h)
    assert len(rec["adjustments"]) == 2 and rec["difference"] == rec["adjustments_total"] == 25.0       # -5 e +30
    # sempre fecha com o saldo de verdade das contas
    contas = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert rec["have"] == contas["total"]


async def test_mes_antes_da_contagem_e_acesso_so_do_administrador(test_client, async_session, test_user):
    t_id, h, p, va, ids = await _loja(test_client, async_session, test_user)
    antes = date.today().replace(day=1) - timedelta(days=1)
    r = await _rec(test_client, h, year=antes.year, month=antes.month)
    assert r["status"] == "empty" and "antes do começo" in r["message"]
    gerente = await _user(async_session, t_id, UserRole.MANAGER)
    assert (await test_client.get(f"{API}/reconciliation", headers=gerente)).status_code == 403


async def test_ponte_explica_onde_foi_cada_real_e_nao_sobra_nada_sem_explicacao(test_client, async_session, test_user):
    """O dono pensa: vendi X, gastei Y, sobra X-Y. As contas mostram outro valor por causa de fiado, cartão, gasto sem conta,
    retirada, correção à mão... A ponte lista cada motivo; a sobra sem explicação tem que ser ZERO."""
    from tests.test_compra_abate_conta import ENT, _corpo
    from tests.test_fiado import _cliente, _venda
    t_id, h, p, va, ids = await _loja(test_client, async_session, test_user)
    hoje = date.today().isoformat()

    def ponte(rec):
        return {ln["key"]: ln["amount"] for ln in rec["bridge"]["lines"]}

    base = await _rec(test_client, h)
    pre = ponte(base).get("purchases_noacct", 0.0)           # a compra do cenário de teste ainda não disse de onde saiu o dinheiro
    assert base["bridge"]["residual"] == 0 and base["bridge"]["should_be_left"] == -pre

    await _pagar_com(test_client, h, p, va, "cash", "200.00")                      # dinheiro
    await _pagar_com(test_client, h, p, va, "pix", "100.00")                       # PIX
    await _pagar_com(test_client, h, p, va, "credit_card", "50.00")                # cartão (fica na maquininha)
    cid = await _cliente(async_session, t_id)
    r = await _venda(test_client, h, p, va, cid, [{"amount": "80.00", "payment_method": "on_account"}], preco="80.00")
    assert r.status_code in (200, 201), r.text                                      # fiado: vendeu, não entrou
    rec = await _rec(test_client, h)
    b = rec["bridge"]
    assert b["sold"] == 430.0 and ponte(rec) == {**({"purchases_noacct": pre} if pre else {}), "fiado_sold": -80.0}
    assert b["should_be_left"] == 430.0 - pre
    assert b["change_in_accounts"] == 350.0 and b["residual"] == 0 and b["status"] == "ok"
    assert b["card_receivable"] == 300.0 + 50.0 and b["available"] == rec["have"] - b["card_receivable"]

    # gastos: um com conta, um SEM conta; compra com conta e compra sem conta
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "30.00", "description": "Com conta", "expense_date": hoje, "account_id": ids["Gaveta"]})
    assert r.status_code in (200, 201), r.text
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "20.00", "description": "Sem conta", "expense_date": hoje})
    assert r.status_code in (200, 201), r.text
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=4, custo="10.00", paid_account_id=ids["Nubank"]))
    assert r.status_code == 201, r.text                                             # R$ 40 saem do Nubank
    r = await test_client.post(ENT, headers=h, json=_corpo(p, va, qtd=3, custo="10.00"))
    assert r.status_code == 201, r.text                                             # R$ 30 sem conta escolhida
    rec = await _rec(test_client, h)
    b, pt = rec["bridge"], ponte(rec)
    assert b["spent"] == pre + 30 + 20 + 40 + 30 and b["should_be_left"] == 430 - pre - 120
    assert pt["expenses_noacct"] == 20.0 and pt["purchases_noacct"] == pre + 30.0 and pt["fiado_sold"] == -80.0
    assert b["residual"] == 0 and b["status"] == "ok", b

    # retirada de sócio, caixa, correção à mão e devolução em dinheiro
    r = await test_client.post(f"{API}/entries", headers=h, json={"kind": "owner_withdrawal", "account_id": ids["Nubank"], "amount": "25", "person": "Sócia"})
    assert r.status_code == 200, r.text
    gaveta = next(a["balance"] for a in (await test_client.get(f"{API}/accounts", headers=h)).json()["accounts"] if a["name"] == "Gaveta")
    r = await test_client.post(f"{API}/accounts/{ids['Gaveta']}/adjust", headers=h, json={"target_balance": str(gaveta - 3), "reason": "Contagem do dinheiro"})
    assert r.status_code == 200, r.text
    rec = await _rec(test_client, h)
    b, pt = rec["bridge"], ponte(rec)
    assert pt["owner"] == -25.0 and pt["adjustments"] == -3.0
    assert b["residual"] == 0 and b["status"] == "ok", b
    assert round(b["should_be_left"] + sum(pt.values()), 2) == b["change_in_accounts"]
