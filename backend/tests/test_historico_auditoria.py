"""Histórico de alterações: registro automático, leitura só do admin, isolamento, filtros e avisos."""
import json
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from tests.test_short_codes import _user
from tests.test_team_limit import _nova_loja

pytestmark = pytest.mark.asyncio
API = "/api/v1"


@pytest.fixture(autouse=True)
def _tenant_de_verdade():
    from app.api.deps import get_current_tenant_id
    from app.main import app
    guardado = app.dependency_overrides.pop(get_current_tenant_id, None)
    yield
    if guardado is not None:
        app.dependency_overrides[get_current_tenant_id] = guardado


def _h(token):
    return {"Authorization": f"Bearer {token}"}


async def _loja(test_client, async_session):
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)
    t_id, admin, token = await _nova_loja(async_session, "pro")
    from types import SimpleNamespace
    return t_id, SimpleNamespace(id=admin.id, email=admin.email), _h(token)


async def _log(async_session, tenant_id, action):
    async_session.expire_all()
    rows = (await async_session.execute(
        select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.action == action).order_by(AuditLog.id))).scalars().all()
    return rows


def _detail(row):
    return json.loads(row.detail)


async def _implantar(client, h):
    inicio = (date.today() - timedelta(days=3)).isoformat()
    r = await client.post(f"{API}/finance/setup", headers=h, json={
        "start_date": inicio, "cash_balance": "100", "banks": [{"name": "Banco", "balance": "500"}]})
    assert r.status_code == 200, r.text
    return {a["name"]: a["id"] for a in r.json()["accounts"]}


async def test_despesa_criar_editar_apagar_registra_antes_e_depois(test_client, async_session):
    t_id, admin, h = await _loja(test_client, async_session)
    r = await test_client.post(f"{API}/expenses", headers=h, json={
        "amount": "100.00", "description": "Luz", "expense_date": date.today().isoformat()})
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    r = await test_client.put(f"{API}/expenses/{eid}", headers=h, json={"amount": "150.00"})
    assert r.status_code == 200, r.text
    assert (await test_client.delete(f"{API}/expenses/{eid}", headers=h)).status_code == 204

    (c,) = await _log(async_session, t_id, "EXPENSE_CREATED")
    assert c.user_id == admin.id and c.user_email == admin.email
    (u,) = await _log(async_session, t_id, "EXPENSE_UPDATED")
    d = _detail(u)
    assert d["antes"]["amount"] == 100.0 and d["depois"]["amount"] == 150.0 and d["nome"] == "Luz"
    assert u.entity_id == eid and u.user_id == admin.id
    (x,) = await _log(async_session, t_id, "EXPENSE_DELETED")
    assert _detail(x)["antes"]["is_active"] is True and _detail(x)["depois"]["is_active"] is False


