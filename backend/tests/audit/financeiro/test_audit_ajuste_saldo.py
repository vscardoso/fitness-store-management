"""Ajuste de saldo (POST /finance/accounts/{id}/adjust) e correcao do saldo de partida (PATCH /finance/accounts/{id}), so admin."""
from datetime import date, timedelta
from decimal import Decimal as D

import pytest

from app.models.user import UserRole
from tests.audit.financeiro.test_audit_financeiro import _token
from tests.test_financeiro import _conta, _implantar, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (autouse)
from tests.test_team_limit import _nova_loja
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"
HOJE = date.today()


async def _saldos(c, h):
    d = (await c.get(f"{API}/accounts", headers=h)).json()
    return {a["name"]: D(str(a["balance"])) for a in d["accounts"]}, d


async def _pronto(async_session, test_user, client):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(client, h, payables=[])).json()
    return t_id, h, {a["name"]: a["id"] for a in d["accounts"]}


async def test_ajuste_sobe_desce_e_nao_vira_resultado(test_client, async_session, test_user):
    t_id, h, ids, = await _pronto(async_session, test_user, test_client)
    c = test_client
    res0 = (await c.get("/api/v1/expenses/resultado-mes", params={"year": HOJE.year, "month": HOJE.month}, headers=h)).json()
    rel0 = (await c.get("/api/v1/reports/monthly", params={"year": HOJE.year, "month": HOJE.month}, headers=h)).json()["result"]["current"]
    # sobe a gaveta (150 -> 7500)
    r = await c.post(f"{API}/accounts/{ids['Gaveta']}/adjust", headers=h, json={"target_balance": "7500.00", "reason": "Contagem da gaveta"})
    assert r.status_code == 200, r.text
    assert D(str(_conta(r.json(), "Gaveta")["balance"])) == D("7500.00") and "warning" not in r.json()
    # desce a maquininha (300 -> 120.50)
    r = await c.post(f"{API}/accounts/{ids['Maquininha a receber']}/adjust", headers=h, json={"target_balance": "120.50", "reason": "Extrato da maquininha"})
    assert r.status_code == 200, r.text
    s, d = await _saldos(c, h)
    assert s["Gaveta"] == D("7500.00") and s["Maquininha a receber"] == D("120.50")
    assert all(a["opening_balance"] == a["breakdown"]["opening"] for a in d["accounts"])
    # entra como lancamento "outra entrada/saida" de hoje com o motivo
    es = (await c.get(f"{API}/entries", headers=h)).json()
    por_conta = {e["account_id"]: e for e in es}
    assert por_conta[ids["Gaveta"]]["kind"] == "other_in" and D(str(por_conta[ids["Gaveta"]]["amount"])) == D("7350.00")
    assert por_conta[ids["Gaveta"]]["description"] == "Ajuste de saldo: Contagem da gaveta"
    assert por_conta[ids["Maquininha a receber"]]["kind"] == "other_out"
    assert por_conta[ids["Gaveta"]]["occurred_on"] == HOJE.isoformat()
    # Resultado do Mes e relatorio mensal nao mudam
    res1 = (await c.get("/api/v1/expenses/resultado-mes", params={"year": HOJE.year, "month": HOJE.month}, headers=h)).json()
    rel1 = (await c.get("/api/v1/reports/monthly", params={"year": HOJE.year, "month": HOJE.month}, headers=h)).json()["result"]["current"]
    assert res1 == res0 and rel1 == rel0
    # fechamento do mes: aparece como outras entradas/saidas, nao como quebra
    fe = (await c.get(f"{API}/closings/{HOJE.year}/{HOJE.month}", headers=h)).json()
    outras = {x["kind"]: D(str(x["amount"])) for x in fe["entered"]["other"]}
    assert outras["other_in"] == D("7350.00")
    assert {x["kind"]: D(str(x["amount"])) for x in fe["left"]["other"]}["other_out"] == D("179.50")
    assert fe["check_ok"] is True
    # auditoria: quem, antes, depois, motivo
    from sqlalchemy import select
    from app.models.audit_log import AuditLog
    logs = (await async_session.execute(select(AuditLog).where(AuditLog.action == "FINANCE_ACCOUNT_ADJUSTED", AuditLog.tenant_id == t_id))).scalars().all()
    assert len(logs) == 2 and "Contagem da gaveta" in logs[0].detail and "7500" in logs[0].detail and "150" in logs[0].detail and logs[0].user_email


async def test_ajuste_recusas_e_aviso_do_banco(test_client, async_session, test_user):
    t_id, h, ids = await _pronto(async_session, test_user, test_client)
    c = test_client
    g, m, n = ids["Gaveta"], ids["Maquininha a receber"], ids["Nubank"]
    ok = {"reason": "Conferi o extrato"}
    r = await c.post(f"{API}/accounts/{g}/adjust", headers=h, json={"target_balance": "150.00", **ok})      # diferenca zero
    assert r.status_code == 400 and "nada para ajustar" in r.json()["detail"]
    for conta in (g, m):                                                                                    # dinheiro fisico nao fica negativo
        r = await c.post(f"{API}/accounts/{conta}/adjust", headers=h, json={"target_balance": "-1", **ok})
        assert r.status_code == 400 and "negativa" in r.json()["detail"]
    r = await c.post(f"{API}/accounts/{n}/adjust", headers=h, json={"target_balance": "-200.00", **ok})    # banco pode, com aviso
    assert r.status_code == 200 and "negativa" in r.json()["warning"]
    assert D(str(_conta(r.json(), "Nubank")["balance"])) == D("-200.00")
    for body in ({"target_balance": "10", "reason": "abc"}, {"target_balance": "10"}, {"target_balance": "abc", **ok},
                 {"target_balance": "NaN", **ok}, {"reason": "motivo ok"}):
        r = await c.post(f"{API}/accounts/{g}/adjust", headers=h, json=body)
        assert r.status_code == 400, (body, r.status_code, r.text)
    for conta in ("abc", "0", "-3"):
        assert (await c.post(f"{API}/accounts/{conta}/adjust", headers=h, json={"target_balance": "5", **ok})).status_code == 400
    assert (await c.post(f"{API}/accounts/999999/adjust", headers=h, json={"target_balance": "5", **ok})).status_code == 404
    assert (await c.patch(f"{API}/accounts/abc", headers=h, json={"opening_balance": "5"})).status_code == 400


