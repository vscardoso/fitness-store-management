"""Saldo de BANCO só muda com motivo e aprovação de todos os administradores.

Corrigir saldo, saldo de partida, apagar ou corrigir transferência, lançamento e conta paga que envolvem um banco viram um
pedido (HTTP 202); a mudança só é aplicada quando todos os administradores ativos aprovaram. Gaveta e maquininha seguem como
antes. Qualquer recusa cancela; pedido parado vence em 7 dias."""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.finance import FinanceApproval
from app.models.user import User, UserRole
from tests.test_financeiro import _conta, _implantar, _pagar_com, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_short_codes import _user
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"
MOTIVO = "Conferi o extrato do banco e o valor lançado estava errado"


async def _loja(client, db, user):
    """Loja 1 com o financeiro implantado e pelo menos 3 administradores (quem pede e dois que votam)."""
    t_id, h, p, va, vb = await _cenario(db, user)
    await _zerar_implantacao(db, t_id)
    d = (await _implantar(client, h, cash_balance="1000.00", card_balance="300.00")).json()
    ids = {a["name"]: a["id"] for a in d["accounts"]}
    extras = [await _user(db, t_id, UserRole.ADMIN) for _ in range(2)]
    admins = (await db.execute(select(User).where(User.tenant_id == t_id, User.role == UserRole.ADMIN, User.is_active == True))).scalars().all()  # noqa: E712
    heads = {u.id: {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"} for u in admins}
    await db.commit()          # solta a leitura aberta: no SQLite ela trava a gravação dos pedidos feitos pelas rotas
    return t_id, h, p, va, ids, heads, admins


async def _saldos(client, h):
    d = (await client.get(f"{API}/accounts", headers=h)).json()
    return {a["name"]: a["balance"] for a in d["accounts"]}


async def _pedidos(client, h):
    return (await client.get(f"{API}/approvals", headers=h)).json()


async def _aprovar_todos(client, heads, approval_id, except_ids=()):
    last = None
    for uid, hh in heads.items():
        if uid in except_ids:
            continue
        r = await client.post(f"{API}/approvals/{approval_id}/approve", headers=hh, json={})
        if r.status_code == 409:       # quem pediu já votou
            continue
        assert r.status_code == 200, r.text
        last = r.json()
    return last


async def test_corrigir_saldo_de_banco_vira_pedido_e_so_vale_com_todos(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    antes = await _saldos(test_client, h)
    corpo = {"target_balance": "1500.00", "reason": MOTIVO}

    # sem motivo de 20 letras: recusa, nada é criado
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "1500", "reason": "Conferi o extrato"})
    assert r.status_code == 400 and "20 letras" in r.json()["detail"]
    assert (await _pedidos(test_client, h))["items"] == []

    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json=corpo)
    assert r.status_code == 202, r.text
    ap = r.json()["approval"]
    assert r.json()["approval_required"] is True and ap["status"] == "pending" and ap["kind"] == "account_adjust"
    assert ap["amount"] == 1500.0 - antes["Nubank"] and "Nubank" in ap["summary"]
    assert ap["approved_count"] == 1 and len(ap["waiting_for"]) == len(admins) - 1       # quem pediu já conta
    assert await _saldos(test_client, h) == antes                                          # nada mudou

    # pedido igual enquanto o primeiro espera: recusa
    r2 = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json=corpo)
    assert r2.status_code in (400, 409), r2.text

    # a gaveta continua com a correção direta de antes
    r = await test_client.post(f"{API}/accounts/{ids['Gaveta']}/adjust", headers=h, json={"target_balance": "900.00", "reason": "Contagem do dinheiro"})
    assert r.status_code == 200 and _conta(r.json(), "Gaveta")["balance"] == 900.0

    # os outros aprovam um por um: só no último o saldo muda
    outros = [uid for uid in heads if uid != ap["requested_by_id"]]
    for uid in outros[:-1]:
        r = await test_client.post(f"{API}/approvals/{ap['id']}/approve".replace("/approvals", "/approvals"), headers=heads[uid], json={}) \
            if False else await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[uid], json={})
        assert r.status_code == 200 and r.json()["status"] == "pending", r.text
        assert (await _saldos(test_client, h))["Nubank"] == antes["Nubank"]
    r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[outros[-1]], json={})
    assert r.status_code == 200 and r.json()["status"] == "approved", r.text
    assert (await _saldos(test_client, h))["Nubank"] == 1500.0
    assert "Aplicado" in r.json()["result_message"]
    acoes = {a.action for a in (await async_session.execute(select(AuditLog).where(AuditLog.tenant_id == t_id))).scalars().all()}
    assert {"FINANCE_APPROVAL_REQUESTED", "FINANCE_APPROVAL_VOTED", "FINANCE_APPROVAL_APPLIED", "FINANCE_ACCOUNT_ADJUSTED"} <= acoes


