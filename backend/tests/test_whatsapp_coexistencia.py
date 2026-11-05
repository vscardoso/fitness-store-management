"""WhatsApp em coexistência (celular da loja + Cloud API): Embedded Signup e os webhooks extras.

Meta SIMULADA (transporte httpx falso); nenhum número real. Os formatos dos webhooks smb_message_echoes, history,
smb_app_state_sync e account_update seguem a documentação da Meta e NÃO foram conferidos com payload real.
"""
import itertools
import json
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import func, select

from app.core import secret_box
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppContact, WhatsAppConversation, WhatsAppMessage
from app.services import whatsapp_connect_service as connect_svc
from tests.test_whatsapp_cloud import (  # noqa: F401  (fixtures reaproveitadas)
    SECRET, URL, _number, client, event, session_maker, sign, text_msg,
)
from tests.test_whatsapp_saudacao import Meta, _post, _saidas, agora

pytestmark = pytest.mark.asyncio
_seq = itertools.count(1)
CONNECT = "/api/v1/whatsapp/connect/embedded-signup"
STATUS = "/api/v1/whatsapp/connect/status"
TOKEN_NEGOCIO = "EAAG-token-de-negocio-falso"


@pytest.fixture(autouse=True)
def _config(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "token-de-teste")
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_APP_ID", "1234567890")
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_APP_SECRET", SECRET)
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_GRAPH_BASE", "https://graph.teste")


def _sem_override():
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)


async def _admin(db, role=UserRole.ADMIN):
    n = next(_seq)
    store = Store(name=f"Loja Coex {n}", slug=f"loja-coex-{n}", subdomain=f"coex-{n}", is_default=False, is_active=True)
    db.add(store)
    await db.flush()
    u = User(email=f"coex.{n}@example.com", full_name="Admin", hashed_password=get_password_hash("Senha1234"),
             role=role, tenant_id=store.id, is_active=True)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    h = {"Authorization": "Bearer " + create_access_token(data={"sub": str(u.id)}), "X-Tenant-Id": str(store.id)}
    return store, h


class GraphFalsa:
    """Graph API falsa. `falhar` = {chave: resposta}; chave = "oauth", "subscribe", "number", "smb_app_state_sync",
    "history" ou "rede:<chave>" para simular queda de rede."""

    def __init__(self, monkeypatch, falhar=None):
        self.chamadas = []
        self.falhar = falhar or {}

        def handler(request: httpx.Request):
            path = request.url.path
            body = json.loads(request.content) if request.content else None
            self.chamadas.append((request.method, path, dict(request.url.params), body, request.headers.get("authorization")))
            if path.endswith("/oauth/access_token"):
                key = "oauth"
                ok = httpx.Response(200, json={"access_token": TOKEN_NEGOCIO, "token_type": "bearer"})
            elif path.endswith("/subscribed_apps"):
                key, ok = "subscribe", httpx.Response(200, json={"success": True})
            elif path.endswith("/smb_app_data"):
                key, ok = body["sync_type"], httpx.Response(200, json={"success": True})
            elif path.endswith("/register"):
                key, ok = "register", httpx.Response(200, json={"success": True})
            else:
                key = "number"
                ok = httpx.Response(200, json={"display_phone_number": "+55 34 99650-0091", "verified_name": "W.A Fitness",
                                               "id": path.rsplit("/", 1)[-1]})
            if f"rede:{key}" in self.falhar:
                raise httpx.ConnectTimeout("lento")
            return self.falhar.get(key, ok)

        transport = httpx.MockTransport(handler)
        monkeypatch.setattr(connect_svc, "_client", lambda: httpx.AsyncClient(transport=transport))

    def caminhos(self):
        return [(m, p.split("/v", 1)[-1].split("/", 1)[-1]) for m, p, *_ in self.chamadas]


def _corpo(pnid, coexistence=True, **extra):
    return {"code": "CODIGO-FALSO", "phone_number_id": pnid, "waba_id": "WABA-COEX", "business_id": "BIZ-1",
            "coexistence": coexistence, **extra}


async def _numeros(db, pnid):
    return (await db.execute(select(func.count()).select_from(WhatsAppCloudNumber).where(
        WhatsAppCloudNumber.phone_number_id == pnid))).scalar()


# ── Embedded Signup ───────────────────────────────────────────────────────────