async def test_so_admin_ajusta_e_corrige(test_client, async_session, test_user):
    t_id, h, ids = await _pronto(async_session, test_user, test_client)
    for papel in (UserRole.CASHIER, UserRole.SELLER, UserRole.MANAGER):
        hh = await _token(async_session, t_id, papel)
        r = await test_client.post(f"{API}/accounts/{ids['Gaveta']}/adjust", headers=hh, json={"target_balance": "5", "reason": "tentativa"})
        assert r.status_code == 403, (papel, r.status_code)
        r = await test_client.patch(f"{API}/accounts/{ids['Gaveta']}", headers=hh, json={"opening_balance": "5"})
        assert r.status_code == 403, (papel, r.status_code)
    s, _ = await _saldos(test_client, h)
    assert s["Gaveta"] == D("150.00")


async def test_partida_corrige_nome_e_recusa_com_mes_fechado(test_client, async_session, test_user):
    t_id, h, ids = await _pronto(async_session, test_user, test_client)
    c = test_client
    r = await c.patch(f"{API}/accounts/{ids['Nubank']}", headers=h, json={"opening_balance": "1200.00", "name": "Nubank PJ"})
    assert r.status_code == 200, r.text
    assert D(str(_conta(r.json(), "Nubank PJ")["balance"])) == D("1200.00") and _conta(r.json(), "Nubank PJ")["opening_balance"] == 1200.0
    r = await c.patch(f"{API}/accounts/{ids['Gaveta']}", headers=h, json={"name": "Caixa"})                 # nao renomeia gaveta
    assert r.status_code == 400
    r = await c.patch(f"{API}/accounts/{ids['Gaveta']}", headers=h, json={"opening_balance": "-5"})         # gaveta de partida negativa
    assert r.status_code == 400
    r = await c.patch(f"{API}/accounts/{ids['Nubank']}", headers=h, json={"name": "itaú"})                  # nome repetido
    assert r.status_code == 400
    from sqlalchemy import select
    from app.models.audit_log import AuditLog
    assert (await async_session.execute(select(AuditLog).where(AuditLog.action == "FINANCE_ACCOUNT_UPDATED", AuditLog.tenant_id == t_id))).scalars().first()


async def test_partida_com_mes_fechado_e_409(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    mp = (HOJE.replace(day=1) - timedelta(days=1)).replace(day=1)
    d = (await _implantar(test_client, h, start_date=mp.isoformat(), payables=[])).json()
    ids = {a["name"]: a["id"] for a in d["accounts"]}
    cont = {str(a["id"]): str(a["balance"]) for a in d["accounts"]}
    assert (await test_client.post(f"{API}/closings/{mp.year}/{mp.month}", headers=h, json={"counted": cont})).status_code == 200
    r = await test_client.patch(f"{API}/accounts/{ids['Nubank']}", headers=h, json={"opening_balance": "999"})
    assert r.status_code == 409 and "fechado" in r.json()["detail"]
    # o ajuste de hoje continua valendo (mes atual aberto)
    r = await test_client.post(f"{API}/accounts/{ids['Nubank']}/adjust", headers=h, json={"target_balance": "999", "reason": "Conferi o extrato"})
    assert r.status_code == 200, r.text


async def test_loja_b_nao_ajusta_conta_da_loja_a(test_client, async_session):
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)
    _, _, ta = await _nova_loja(async_session, "pro")
    _, _, tb = await _nova_loja(async_session, "pro")
    a, b = {"Authorization": f"Bearer {ta}"}, {"Authorization": f"Bearer {tb}"}
    r = await test_client.post(f"{API}/setup", headers=a, json={"start_date": HOJE.isoformat(), "cash_balance": "100", "banks": [{"name": "Banco", "balance": "500"}]})
    assert r.status_code == 200, r.text
    conta_a = next(x["id"] for x in r.json()["accounts"] if x["name"] == "Banco")
    assert (await test_client.post(f"{API}/setup", headers=b, json={"start_date": HOJE.isoformat(), "cash_balance": "1"})).status_code == 200
    r = await test_client.post(f"{API}/accounts/{conta_a}/adjust", headers=b, json={"target_balance": "1", "reason": "invasao teste"})
    assert r.status_code == 404
    r = await test_client.patch(f"{API}/accounts/{conta_a}", headers=b, json={"opening_balance": "1"})
    assert r.status_code == 404
    saldo = next(x for x in (await test_client.get(f"{API}/accounts", headers=a)).json()["accounts"] if x["id"] == conta_a)
    assert saldo["balance"] == 500.0