async def test_recusa_cancela_e_ninguem_vota_duas_vezes(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    antes = await _saldos(test_client, h)
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "777.00", "reason": MOTIVO})
    ap = r.json()["approval"]
    outro = next(uid for uid in heads if uid != ap["requested_by_id"])
    # recusar sem motivo: recusa
    r = await test_client.post(f"{API}/approvals/{ap['id']}/reject", headers=heads[outro], json={})
    assert r.status_code == 400 and "motivo" in r.json()["detail"]
    r = await test_client.post(f"{API}/approvals/{ap['id']}/reject", headers=heads[outro], json={"comment": "O extrato não mostra isso"})
    assert r.status_code == 200 and r.json()["status"] == "rejected" and "extrato" in r.json()["result_message"]
    # decidido: ninguém mais vota; o saldo não mudou
    for uid in heads:
        r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[uid], json={})
        assert r.status_code == 409, (uid, r.text)
    assert await _saldos(test_client, h) == antes
    # quem recusou não vota duas vezes num pedido novo igual
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "777.00", "reason": MOTIVO})
    assert r.status_code == 202
    novo = r.json()["approval"]
    assert (await test_client.post(f"{API}/approvals/{novo['id']}/approve", headers=heads[outro], json={})).status_code == 200
    assert (await test_client.post(f"{API}/approvals/{novo['id']}/approve", headers=heads[outro], json={})).status_code == 409
    # quem pediu cancela o próprio pedido
    r = await test_client.post(f"{API}/approvals/{novo['id']}/cancel", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "canceled"


async def test_aplica_a_diferenca_e_nao_o_saldo_absoluto_do_dia_do_pedido(test_client, async_session, test_user):
    """Pedido de +R$ 100 no banco; antes de aprovarem entra uma venda em PIX de R$ 50: o banco termina com +150, não com o
    número absoluto do dia do pedido (que apagaria a venda)."""
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    base = (await _saldos(test_client, h))["Nubank"]
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": str(base + 100), "reason": MOTIVO})
    ap = r.json()["approval"]
    await _pagar_com(test_client, h, p, va, "pix", "50.00")
    await _aprovar_todos(test_client, heads, ap["id"])
    assert (await _saldos(test_client, h))["Nubank"] == base + 150.0


async def test_pedido_vence_em_7_dias(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "1234.00", "reason": MOTIVO})
    ap = r.json()["approval"]
    await async_session.execute(update(FinanceApproval).where(FinanceApproval.id == ap["id"]).values(expires_at=datetime.now(timezone.utc) - timedelta(hours=1)))
    await async_session.commit()
    outro = next(uid for uid in heads if uid != ap["requested_by_id"])
    r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[outro], json={})
    assert r.status_code == 409
    lista = await _pedidos(test_client, h)
    assert next(i for i in lista["items"] if i["id"] == ap["id"])["status"] == "expired" and lista["pending"] == 0


async def test_gerente_pede_mas_nao_vota_e_precisa_de_todos_os_administradores(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    gerente = await _user(async_session, t_id, UserRole.MANAGER)
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=gerente, json={"target_balance": "5", "reason": MOTIVO})
    assert r.status_code == 403                                             # corrigir saldo é só de administrador
    # transferência para o banco: gerente lança; apagar depois já é pedido
    r = await test_client.post(f"{API}/transfers", headers=gerente, json={"from_account_id": ids["Gaveta"], "to_account_id": ids["Nubank"], "amount": "100"})
    assert r.status_code == 200, r.text
    tid = (await test_client.get(f"{API}/transfers", headers=gerente)).json()[0]["id"]
    r = await test_client.delete(f"{API}/transfers/{tid}", headers=gerente, params={"reason": MOTIVO})
    assert r.status_code == 202
    ap = r.json()["approval"]
    assert ap["approved_count"] == 0 and len(ap["waiting_for"]) == len(admins)           # gerente não conta como voto
    assert (await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=gerente, json={})).status_code == 403
    await _aprovar_todos(test_client, heads, ap["id"])
    assert (await test_client.get(f"{API}/transfers", headers=h)).json() == []