async def test_dinheiro_transferencia_conta_a_pagar_caixa_e_fechamento(test_client, async_session):
    t_id, admin, h = await _loja(test_client, async_session)
    contas = await _implantar(test_client, h)
    r = await test_client.post(f"{API}/finance/transfers", headers=h, json={
        "from_account_id": contas["Gaveta"], "to_account_id": contas["Banco"], "amount": "20"})
    assert r.status_code == 200, r.text
    lista = (await test_client.get(f"{API}/finance/transfers", headers=h)).json()
    tid = (lista["items"] if isinstance(lista, dict) else lista)[0]["id"]
    assert (await test_client.delete(f"{API}/finance/transfers/{tid}", headers=h)).status_code == 200
    r = await test_client.post(f"{API}/finance/payables", headers=h, json={
        "description": "Aluguel", "amount": "30", "due_date": (date.today() + timedelta(days=5)).isoformat()})
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    assert (await test_client.post(f"{API}/finance/payables/{pid}/pay", headers=h, json={"account_id": contas["Banco"]})).status_code == 200
    assert (await test_client.post(f"{API}/finance/payables/{pid}/unpay", headers=h)).status_code == 200
    assert (await test_client.post(f"{API}/finance/payables/{pid}/cancel", headers=h)).status_code == 200
    assert (await test_client.post(f"{API}/cash/open", headers=h, json={"opening_amount": 100})).status_code == 201
    assert (await test_client.post(f"{API}/cash/movements", headers=h, json={"kind": "supply", "amount": 10, "reason": "troco"})).status_code == 201
    assert (await test_client.post(f"{API}/cash/close", headers=h, json={"counted_amount": 110})).status_code == 200

    for acao in ("TRANSFER_CREATED", "TRANSFER_DELETED", "PAYABLE_CREATED", "PAYABLE_PAID", "PAYABLE_UNPAID",
                 "PAYABLE_CANCELLED", "CASH_SESSION_OPENED", "CASH_MOVEMENT_CREATED", "CASH_SESSION_CLOSED"):
        rows = await _log(async_session, t_id, acao)
        assert len(rows) == 1, acao
        assert rows[0].user_id == admin.id, acao
    pago = _detail((await _log(async_session, t_id, "PAYABLE_PAID"))[0])
    assert pago["antes"]["status"] != pago["depois"]["status"]
    assert _detail((await _log(async_session, t_id, "CASH_MOVEMENT_CREATED"))[0])["motivo"] == "troco"


async def test_configuracao_usuario_e_produto(test_client, async_session):
    t_id, admin, h = await _loja(test_client, async_session)
    r = await test_client.put(f"{API}/store/loyalty-settings", headers=h, json={
        "enabled": True, "spend_per_point": 20, "point_value": 0.25, "min_redeem": 0, "expiry_days": None})
    assert r.status_code == 200, r.text
    (s,) = await _log(async_session, t_id, "SETTINGS_UPDATED")
    assert "antes" in _detail(s) and s.user_id == admin.id

    r = await test_client.post(f"{API}/team", headers=h, json={
        "email": "novo.aud@example.com", "full_name": "Novo Membro", "password": "Senha1234", "role": "seller"})
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    (c,) = await _log(async_session, t_id, "USER_CREATED")
    assert "Senha1234" not in c.detail and "password" not in c.detail      # nunca grava senha
    assert (await test_client.delete(f"{API}/team/{uid}", headers=h)).status_code in (200, 204)
    assert len(await _log(async_session, t_id, "USER_DEACTIVATED")) == 1


async def test_so_admin_le_o_historico(test_client, async_session):
    from app.models.user import UserRole
    t_id, admin, h = await _loja(test_client, async_session)
    assert (await test_client.get(f"{API}/audit", headers=h)).status_code == 200
    for papel in (UserRole.MANAGER, UserRole.SELLER, UserRole.CASHIER):
        hh = await _user(async_session, t_id, papel)
        assert (await test_client.get(f"{API}/audit", headers=hh)).status_code == 403, papel


async def test_isolamento_entre_lojas(test_client, async_session):
    ta, _, ha = await _loja(test_client, async_session)
    tb, _, hb = await _loja(test_client, async_session)
    r = await test_client.post(f"{API}/expenses", headers=ha, json={
        "amount": "10.00", "description": "Segredo da loja A", "expense_date": date.today().isoformat()})
    assert r.status_code == 201
    a = (await test_client.get(f"{API}/audit", headers=ha)).json()
    b = (await test_client.get(f"{API}/audit", headers=hb)).json()
    assert a["total_count"] >= 1 and any("Segredo da loja A" in (i["detail"] or "") for i in a["items"])
    assert "Segredo da loja A" not in json.dumps(b)
    assert all(i["tenant_id"] == tb for i in b["items"])


