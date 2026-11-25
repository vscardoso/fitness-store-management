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


@pytest.fixture(autouse=True)
async def _sem_admins_extras(async_session, test_user):
    """Os administradores extras criados aqui ficam inativos depois: a loja 1 é reaproveitada e os outros testes a tratam
    como de um administrador só (sem outro para aprovar)."""
    tenant, uid = test_user.tenant_id, test_user.id        # lidos agora: depois do rollback o objeto expira

    async def _reset(rollback=True):
        if rollback:
            await async_session.rollback()
        await async_session.execute(update(User).where(User.tenant_id == tenant, User.role == UserRole.ADMIN).values(finance_approver=True))
        await async_session.execute(update(User).where(User.tenant_id == tenant, User.role == UserRole.ADMIN,
                                                       User.id != uid).values(is_active=False))
        await async_session.commit()
    await _reset(rollback=False)          # no começo sem rollback: o usuário do teste não pode expirar
    yield
    await _reset()


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
    r = await test_client.post(f"{API}/accounts/{ids['Gaveta']}/adjust", headers=h, json={"target_balance": "995.00", "reason": "Contagem do dinheiro"})
    assert r.status_code == 200 and _conta(r.json(), "Gaveta")["balance"] == 995.0

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


async def test_financeiro_so_para_administrador(test_client, async_session, test_user):
    """Decisão do dono: o Financeiro inteiro (saldos, extrato, transferências, pedidos) é só de administrador."""
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    gerente = await _user(async_session, t_id, UserRole.MANAGER)
    vendedora = await _user(async_session, t_id, UserRole.SELLER)
    for quem in (gerente, vendedora):
        for rota in ("accounts", "statement", "transfers", "payables", "entries", "approvals", "closings", "loans"):
            assert (await test_client.get(f"{API}/{rota}", headers=quem)).status_code == 403, rota
        assert (await test_client.post(f"{API}/transfers", headers=quem, json={"from_account_id": ids["Gaveta"], "to_account_id": ids["Nubank"], "amount": "10"})).status_code == 403
    assert (await test_client.get(f"{API}/accounts", headers=h)).status_code == 200


async def test_so_quem_aprova_vota_e_o_dono_pode_so_acompanhar(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    dono = test_user.id
    aprovam = [uid for uid in heads if uid != dono]
    assert len(aprovam) == 2
    # só administrador escolhe quem aprova; pelo menos um
    gerente = await _user(async_session, t_id, UserRole.MANAGER)
    assert (await test_client.put(f"{API}/approvers", headers=gerente, json={"user_ids": aprovam})).status_code == 403
    assert (await test_client.put(f"{API}/approvers", headers=h, json={"user_ids": []})).status_code == 400
    r = await test_client.put(f"{API}/approvers", headers=h, json={"user_ids": aprovam})
    assert r.status_code == 200
    assert {a["user_id"]: a["approver"] for a in r.json()}[dono] is False

    antes = (await _saldos(test_client, h))["Nubank"]
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": str(antes + 100), "reason": MOTIVO})
    ap = r.json()["approval"]
    assert r.status_code == 202 and ap["approved_count"] == 0                       # o dono pediu, mas não vota
    assert sorted(w["user_id"] for w in ap["waiting_for"]) == sorted(aprovam) and ap["can_vote"] is False
    r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=h, json={})
    assert r.status_code == 400 and "acompanha" in r.json()["detail"]                 # ele acompanha, não aprova
    # com pedido esperando não dá para trocar quem aprova
    assert (await test_client.put(f"{API}/approvers", headers=h, json={"user_ids": aprovam[:1]})).status_code == 409
    r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[aprovam[0]], json={})
    assert r.json()["status"] == "pending"
    r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[aprovam[1]], json={})
    assert r.json()["status"] == "approved" and (await _saldos(test_client, h))["Nubank"] == antes + 100.0
    # o dono vê o pedido na lista
    lista = (await test_client.get(f"{API}/approvals", headers=h)).json()
    assert any(i["id"] == ap["id"] for i in lista["items"]) and lista["waiting_for_me"] == 0


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