async def test_transferencia_lancamento_e_conta_paga_de_banco_passam_pelo_pedido(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    # transferência gaveta -> banco
    assert (await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": ids["Gaveta"], "to_account_id": ids["Nubank"], "amount": "100"})).status_code == 200
    tid = (await test_client.get(f"{API}/transfers", headers=h)).json()[0]["id"]
    saldo = (await _saldos(test_client, h))["Nubank"]
    r = await test_client.patch(f"{API}/transfers/{tid}", headers=h, json={"amount": "60"})
    assert r.status_code == 400                                                           # sem motivo
    r = await test_client.patch(f"{API}/transfers/{tid}", headers=h, json={"amount": "60", "reason": MOTIVO})
    assert r.status_code == 202
    assert (await _saldos(test_client, h))["Nubank"] == saldo                              # ainda não mudou
    await _aprovar_todos(test_client, heads, r.json()["approval"]["id"])
    assert (await _saldos(test_client, h))["Nubank"] == saldo - 40.0
    # descrição não mexe em saldo: aplica direto
    assert (await test_client.patch(f"{API}/transfers/{tid}", headers=h, json={"description": "Depósito de sexta"})).status_code == 200
    # transferência entre gaveta e maquininha: sem banco, direto
    assert (await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": ids["Maquininha a receber"], "to_account_id": ids["Gaveta"], "amount": "10"})).status_code == 200
    t2 = (await test_client.get(f"{API}/transfers", headers=h)).json()[0]["id"]
    assert (await test_client.delete(f"{API}/transfers/{t2}", headers=h)).status_code == 200

    # retirada de sócio do banco
    r = await test_client.post(f"{API}/entries", headers=h, json={"kind": "owner_withdrawal", "account_id": ids["Nubank"], "amount": "100", "person": "Sócia Ana"})
    assert r.status_code == 200, r.text
    eid = (await test_client.get(f"{API}/entries", headers=h)).json()[0]["id"]
    saldo = (await _saldos(test_client, h))["Nubank"]
    assert (await test_client.patch(f"{API}/entries/{eid}", headers=h, json={"person": "Sócia Beatriz"})).status_code == 200      # só o nome
    assert (await test_client.delete(f"{API}/entries/{eid}", headers=h)).status_code == 400                                         # sem motivo
    r = await test_client.delete(f"{API}/entries/{eid}", headers=h, params={"reason": MOTIVO})
    assert r.status_code == 202
    await _aprovar_todos(test_client, heads, r.json()["approval"]["id"])
    assert (await _saldos(test_client, h))["Nubank"] == saldo + 100.0

    # conta a pagar paga pelo banco: desfazer o pagamento é pedido; paga pela gaveta é direto
    pg = await test_client.post(f"{API}/payables", headers=h, json={"description": "Aluguel da loja", "amount": "200", "due_date": date.today().isoformat()})
    pid = pg.json()["id"]
    assert (await test_client.post(f"{API}/payables/{pid}/pay", headers=h, json={"account_id": ids["Nubank"]})).status_code == 200
    saldo = (await _saldos(test_client, h))["Nubank"]
    r = await test_client.post(f"{API}/payables/{pid}/unpay", headers=h, params={"reason": MOTIVO})
    assert r.status_code == 202
    await _aprovar_todos(test_client, heads, r.json()["approval"]["id"])
    assert (await _saldos(test_client, h))["Nubank"] == saldo + 200.0
    assert (await test_client.post(f"{API}/payables/{pid}/pay", headers=h, json={"account_id": ids["Gaveta"]})).status_code == 200
    assert (await test_client.post(f"{API}/payables/{pid}/unpay", headers=h)).status_code == 200      # gaveta: direto


async def test_saldo_de_partida_de_banco_tambem_precisa_de_pedido(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    antes = (await _saldos(test_client, h))["Nubank"]
    r = await test_client.patch(f"{API}/accounts/{ids['Nubank']}", headers=h, json={"name": "Nubank PJ"})      # só o nome: direto
    assert r.status_code == 200
    r = await test_client.patch(f"{API}/accounts/{ids['Nubank']}", headers=h, json={"opening_balance": "1200.00"})
    assert r.status_code == 400
    r = await test_client.patch(f"{API}/accounts/{ids['Nubank']}", headers=h, json={"opening_balance": "1200.00", "reason": MOTIVO})
    assert r.status_code == 202
    assert (await _saldos(test_client, h))["Nubank PJ"] == antes
    await _aprovar_todos(test_client, heads, r.json()["approval"]["id"])
    assert (await _saldos(test_client, h))["Nubank PJ"] == antes + (1200.0 - 1000.0)


async def test_se_o_estado_mudou_ate_aprovarem_o_pedido_falha_e_diz_por_que(test_client, async_session, test_user):
    from app.services.finance_service import FinanceService
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    pid = (await test_client.post(f"{API}/payables", headers=h, json={"description": "Boleto", "amount": "50", "due_date": date.today().isoformat()})).json()["id"]
    assert (await test_client.post(f"{API}/payables/{pid}/pay", headers=h, json={"account_id": ids["Nubank"]})).status_code == 200
    r = await test_client.post(f"{API}/payables/{pid}/unpay", headers=h, params={"reason": MOTIVO})
    ap = r.json()["approval"]
    await FinanceService(async_session).unpay_payable(t_id, pid)         # alguém desfez por outro caminho enquanto o pedido esperava
    final = await _aprovar_todos(test_client, heads, ap["id"])
    assert final["status"] == "failed" and "Só conta paga" in final["result_message"]


async def test_loja_com_um_administrador_so_exige_o_motivo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(test_client, h, cash_balance="1000.00", card_balance="300.00")).json()
    ids = {a["name"]: a["id"] for a in d["accounts"]}
    outros = (await async_session.execute(select(User).where(User.tenant_id == t_id, User.role == UserRole.ADMIN, User.id != test_user.id, User.is_active == True))).scalars().all()  # noqa: E712
    for u in outros:
        u.is_active = False
    await async_session.commit()
    try:
        r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "1500", "reason": "curto"})
        assert r.status_code == 400
        r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "1500", "reason": MOTIVO})
        assert r.status_code == 200 and _conta(r.json(), "Nubank")["balance"] == 1500.0         # sem ninguém para aprovar: aplica
        acoes = {a.action for a in (await async_session.execute(select(AuditLog).where(AuditLog.tenant_id == t_id))).scalars().all()}
        assert "FINANCE_BANK_CHANGE_JUSTIFIED" in acoes
    finally:
        for u in outros:
            u.is_active = True
        await async_session.commit()