async def test_filtros_paginacao_e_nome(test_client, async_session):
    t_id, admin, h = await _loja(test_client, async_session)
    for i in range(3):
        r = await test_client.post(f"{API}/expenses", headers=h, json={
            "amount": f"{10 + i}.00", "description": f"Gasto {i}", "expense_date": date.today().isoformat()})
        assert r.status_code == 201
    await test_client.put(f"{API}/store/return-settings", headers=h, json={"return_window_days": 10, "allow_money_refund": True})

    todos = (await test_client.get(f"{API}/audit", headers=h)).json()
    assert todos["total_count"] >= 4
    assert all(i["user_name"] == "Dona da Loja" for i in todos["items"] if i["user_id"] == admin.id)
    din = (await test_client.get(f"{API}/audit?category=dinheiro", headers=h)).json()
    assert din["total_count"] == 3 and all(i["category"] == "dinheiro" for i in din["items"])
    pes = (await test_client.get(f"{API}/audit?category=pessoas", headers=h)).json()
    assert all(i["category"] == "pessoas" for i in pes["items"]) and pes["total_count"] >= 1
    assert (await test_client.get(f"{API}/audit?category=inexistente", headers=h)).json()["total_count"] == 0
    pag = (await test_client.get(f"{API}/audit?category=dinheiro&limit=2&skip=0", headers=h)).json()
    pag2 = (await test_client.get(f"{API}/audit?category=dinheiro&limit=2&skip=2", headers=h)).json()
    assert len(pag["items"]) == 2 and len(pag2["items"]) == 1 and pag["total_count"] == 3
    assert not ({i["id"] for i in pag["items"]} & {i["id"] for i in pag2["items"]})
    assert (await test_client.get(f"{API}/audit?limit=101", headers=h)).status_code == 422
    assert (await test_client.get(f"{API}/audit?action=EXPENSE_CREATED", headers=h)).json()["total_count"] == 3
    assert (await test_client.get(f"{API}/audit?user_id={admin.id}", headers=h)).json()["total_count"] >= 4
    hoje = date.today().isoformat()
    assert (await test_client.get(f"{API}/audit?start_date={hoje}&end_date={hoje}", headers=h)).json()["total_count"] >= 4
    amanha = (date.today() + timedelta(days=2)).isoformat()
    assert (await test_client.get(f"{API}/audit?start_date={amanha}", headers=h)).json()["total_count"] == 0


async def test_nenhuma_rota_apaga_ou_edita_o_historico():
    from app.main import app
    for route in app.routes:
        path = getattr(route, "path", "")
        if "/audit" in path:
            assert set(route.methods) <= {"GET", "HEAD"}, (path, route.methods)


async def test_falha_ao_registrar_nao_derruba_a_operacao(test_client, async_session, monkeypatch):
    t_id, admin, h = await _loja(test_client, async_session)

    def quebra(*a, **k):
        raise RuntimeError("falha simulada")
    monkeypatch.setattr("app.models.audit_log.AuditLog.__init__", quebra)
    r = await test_client.post(f"{API}/expenses", headers=h, json={
        "amount": "10.00", "description": "Sem registro", "expense_date": date.today().isoformat()})
    assert r.status_code == 201, r.text           # a despesa foi gravada mesmo sem o registro
    monkeypatch.undo()
    assert await _log(async_session, t_id, "EXPENSE_CREATED") == []
    assert (await test_client.get(f"{API}/expenses", headers=h)).status_code == 200