async def test_gaveta_ate_10_reais_so_pede_motivo_e_acima_precisa_de_outro_administrador(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    g = ids["Gaveta"]
    # quebra pequena: direto (motivo de 5 letras)
    r = await test_client.post(f"{API}/accounts/{g}/adjust", headers=h, json={"target_balance": "992.00", "reason": "Ok"})
    assert r.status_code == 400
    r = await test_client.post(f"{API}/accounts/{g}/adjust", headers=h, json={"target_balance": "992.00", "reason": "Contagem do dinheiro"})
    assert r.status_code == 200 and _conta(r.json(), "Gaveta")["balance"] == 992.0
    # acima de R$ 10: motivo de 20 letras e pedido; só OUTRO administrador precisa aprovar (não todos)
    r = await test_client.post(f"{API}/accounts/{g}/adjust", headers=h, json={"target_balance": "900.00", "reason": "Contei a gaveta"})
    assert r.status_code == 400 and "gaveta" in r.json()["detail"] and "20 letras" in r.json()["detail"]
    r = await test_client.post(f"{API}/accounts/{g}/adjust", headers=h, json={"target_balance": "900.00", "reason": MOTIVO})
    assert r.status_code == 202, r.text
    ap = r.json()["approval"]
    assert ap["rule"] == "one_other" and "gaveta" in ap["summary"].lower() and (await _saldos(test_client, h))["Gaveta"] == 992.0
    outro = next(uid for uid in heads if uid != ap["requested_by_id"])
    r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[outro], json={})
    assert r.status_code == 200 and r.json()["status"] == "approved", r.text           # um outro administrador basta
    assert (await _saldos(test_client, h))["Gaveta"] == 900.0
    # quem pediu sozinho não aprova o próprio pedido: os votos dele não bastam
    r = await test_client.post(f"{API}/accounts/{g}/adjust", headers=h, json={"target_balance": "700.00", "reason": MOTIVO})
    ap2 = r.json()["approval"]
    assert ap2["status"] == "pending" and ap2["approved_count"] == 1
    assert (await test_client.post(f"{API}/approvals/{ap2['id']}/approve", headers=h, json={})).status_code == 409