async def test_despesa_paga_pelo_banco_so_muda_com_aprovacao(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    mk = lambda desc, conta, v="40": test_client.post("/api/v1/expenses", headers=h, json={
        "amount": v, "description": desc, "expense_date": date.today().isoformat(), "account_id": conta})
    r = await mk("Material do banco", ids["Nubank"])
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    g = await mk("Material da gaveta", ids["Gaveta"])
    gid = g.json()["id"]
    saldo = (await _saldos(test_client, h))["Nubank"]

    # só categoria/descrição: direto. Valor, dia ou conta de despesa paga pelo banco: pedido.
    assert (await test_client.put(f"/api/v1/expenses/{eid}", headers=h, json={"description": "Material de escritório"})).status_code == 200
    r = await test_client.put(f"/api/v1/expenses/{eid}", headers=h, json={"amount": "55"})
    assert r.status_code == 400 and "20 letras" in r.json()["detail"]
    r = await test_client.put(f"/api/v1/expenses/{eid}", headers=h, params={"reason": MOTIVO}, json={"amount": "55"})
    assert r.status_code == 202
    assert (await _saldos(test_client, h))["Nubank"] == saldo
    await _aprovar_todos(test_client, heads, r.json()["approval"]["id"])
    assert (await _saldos(test_client, h))["Nubank"] == saldo - 15.0

    # apagar
    r = await test_client.delete(f"/api/v1/expenses/{eid}", headers=h)
    assert r.status_code == 400
    r = await test_client.delete(f"/api/v1/expenses/{eid}", headers=h, params={"reason": MOTIVO})
    assert r.status_code == 202
    await _aprovar_todos(test_client, heads, r.json()["approval"]["id"])
    assert (await _saldos(test_client, h))["Nubank"] == saldo + 40.0
    # despesa da gaveta: continua direta
    assert (await test_client.delete(f"/api/v1/expenses/{gid}", headers=h)).status_code == 204