async def test_aviso_vai_para_os_outros_admins_e_nao_para_quem_fez(test_client, async_session, monkeypatch):
    from app.models.user import UserRole
    t_id, admin, h = await _loja(test_client, async_session)
    contas = await _implantar(test_client, h)
    chamadas = []

    async def falso(tenant_id, title, body, url="/", **kw):
        chamadas.append({"tenant": tenant_id, "title": title, "body": body, **kw})
        return {"sent": 0}
    monkeypatch.setattr("app.services.web_push_service.notify_tenant", falso)

    r = await test_client.post(f"{API}/finance/accounts/{contas['Gaveta']}/adjust", headers=h,
                               json={"target_balance": "80", "reason": "contei de novo"})
    assert r.status_code == 200, r.text
    assert len(chamadas) == 1
    c = chamadas[0]
    assert c["exclude_user_id"] == admin.id and tuple(c["roles"]) == ("admin",) and c["tenant"] == t_id
    assert "Dona da Loja corrigiu o saldo da Gaveta" in c["body"] and "100,00" in c["body"] and "80,00" in c["body"]

    # falha de push não derruba a correção
    async def quebra(*a, **k):
        raise RuntimeError("push fora do ar")
    monkeypatch.setattr("app.services.web_push_service.notify_tenant", quebra)
    r = await test_client.post(f"{API}/finance/accounts/{contas['Gaveta']}/adjust", headers=h,
                               json={"target_balance": "70", "reason": "outra correcao"})
    assert r.status_code == 200, r.text
    assert len(await _log(async_session, t_id, "FINANCE_ACCOUNT_ADJUSTED")) == 2
    _ = UserRole


# ───────────────────────── registro geral: TODA gravação deixa rastro ─────────────────────────
async def test_gravacoes_sem_mapa_proprio_tambem_sao_registradas(test_client, async_session):
    """Fornecedor, categoria e papel de usuário não estavam na lista manual: a regra geral registra quem, antes e depois."""
    t_id, admin, h = await _loja(test_client, async_session)
    r = await test_client.post(f"{API}/suppliers", headers=h, json={"name": "Loja Aud Um"})
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    r = await test_client.put(f"{API}/suppliers/{sid}", headers=h, json={"name": "Loja Aud Dois"})
    assert r.status_code == 200, r.text
    (criou,) = await _log(async_session, t_id, "ROTA_POST_SUPPLIERS")
    criou_user, criou_det = criou.user_id, _detail(criou)       # lê agora: o próximo _log expira os objetos
    (mudou,) = await _log(async_session, t_id, "ROTA_PUT_SUPPLIERS")
    assert criou_user == admin.id and criou_det["metodo"] == "POST"
    d = _detail(mudou)
    assert d["antes"]["name"] == "Loja Aud Um" and d["depois"]["name"] == "Loja Aud Dois" and d["rota"] == "/suppliers/{supplier_id}"
    assert (await test_client.delete(f"{API}/suppliers/{sid}", headers=h)).status_code in (200, 204)
    assert len(await _log(async_session, t_id, "ROTA_DELETE_SUPPLIERS")) == 1

    r = await test_client.post(f"{API}/categories/", headers=h, json={"name": "Categoria Aud"})
    assert r.status_code in (200, 201), r.text
    assert len(await _log(async_session, t_id, "ROTA_POST_CATEGORIES")) == 1

    r = await test_client.post(f"{API}/team", headers=h, json={
        "email": "papel.aud@example.com", "full_name": "Papel Aud", "password": "Senha1234", "role": "seller"})
    uid = r.json()["id"]
    r = await test_client.patch(f"{API}/team/{uid}/role", headers=h, json={"role": "manager"})
    assert r.status_code == 200, r.text
    rows = await _log(async_session, t_id, "ROTA_PATCH_TEAM_ROLE") + await _log(async_session, t_id, "USER_ROLE_CHANGED")
    assert rows, "mudar o papel de um usuário tem que ficar registrado"


async def test_leitura_e_login_nao_viram_alteracao(test_client, async_session):
    t_id, admin, h = await _loja(test_client, async_session)
    antes = len((await async_session.execute(select(AuditLog).where(AuditLog.tenant_id == t_id, AuditLog.action.like("ROTA\_%", escape="\\")))).scalars().all())
    assert (await test_client.get(f"{API}/suppliers", headers=h)).status_code == 200
    assert (await test_client.post(f"{API}/products/fifo-costs", headers=h, json=[])).status_code in (200, 422)
    async_session.expire_all()
    depois = len((await async_session.execute(select(AuditLog).where(AuditLog.tenant_id == t_id, AuditLog.action.like("ROTA\_%", escape="\\")))).scalars().all())
    assert depois == antes                      # GET e consulta por POST não entram no histórico