async def test_conexao_coexistencia_troca_codigo_inscreve_pede_agenda_e_historico(test_client, async_session, monkeypatch):
    _sem_override()
    store, h = await _admin(async_session)
    meta = GraphFalsa(monkeypatch)
    pnid = f"PN-COEX-{store.id}"
    r = await test_client.post(CONNECT, json=_corpo(pnid), headers=h)
    assert r.status_code == 200, r.text
    assert TOKEN_NEGOCIO not in r.text and "token" not in json.dumps(r.json()).replace("has_business_token", "")
    out = r.json()
    assert out["is_coexistence"] and out["connection_status"] == "connected" and out["has_business_token"]
    assert out["display_phone_number"] == "+55 34 99650-0091" and out["history_sync"]["status"] == "requested"

    # ordem e conteúdo das chamadas à Meta; nada de /register na coexistência
    assert meta.caminhos() == [
        ("GET", "oauth/access_token"), ("POST", "WABA-COEX/subscribed_apps"), ("GET", pnid),
        ("POST", f"{pnid}/smb_app_data"), ("POST", f"{pnid}/smb_app_data"),
    ]
    _, _, params, _, auth = meta.chamadas[0]
    assert params == {"client_id": "1234567890", "client_secret": SECRET, "code": "CODIGO-FALSO"} and auth is None
    assert all(c[4] == f"Bearer {TOKEN_NEGOCIO}" for c in meta.chamadas[1:])
    assert meta.chamadas[2][2] == {"fields": "display_phone_number,verified_name"}
    assert [c[3] for c in meta.chamadas[3:]] == [
        {"messaging_product": "whatsapp", "sync_type": "smb_app_state_sync"},
        {"messaging_product": "whatsapp", "sync_type": "history"},
    ]

    n = (await async_session.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
    await async_session.refresh(n)
    assert n.tenant_id == store.id and n.is_coexistence and n.waba_id == "WABA-COEX" and n.business_id == "BIZ-1"
    assert n.access_token_encrypted and TOKEN_NEGOCIO not in n.access_token_encrypted
    assert secret_box.decrypt(n.access_token_encrypted) == TOKEN_NEGOCIO
    assert n.contacts_sync_requested_at and n.history_sync_requested_at

    s = await test_client.get(STATUS, headers=h)
    assert s.status_code == 200 and TOKEN_NEGOCIO not in s.text and n.access_token_encrypted not in s.text
    assert s.json()["configured"] and s.json()["app_id"] == "1234567890"
    assert [x["phone_number_id"] for x in s.json()["numbers"]] == [pnid]


async def test_numero_normal_nao_pede_historico(test_client, async_session, monkeypatch):
    _sem_override()
    store, h = await _admin(async_session)
    meta = GraphFalsa(monkeypatch)
    r = await test_client.post(CONNECT, json=_corpo(f"PN-NORMAL-{store.id}", coexistence=False), headers=h)
    assert r.status_code == 200 and not r.json()["is_coexistence"]
    assert [p for _, p in meta.caminhos() if p.endswith("smb_app_data")] == []


@pytest.mark.parametrize("falhar", [
    {"oauth": httpx.Response(400, json={"error": {"code": 100, "message": "code expired"}})},
    {"oauth": httpx.Response(200, json={"token_type": "bearer"})},           # sem access_token
    {"rede:oauth": True},
    {"subscribe": httpx.Response(500, json={"error": {"code": 2}})},
    {"subscribe": httpx.Response(200, json={"success": False})},
    {"number": httpx.Response(403, json={"error": {"code": 200}})},
    {"smb_app_state_sync": httpx.Response(400, json={"error": {"code": 131000}})},
    {"history": httpx.Response(400, json={"error": {"code": 131000}})},
    {"rede:history": True},
])
async def test_qualquer_falha_da_meta_vira_424_legivel_e_nada_gravado(test_client, async_session, monkeypatch, falhar):
    _sem_override()
    store, h = await _admin(async_session)
    GraphFalsa(monkeypatch, falhar=falhar)
    pnid = f"PN-FALHA-{store.id}"
    r = await test_client.post(CONNECT, json=_corpo(pnid), headers=h)
    assert r.status_code == 424, r.text
    detail = r.json().get("detail") or r.json().get("message") or ""
    assert detail and SECRET not in r.text and TOKEN_NEGOCIO not in r.text and "code expired" not in r.text
    assert await _numeros(async_session, pnid) == 0


async def test_numero_de_outra_loja_recusado_sem_gastar_o_codigo(test_client, async_session, monkeypatch):
    _sem_override()
    outra, _ = await _admin(async_session)
    outra_id = outra.id
    pnid = f"PN-DA-OUTRA-{outra_id}"
    async_session.add(WhatsAppCloudNumber(tenant_id=outra_id, phone_number_id=pnid, waba_id="W"))
    await async_session.commit()
    store, h = await _admin(async_session)
    meta = GraphFalsa(monkeypatch)
    r = await test_client.post(CONNECT, json=_corpo(pnid), headers=h)
    assert r.status_code == 409 and meta.chamadas == []
    n = (await async_session.execute(select(WhatsAppCloudNumber).where(
        WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
    assert n.tenant_id == outra_id


async def test_reconectar_reativa_o_mesmo_numero_e_sem_configuracao_recusa(test_client, async_session, monkeypatch):
    _sem_override()
    store, h = await _admin(async_session)
    pnid = f"PN-VOLTA-{store.id}"
    async_session.add(WhatsAppCloudNumber(tenant_id=store.id, phone_number_id=pnid, is_active=False,
                                          connection_status="disconnected"))
    await async_session.commit()
    GraphFalsa(monkeypatch)
    r = await test_client.post(CONNECT, json=_corpo(pnid), headers=h)
    assert r.status_code == 200 and r.json()["connection_status"] == "connected" and r.json()["warning"] is None
    assert await _numeros(async_session, pnid) == 1
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_APP_ID", "")
    r = await test_client.post(CONNECT, json=_corpo(f"PN-SEM-CONFIG-{store.id}"), headers=h)
    assert r.status_code == 424


async def test_so_admin_conecta_e_ve_o_estado(test_client, async_session, monkeypatch):
    _sem_override()
    meta = GraphFalsa(monkeypatch)
    for role in (UserRole.MANAGER, UserRole.SELLER, UserRole.CASHIER):
        store, h = await _admin(async_session, role=role)
        assert (await test_client.post(CONNECT, json=_corpo(f"PN-ROLE-{store.id}"), headers=h)).status_code == 403
        assert (await test_client.get(STATUS, headers=h)).status_code == 403
    assert meta.chamadas == []


# ── webhooks da coexistência ─────────────────────────────────────────────────

def _change(pnid, fld, value, waba="WABA_TESTE"):
    value = {"messaging_product": "whatsapp",
             "metadata": {"display_phone_number": "5534996500091", "phone_number_id": pnid}, **value}
    return {"object": "whatsapp_business_account", "entry": [{"id": waba, "changes": [{"field": fld, "value": value}]}]}


async def _coex(session_maker, pnid, **attrs):
    async with session_maker() as s:
        n = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
        n.display_phone_number = "+55 34 99650-0091"
        for k, v in attrs.items():
            setattr(n, k, v)
        await s.commit()


async def _msgs(session_maker, tenant_id):
    async with session_maker() as s:
        return (await s.execute(select(WhatsAppMessage).where(WhatsAppMessage.tenant_id == tenant_id)
                                .order_by(WhatsAppMessage.sent_at, WhatsAppMessage.id))).scalars().all()


async def _conv(session_maker, tenant_id):
    async with session_maker() as s:
        return (await s.execute(select(WhatsAppConversation).where(WhatsAppConversation.tenant_id == tenant_id)
                                .order_by(WhatsAppConversation.id))).scalars().all()


async def test_eco_do_celular_vira_saida_sem_duplicar_e_sem_mexer_na_janela(client, session_maker):
    tenant, pnid = await _number(session_maker)
    await _coex(session_maker, pnid, is_coexistence=True)
    fone = "5534988881111"
    assert (await _post(client, event(pnid, [text_msg(frm=fone, ts=agora() - 60)]))).status_code == 200
    antes = (await _conv(session_maker, tenant))[0]
    assert antes.unread_count == 1
    eco = {"from": "5534996500091", "to": fone, "id": "wamid.ECO1", "timestamp": str(agora()), "type": "text",
           "text": {"body": "Oi! Temos sim"}}
    for _ in range(2):   # reentrega
        r = await _post(client, _change(pnid, "smb_message_echoes", {"message_echoes": [eco]}))
        assert r.status_code == 200
    msgs = await _msgs(session_maker, tenant)
    assert [(m.direction, m.source, m.text) for m in msgs] == [("in", None, "oi"), ("out", "phone_app", "Oi! Temos sim")]
    conv = (await _conv(session_maker, tenant))[0]
    assert conv.last_inbound_at == antes.last_inbound_at and conv.unread_count == 0
    assert conv.last_message_at > antes.last_message_at


async def test_historico_idempotente_pula_grupos_e_recusa_registrada(client, session_maker):
    tenant, pnid = await _number(session_maker)
    await _coex(session_maker, pnid, is_coexistence=True, history_sync_status="requested")
    fone, t0 = "5534988882222", agora() - 86400 * 30
    payload = _change(pnid, "history", {"history": [{
        "metadata": {"phase": 0, "chunk_order": 1, "progress": 40},
        "threads": [
            {"id": fone, "messages": [
                {"from": fone, "id": "wamid.H1", "timestamp": str(t0), "type": "text", "text": {"body": "tem legging?"},
                 "history_context": {"status": "READ"}},
                {"from": "5534996500091", "to": fone, "id": "wamid.H2", "timestamp": str(t0 + 60), "type": "text",
                 "text": {"body": "Tem sim"}, "history_context": {"status": "DELIVERED"}},
                {"from": fone, "id": "wamid.H3", "timestamp": str(t0 + 120), "type": "media_placeholder"},
            ]},
            {"id": "120363000000000000@g.us", "messages": [
                {"from": "5534977770000", "id": "wamid.GRUPO", "timestamp": str(t0), "type": "text", "text": {"body": "grupo"}},
            ]},
        ],
    }]})
    for _ in range(2):
        assert (await _post(client, payload)).status_code == 200
    msgs = await _msgs(session_maker, tenant)
    assert [(m.wamid, m.direction, m.status, m.source) for m in msgs] == [
        ("wamid.H1", "in", "received", "history"), ("wamid.H2", "out", "delivered", "history"),
        ("wamid.H3", "in", "received", "history"),
    ]
    convs = await _conv(session_maker, tenant)
    assert len(convs) == 1 and convs[0].unread_count == 0 and convs[0].last_inbound_at is None
    async with session_maker() as s:
        n = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
        assert (n.history_sync_status, n.history_sync_phase, n.history_sync_progress) == ("receiving", 0, 40)
    # última fase completa
    fim = _change(pnid, "history", {"history": [{"metadata": {"phase": 2, "chunk_order": 9, "progress": 100}, "threads": []}]})
    assert (await _post(client, fim)).status_code == 200
    # a loja recusou compartilhar
    recusa = _change(pnid, "history", {"history": [{"errors": [{"code": 2593109, "title": "declined"}]}]})
    assert (await _post(client, recusa)).status_code == 200
    async with session_maker() as s:
        n = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
        assert n.history_sync_status == "declined"


async def test_agenda_do_celular_preenche_nomes_e_remover_nao_apaga(client, session_maker):
    tenant, pnid = await _number(session_maker)
    await _coex(session_maker, pnid, is_coexistence=True)
    fone = "5534988883333"
    assert (await _post(client, event(pnid, [text_msg(frm=fone, ts=agora())]))).status_code == 200

    def sync(action, phone, full="Maria Cliente", first="Maria"):
        return _change(pnid, "smb_app_state_sync", {"state_sync": [{
            "type": "contact", "action": action, "metadata": {"timestamp": str(agora())},
            "contact": {"full_name": full, "first_name": first, "phone_number": phone}}]})

    assert (await _post(client, sync("add", "+55 34 98888-3333"))).status_code == 200
    # contato que ainda não conversou: o nome vai para a conversa quando ela nascer (pelo histórico, por exemplo)
    assert (await _post(client, sync("add", "5534977774444", "Joana Souza", "Joana"))).status_code == 200
    hist = _change(pnid, "history", {"history": [{"metadata": {"phase": 0, "progress": 10}, "threads": [{
        "id": "5534977774444", "messages": [{"from": "5534977774444", "id": "wamid.HJ", "timestamp": str(agora() - 999),
                                            "type": "text", "text": {"body": "oi"}}]}]}]})
    assert (await _post(client, hist)).status_code == 200
    names = {c.phone: c.contact_name for c in await _conv(session_maker, tenant)}
    assert names == {fone: "Maria Cliente", "5534977774444": "Joana Souza"}
    assert (await _post(client, sync("remove", fone))).status_code == 200
    async with session_maker() as s:
        c = (await s.execute(select(WhatsAppContact).where(WhatsAppContact.phone == fone,
                                                            WhatsAppContact.tenant_id == tenant))).scalar_one()
        assert c.is_active is False and c.full_name == "Maria Cliente"
    assert {c.phone: c.contact_name for c in await _conv(session_maker, tenant)}[fone] == "Maria Cliente"


async def test_account_update_muda_o_estado_da_conexao(client, session_maker):
    tenant, pnid = await _number(session_maker)
    waba = f"WABA-AU-{tenant}"
    await _coex(session_maker, pnid, is_coexistence=True, waba_id=waba, connection_status="connected")

    async def evento(value):
        payload = {"object": "whatsapp_business_account",
                   "entry": [{"id": waba, "changes": [{"field": "account_update", "value": value}]}]}
        assert (await _post(client, payload)).status_code == 200
        async with session_maker() as s:
            return (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()

    n = await evento({"phone_number": "5534996500091", "event": "ACCOUNT_UPDATE",
                      "disconnection_info": {"reason": "PRIMARY_INACTIVITY"}})
    assert n.connection_status == "disconnected" and json.loads(n.connection_detail)["reason"] == "PRIMARY_INACTIVITY"
    assert connect_svc.number_status(n)["warning"]
    n = await evento({"event": "ACCOUNT_RECONNECTED", "waba_info": {"waba_id": waba}})
    assert n.connection_status == "connected" and n.connection_event == "ACCOUNT_RECONNECTED"
    n = await evento({"event": "PARTNER_REMOVED"})
    assert n.connection_status == "disconnected"
    n = await evento({"event": "EVENTO_NOVO_QUALQUER"})
    assert n.connection_status == "disconnected" and n.connection_event == "EVENTO_NOVO_QUALQUER"
    # payload estranho não derruba o webhook
    assert (await _post(client, {"object": "whatsapp_business_account", "entry": [{"id": waba, "changes": [
        {"field": "account_update", "value": {}}, {"field": "history", "value": {"history": "x"}},
        {"field": "smb_app_state_sync", "value": {"metadata": {"phone_number_id": pnid}, "state_sync": [None, {"contact": {}}]}},
    ]}]})).status_code == 200


async def test_saudacao_e_ausencia_nao_disparam_na_coexistencia(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    fechada = json.dumps({d: [] for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")})
    # número normal: saudação e ausência continuam funcionando
    t_norm, p_norm = await _number(session_maker)
    await _coex(session_maker, p_norm, greeting_enabled=True, greeting_text="Olá!")
    t_aus, p_aus = await _number(session_maker)
    await _coex(session_maker, p_aus, away_enabled=True, away_text="Fechada", business_hours=fechada)
    assert (await _post(client, event(p_norm, [text_msg(frm="5511987659001", ts=agora())]))).status_code == 200
    assert (await _post(client, event(p_aus, [text_msg(frm="5511987659002", ts=agora())]))).status_code == 200
    assert len(meta.enviadas) == 2
    # coexistência: nada sai, mesmo com as duas ligadas
    t_coex, p_coex = await _number(session_maker)
    await _coex(session_maker, p_coex, is_coexistence=True, greeting_enabled=True, greeting_text="Olá!",
                away_enabled=True, away_text="Fechada", business_hours=fechada)
    t_coex2, p_coex2 = await _number(session_maker)
    await _coex(session_maker, p_coex2, is_coexistence=True, greeting_enabled=True, greeting_text="Olá!")
    for p, fone in ((p_coex, "5511987659003"), (p_coex2, "5511987659004")):
        r = await _post(client, event(p, [text_msg(frm=fone, ts=agora())]))
        assert r.status_code == 200 and r.json()["saved"] == 1
    assert len(meta.enviadas) == 2
    assert await _saidas(session_maker, t_coex) == [] and await _saidas(session_maker, t_coex2) == []
    # nem a trava foi tomada (a decisão já pula a coexistência; o envio em segundo plano confere de novo)
    for t in (t_coex, t_coex2):
        assert [(c.last_greeting_at, c.last_away_at) for c in await _conv(session_maker, t)] == [(None, None)]