async def test_caixa_abre_e_fecha_conferindo_a_gaveta_do_financeiro(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)     # gaveta = 1000
    cur = (await test_client.get("/api/v1/cash/current", headers=h)).json()
    assert cur["drawer"] == {"started": True, "account_id": ids["Gaveta"], "expected": 1000.0}

    # sem a opção do app (align_drawer), o caixa abre como sempre e o Financeiro não muda
    r = await test_client.post("/api/v1/cash/open", headers=h, json={"opening_amount": 250})
    assert r.status_code == 201 and "drawer_alignment" not in r.json()
    assert (await test_client.post("/api/v1/cash/close", headers=h, json={"counted_amount": 250})).status_code == 200
    assert (await _saldos(test_client, h))["Gaveta"] == 1000.0

    # contou diferente sem motivo: nada é criado
    r = await test_client.post("/api/v1/cash/open", headers=h, json={"opening_amount": 995, "align_drawer": True})
    assert r.status_code == 400 and "motivo" in r.json()["detail"]
    assert (await test_client.get("/api/v1/cash/current", headers=h)).json()["open"] is False
    # diferença pequena: abre e a gaveta do Financeiro passa a ser o contado
    r = await test_client.post("/api/v1/cash/open", headers=h, json={"opening_amount": 995, "align_drawer": True, "reason": "Troco entregue ontem"})
    assert r.status_code == 201, r.text
    al = r.json()["drawer_alignment"]
    assert al["applied"] is True and al["difference"] == -5.0 and al["approval"] is None
    assert (await _saldos(test_client, h))["Gaveta"] == 995.0
    # fechar com o valor igual ao que o sistema espera: sem motivo e sem ajuste
    r = await test_client.post("/api/v1/cash/close", headers=h, json={"counted_amount": 995, "align_drawer": True})
    assert r.status_code == 200 and r.json()["drawer_alignment"]["difference"] == 0.0 and r.json()["drawer_alignment"]["applied"] is False

    # diferença grande: o caixa abre com o contado, o acerto da gaveta vira pedido para outro administrador
    r = await test_client.post("/api/v1/cash/open", headers=h, json={"opening_amount": 900, "align_drawer": True, "reason": "curto"})
    assert r.status_code == 400 and "20 letras" in r.json()["detail"]
    r = await test_client.post("/api/v1/cash/open", headers=h, json={"opening_amount": 900, "align_drawer": True, "reason": MOTIVO})
    assert r.status_code == 201, r.text
    al = r.json()["drawer_alignment"]
    assert al["applied"] is False and al["approval"]["status"] == "pending" and al["approval"]["rule"] == "one_other"
    assert (await _saldos(test_client, h))["Gaveta"] == 995.0               # o Financeiro espera a aprovação
    outro = next(uid for uid in heads if uid != al["approval"]["requested_by_id"])
    assert (await test_client.post(f"{API}/approvals/{al['approval']['id']}/approve", headers=heads[outro], json={})).status_code == 200
    assert (await _saldos(test_client, h))["Gaveta"] == 900.0


async def test_push_avisa_pedido_voto_parcial_e_aplicado_e_abre_a_tela_de_pedidos(test_client, async_session, test_user, monkeypatch):
    """Quem pediu e quem ainda não votou são avisados a cada passo; tocar no aviso abre /finance/approvals; uma etiqueta por pedido."""
    from app.services import web_push_service
    enviados = []

    async def _captura(tenant_id, title, body, url="/", **kw):
        enviados.append({"title": title, "body": body, "url": url, "tag": kw.get("tag"), "exclude": kw.get("exclude_user_id"), "roles": kw.get("roles")})
        return {"sent": 1, "removed": 0}

    monkeypatch.setattr(web_push_service, "notify_tenant", _captura)
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    antes = await _saldos(test_client, h)
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "1500.00", "reason": MOTIVO})
    assert r.status_code == 202, r.text
    ap = r.json()["approval"]
    assert len(enviados) == 1 and enviados[0]["url"] == "/finance/approvals" and enviados[0]["tag"] == f"aprovacao-{ap['id']}"
    assert enviados[0]["exclude"] == ap["requested_by_id"] and "admin" in enviados[0]["roles"]      # quem pediu não recebe o próprio pedido

    outros = [uid for uid in heads if uid != ap["requested_by_id"]]
    assert len(outros) >= 2, "o cenário precisa de pelo menos 2 aprovadores além de quem pediu"
    r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[outros[0]], json={})
    assert r.status_code == 200 and r.json()["status"] == "pending", r.text
    parcial = enviados[-1]
    assert len(enviados) == 2 and parcial["title"] == "Pedido de saldo: falta aprovar"
    assert "aprovou" in parcial["body"] and "Falta aprovar:" in parcial["body"]
    assert parcial["url"] == "/finance/approvals" and parcial["tag"] == f"aprovacao-{ap['id']}"
    assert parcial["exclude"] == outros[0]                                   # quem acabou de aprovar não recebe

    for uid in outros[1:]:
        r = await test_client.post(f"{API}/approvals/{ap['id']}/approve", headers=heads[uid], json={})
        assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    final = enviados[-1]
    assert final["title"] == "Pedido de saldo aprovado e aplicado" and final["url"] == "/finance/approvals" and final["exclude"] is None
    assert (await _saldos(test_client, h))["Nubank"] == 1500.0 != antes["Nubank"]