async def test_acessos_ficam_a_parte_e_fora_da_lista_de_alteracoes(test_client, async_session):
    t_id, admin, h = await _loja(test_client, async_session)
    async_session.add(AuditLog(tenant_id=t_id, user_id=admin.id, user_email=admin.email, action="LOGIN_SUCCESS"))
    async_session.add(AuditLog(tenant_id=t_id, user_id=admin.id, user_email=admin.email, action="CUSTOMER_VIEWED"))
    await async_session.commit()
    await test_client.post(f"{API}/suppliers", headers=h, json={"name": "So Para Filtrar"})
    todos = (await test_client.get(f"{API}/audit", headers=h, params={"limit": 100})).json()
    assert {"LOGIN_SUCCESS", "CUSTOMER_VIEWED", "ROTA_POST_SUPPLIERS"} <= {i["action"] for i in todos["items"]}
    alteracoes = (await test_client.get(f"{API}/audit", headers=h, params={"limit": 100, "exclude_category": "acessos"})).json()
    acoes = {i["action"] for i in alteracoes["items"]}
    assert "ROTA_POST_SUPPLIERS" in acoes and "LOGIN_SUCCESS" not in acoes and "CUSTOMER_VIEWED" not in acoes
    so_acessos = (await test_client.get(f"{API}/audit", headers=h, params={"category": "acessos", "limit": 100})).json()
    assert {i["action"] for i in so_acessos["items"]} <= {"LOGIN_SUCCESS", "LOGIN_FAILED", "CUSTOMER_VIEWED"} and so_acessos["total_count"] >= 2
    estoque = (await test_client.get(f"{API}/audit", headers=h, params={"category": "estoque", "limit": 100})).json()
    assert any(i["action"] == "ROTA_POST_SUPPLIERS" for i in estoque["items"])      # fornecedor conta como estoque/cadastros


async def test_toda_rota_que_grava_e_registrada_ou_tem_motivo_para_nao_ser():
    """Trava: rota nova que grava dados passa a ser registrada sozinha. Esta lista só muda de propósito (com motivo em audit_trail)."""
    from app.main import app
    from app.services.audit_trail import is_excluded, match_route
    fora = set()
    for r in app.routes:
        m = getattr(r, "methods", None)
        p = getattr(r, "path_format", None) or getattr(r, "path", None)
        if not m or not p or not p.startswith("/api/v1"):
            continue
        for meth in m:
            if meth in ("POST", "PUT", "PATCH", "DELETE") and not match_route(meth, p):
                assert is_excluded(meth, p), f"{meth} {p} grava e não está registrada nem justificada"
                fora.add(f"{meth} {p.replace('/api/v1', '')}")
    esperadas = {
        "DELETE /customers/{customer_id}", "PUT /customers/{customer_id}", "POST /customers/{customer_id}/anonymize",
        "POST /customers/{customer_id}/loyalty/adjust", "DELETE /stock-entries/{entry_id}", "DELETE /stock-entries/entry-items/{item_id}",
        "POST /finance/accounts/{account_id}/adjust", "PATCH /finance/accounts/{account_id}", "POST /sales/", "POST /sales/{sale_id}/cancel",
    }
    assert esperadas <= fora                       # as que já têm registro próprio mais detalhado
    assert "POST /auth/register" not in fora       # criar usuário tem que ficar registrado
    for sensivel in ("DELETE /products/{product_id}", "DELETE /product-variants/{variant_id}", "POST /products/{product_id}/adjust-quantity",
                     "POST /stock-import/commit", "PATCH /team/{user_id}/reset-password", "POST /returns/{sale_id}",
                     "PUT /store/pix", "POST /suppliers", "PUT /suppliers/{supplier_id}"):
        assert sensivel not in fora, f"{sensivel} precisa ficar registrada"
