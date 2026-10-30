"""WhatsApp oficial: caixa de conversas e envio de texto (Meta simulada; nenhum número real)."""
import itertools
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppConversation, WhatsAppMessage
from app.services import whatsapp_cloud_service as svc

pytestmark = pytest.mark.asyncio
_seq = itertools.count(1)


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "token-de-teste")


def _sem_override():
    """O conftest força a loja 1 em toda rota; aqui vale a loja do usuário logado (chamar DENTRO do teste)."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)


async def _loja(db, role=UserRole.SELLER):
    n = next(_seq)
    store = Store(name=f"Loja Zap {n}", slug=f"loja-zap-{n}", subdomain=f"zap-{n}", is_default=False, is_active=True)
    db.add(store)
    await db.flush()
    num = WhatsAppCloudNumber(tenant_id=store.id, phone_number_id=f"pn-{n}-{store.id}")
    db.add(num)
    u = User(email=f"zap.{n}@example.com", full_name="Vendedora", hashed_password=get_password_hash("Senha1234"),
             role=role, tenant_id=store.id, is_active=True)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    await db.refresh(num)
    h = {"Authorization": "Bearer " + create_access_token(data={"sub": str(u.id)}), "X-Tenant-Id": str(store.id)}
    return store, num, h


async def _conversa(db, store, num, *, inbound_ago_h=1.0, wa_id="551188887777", phone="5511988887777"):
    now = datetime.now(timezone.utc)
    c = WhatsAppConversation(
        tenant_id=store.id, number_id=num.id, contact_key=phone, phone=phone, wa_id=wa_id,
        profile_name="Cliente Teste", unread_count=2,
        last_inbound_at=now - timedelta(hours=inbound_ago_h), last_message_at=now - timedelta(hours=inbound_ago_h),
    )
    db.add(c)
    await db.flush()
    db.add(WhatsAppMessage(
        tenant_id=store.id, conversation_id=c.id, wamid=f"wamid.in{next(_seq)}", direction="in", msg_type="text",
        text="oi, tem a legging?", status="received", sent_at=c.last_inbound_at,
    ))
    await db.commit()
    await db.refresh(c)
    return c


def _meta(monkeypatch, resposta=None, erro=None):
    chamadas = []

    async def falso(phone_number_id, body):
        chamadas.append((phone_number_id, body))
        if erro:
            raise erro
        return resposta or {"messages": [{"id": f"wamid.out{next(_seq)}"}]}

    monkeypatch.setattr(svc, "_post_graph", falso)
    return chamadas


async def test_lista_abre_e_marca_como_lida(test_client, async_session):
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    cid, pnid = c.id, num.phone_number_id
    r = await test_client.get("/api/v1/whatsapp/conversations", headers=h)
    assert r.status_code == 200, r.text
    item = r.json()[0]
    assert item["name"] == "Cliente Teste" and item["unread_count"] == 2 and item["window_open"] is True
    assert item["last_text"] == "oi, tem a legging?"
    assert (await test_client.get("/api/v1/whatsapp/unread-count", headers=h)).json() == {"unread": 2}
    r = await test_client.get(f"/api/v1/whatsapp/conversations/{cid}", headers=h)
    assert [m["direction"] for m in r.json()["messages"]] == ["in"]
    assert (await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/read", headers=h)).status_code == 200
    assert (await test_client.get("/api/v1/whatsapp/unread-count", headers=h)).json() == {"unread": 0}


async def test_envia_so_depois_que_a_meta_aceita_e_usa_o_wa_id(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    cid, pnid = c.id, num.phone_number_id
    chamadas = _meta(monkeypatch, {"messages": [{"id": "wamid.ABC"}]})
    r = await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/send", headers=h, json={"text": "  Temos sim!  "})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "sent" and r.json()["direction"] == "out"
    pn, body = chamadas[0]
    assert pn == pnid and body["to"] == "551188887777" and body["text"]["body"] == "Temos sim!"
    m = (await async_session.execute(select(WhatsAppMessage).where(WhatsAppMessage.wamid == "wamid.ABC"))).scalar_one()
    assert m.text == "Temos sim!" and m.direction == "out"


async def test_meta_recusa_nada_e_gravado(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    cid, pnid = c.id, num.phone_number_id
    _meta(monkeypatch, erro=svc.SendError("O WhatsApp recusou o envio. Confira o número da cliente e tente de novo.", 424))
    r = await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/send", headers=h, json={"text": "oi"})
    assert r.status_code == 424 and "recusou" in r.json()["detail"]
    saidas = (await async_session.execute(select(WhatsAppMessage).where(
        WhatsAppMessage.conversation_id == cid, WhatsAppMessage.direction == "out"))).scalars().all()
    assert saidas == []


async def test_resposta_da_meta_sem_wamid_nao_vira_enviada(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    cid, pnid = c.id, num.phone_number_id
    _meta(monkeypatch, {"messages": []})
    r = await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/send", headers=h, json={"text": "oi"})
    assert r.status_code == 424
    assert (await async_session.execute(select(WhatsAppMessage).where(
        WhatsAppMessage.conversation_id == cid, WhatsAppMessage.direction == "out"))).scalars().all() == []


async def test_janela_fechada_bloqueia_antes_de_chamar_a_meta(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num, inbound_ago_h=25)
    cid = c.id
    chamadas = _meta(monkeypatch)
    r = await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/send", headers=h, json={"text": "oi"})
    assert r.status_code == 409 and "24 horas" in r.json()["detail"]
    assert chamadas == []
    lista = (await test_client.get("/api/v1/whatsapp/conversations", headers=h)).json()
    assert lista[0]["window_open"] is False


async def test_texto_vazio_e_sem_token(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    cid, pnid = c.id, num.phone_number_id
    chamadas = _meta(monkeypatch)
    r = await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/send", headers=h, json={"text": "   "})
    assert r.status_code == 400
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "")
    r = await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/send", headers=h, json={"text": "oi"})
    assert r.status_code == 424 and chamadas == []


async def test_loja_nao_ve_nem_responde_conversa_de_outra(test_client, async_session, monkeypatch):
    _sem_override()
    a, num_a, ha = await _loja(async_session)
    b, num_b, hb = await _loja(async_session)
    ca = await _conversa(async_session, a, num_a)
    cida = ca.id
    chamadas = _meta(monkeypatch)
    assert (await test_client.get("/api/v1/whatsapp/conversations", headers=hb)).json() == []
    assert (await test_client.get(f"/api/v1/whatsapp/conversations/{cida}", headers=hb)).status_code == 404
    assert (await test_client.post(f"/api/v1/whatsapp/conversations/{cida}/send", headers=hb, json={"text": "oi"})).status_code == 404
    assert (await test_client.post(f"/api/v1/whatsapp/conversations/{cida}/read", headers=hb)).status_code == 404
    assert chamadas == []


async def test_caixa_nao_acessa_a_caixa_de_conversas(test_client, async_session):
    _sem_override()
    store, num, h = await _loja(async_session, role=UserRole.CASHIER)
    r = await test_client.get("/api/v1/whatsapp/conversations", headers=h)
    assert r.status_code == 403


async def test_status_chega_para_a_mensagem_enviada(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    cid, pnid = c.id, num.phone_number_id
    _meta(monkeypatch, {"messages": [{"id": "wamid.ST1"}]})
    await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/send", headers=h, json={"text": "oi"})
    st = {"id": "wamid.ST1", "status": "delivered", "timestamp": "1760000000", "recipient_id": "551188887777",
          "recipient_user_id": "BR.FALSO123"}
    res = svc.ProcessResult()
    await svc._apply_status(async_session, num, st, res)
    await async_session.commit()
    assert res.statuses_applied == 1
    await async_session.refresh(c)
    assert c.bsuid == "BR.FALSO123"   # o BSUID do contato vem no status (recipient_user_id)


class _FakeClient:
    """httpx.AsyncClient falso: devolve a resposta combinada ou levanta o erro combinado."""
    resposta = None
    erro = None

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, json=None, headers=None):
        if _FakeClient.erro:
            raise _FakeClient.erro
        return _FakeClient.resposta


async def test_graph_recusa_e_timeout_viram_erro_legivel(monkeypatch):
    import httpx
    monkeypatch.setattr(svc.httpx, "AsyncClient", _FakeClient)
    _FakeClient.erro = None
    _FakeClient.resposta = httpx.Response(401, json={"error": {"code": 190, "message": "token"}})
    with pytest.raises(svc.SendError) as e:
        await svc._post_graph("pn", {})
    assert e.value.status_code == 424 and "190" not in e.value.message and "token" not in e.value.message
    _FakeClient.erro = httpx.ReadTimeout("lento")
    with pytest.raises(svc.SendError) as e:
        await svc._post_graph("pn", {})
    assert e.value.status_code == 424
    _FakeClient.erro = None
    _FakeClient.resposta = httpx.Response(200, json={"messages": [{"id": "wamid.OK"}]})
    assert (await svc._post_graph("pn", {}))["messages"][0]["id"] == "wamid.OK"
