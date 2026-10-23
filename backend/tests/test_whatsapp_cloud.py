"""WhatsApp oficial (Cloud API): webhook com assinatura, idempotência, tudo-ou-nada, contatos e status.

Eventos simulados no formato do webhook da Meta, assinados com um segredo de teste.
Nenhum número real: telefones fictícios (11 9xxxx).
"""
import hashlib
import hmac
import itertools
import json
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import get_db_unscoped
from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppConversation, WhatsAppMessage
from app.services import whatsapp_cloud_service as svc

pytestmark = pytest.mark.asyncio

SECRET = "segredo-de-teste-nao-e-real"
VERIFY = "verify-de-teste"
URL = "/webhooks/whatsapp-cloud"
_seq = itertools.count(1)
_ids = itertools.count(1)


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def wamid() -> str:
    return f"wamid.TESTE{next(_ids):08d}"


def text_msg(frm="5511987654321", body="oi", mid=None, ts=1761235200, **extra):
    m = {"from": frm, "id": mid or wamid(), "timestamp": str(ts), "type": "text", "text": {"body": body}}
    m.update(extra)
    return m


def event(pnid, messages=(), statuses=(), contacts=None):
    value = {
        "messaging_product": "whatsapp",
        "metadata": {"display_phone_number": "551132151035", "phone_number_id": pnid},
    }
    if messages:
        value["messages"] = list(messages)
        value["contacts"] = contacts if contacts is not None else [
            {"profile": {"name": "Cliente Teste"}, "wa_id": m["from"]} for m in messages if m.get("from")
        ]
    if statuses:
        value["statuses"] = list(statuses)
    return {"object": "whatsapp_business_account",
            "entry": [{"id": "WABA_TESTE", "changes": [{"field": "messages", "value": value}]}]}


@pytest.fixture
def session_maker(test_engine):
    return sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def client(test_client, session_maker, monkeypatch):
    """Cliente HTTP em que cada requisição do webhook usa uma sessão nova (commit/rollback reais)."""
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_APP_SECRET", SECRET)
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_VERIFY_TOKEN", VERIFY)
    from app.main import app

    async def unscoped():
        async with session_maker() as s:
            yield s

    app.dependency_overrides[get_db_unscoped] = unscoped
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as c:
        yield c


async def _number(session_maker):
    """Loja nova com um número da Cloud API. Devolve (tenant_id, phone_number_id)."""
    from app.models.store import Store

    n = next(_seq)
    async with session_maker() as s:
        store = Store(name=f"Loja WA {n}", slug=f"loja-wa-{n}", subdomain=f"wa-{n}", is_default=False, is_active=True)
        s.add(store)
        await s.flush()
        pnid = f"PNID-TESTE-{n}"
        s.add(WhatsAppCloudNumber(tenant_id=store.id, phone_number_id=pnid, waba_id="WABA_TESTE"))
        await s.commit()
        return store.id, pnid


async def post(client, payload, *, secret=SECRET, header=None, raw=None):
    body = raw if raw is not None else json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    sig = header if header is not None else sign(body, secret)
    if sig:
        headers["X-Hub-Signature-256"] = sig
    return await client.post(URL, content=body, headers=headers)


async def count(session_maker, model, *where):
    async with session_maker() as s:
        return (await s.execute(select(func.count()).select_from(model).where(*where))).scalar()


async def convs(session_maker, tenant_id):
    async with session_maker() as s:
        return (await s.execute(
            select(WhatsAppConversation).where(WhatsAppConversation.tenant_id == tenant_id).order_by(WhatsAppConversation.id)
        )).scalars().all()


# ── funções puras ─────────────────────────────────────────────────────────────

def test_normaliza_celular_com_e_sem_9():
    assert svc.normalize_phone("5511987654321") == "5511987654321"
    assert svc.normalize_phone("551187654321") == "5511987654321"
    assert svc.normalize_phone("+55 (11) 98765-4321") == "5511987654321"


def test_fixo_e_estrangeiro_ficam_como_estao():
    assert svc.normalize_phone("551132151035") == "551132151035"  # fixo começa com 2 a 5
    assert svc.normalize_phone("14155550123") == "14155550123"
    assert svc.normalize_phone("") is None and svc.normalize_phone(None) is None


def test_assinatura():
    body = b'{"a":1}'
    assert svc.verify_signature(body, sign(body), SECRET)
    assert svc.verify_signature(body, sign(body).upper().replace("SHA256=", "sha256="), SECRET)
    assert not svc.verify_signature(body, sign(body, "outro"), SECRET)
    assert not svc.verify_signature(body + b" ", sign(body), SECRET)
    assert not svc.verify_signature(body, None, SECRET)
    assert not svc.verify_signature(body, sign(body, ""), "")  # segredo vazio recusa sempre
    assert not svc.verify_signature(body, "md5=abc", SECRET)


def test_texto_de_cada_tipo():
    assert svc.message_text({"type": "text", "text": {"body": "oi"}}) == "oi"
    assert svc.message_text({"type": "image", "image": {"caption": "foto"}}) == "foto"
    assert svc.message_text({"type": "button", "button": {"text": "Quero"}}) == "Quero"
    assert svc.message_text({"type": "interactive", "interactive": {"button_reply": {"title": "Sim"}}}) == "Sim"
    assert svc.message_text({"type": "interactive", "interactive": {"list_reply": {"title": "P"}}}) == "P"
    assert svc.message_text({"type": "reaction", "reaction": {"emoji": "👍"}}) == "👍"
    assert svc.message_text({"type": "audio", "audio": {"id": "1"}}) is None
    assert svc.message_text({"type": "unsupported"}) is None


# ── verificação (GET) ─────────────────────────────────────────────────────────

async def test_verificacao_devolve_challenge(client):
    r = await client.get(URL, params={"hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "12345"})
    assert r.status_code == 200 and r.text == "12345"


async def test_verificacao_recusa_token_errado_ou_nao_configurado(client, monkeypatch):
    r = await client.get(URL, params={"hub.mode": "subscribe", "hub.verify_token": "errado", "hub.challenge": "1"})
    assert r.status_code == 403
    r = await client.get(URL, params={"hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1"})
    assert r.status_code == 403
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_VERIFY_TOKEN", "")
    r = await client.get(URL, params={"hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1"})
    assert r.status_code == 403


# ── assinatura (POST) ─────────────────────────────────────────────────────────

async def test_sem_app_secret_recusa_tudo(client, session_maker, monkeypatch):
    _, pnid = await _number(session_maker)
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_APP_SECRET", "")
    m = text_msg()
    r = await post(client, event(pnid, [m]), secret="")
    assert r.status_code == 503
    assert await count(session_maker, WhatsAppMessage, WhatsAppMessage.wamid == m["id"]) == 0


async def test_assinatura_invalida_nao_grava(client, session_maker):
    _, pnid = await _number(session_maker)
    m = text_msg()
    payload = event(pnid, [m])
    assert (await post(client, payload, secret="segredo-errado")).status_code == 403
    assert (await post(client, payload, header="")).status_code == 403  # sem cabeçalho
    body = json.dumps(payload).encode()
    adulterado = body.replace(b'"oi"', b'"OI"')
    assert (await post(client, None, raw=adulterado, header=sign(body))).status_code == 403
    assert await count(session_maker, WhatsAppMessage, WhatsAppMessage.wamid == m["id"]) == 0


async def test_json_invalido_com_assinatura_valida(client):
    assert (await post(client, None, raw=b"nao e json")).status_code == 400
    assert (await post(client, None, raw=b"[1,2]")).status_code == 400


# ── mensagens ─────────────────────────────────────────────────────────────────

async def test_mensagem_recebida_cria_conversa(client, session_maker):
    tenant, pnid = await _number(session_maker)
    m = text_msg(body="Tem legging preta M?")
    r = await post(client, event(pnid, [m]))
    assert r.status_code == 200 and r.json()["saved"] == 1
    [c] = await convs(session_maker, tenant)
    assert (c.phone, c.contact_key, c.profile_name, c.unread_count) == ("5511987654321", "5511987654321", "Cliente Teste", 1)
    async with session_maker() as s:
        msg = (await s.execute(select(WhatsAppMessage).where(WhatsAppMessage.wamid == m["id"]))).scalar_one()
    assert (msg.tenant_id, msg.direction, msg.msg_type, msg.text, msg.status) == (tenant, "in", "text", "Tem legging preta M?", "received")
    assert json.loads(msg.payload)["id"] == m["id"]
    assert svc._aware(c.last_inbound_at) == datetime.fromtimestamp(1761235200, tz=timezone.utc)


async def test_mesma_mensagem_duas_vezes_grava_uma(client, session_maker):
    tenant, pnid = await _number(session_maker)
    m = text_msg()
    assert (await post(client, event(pnid, [m]))).json()["saved"] == 1
    r = await post(client, event(pnid, [m]))
    assert r.status_code == 200 and r.json() == {"ok": True, "saved": 0, "duplicated": 1, "statuses": 0}
    assert await count(session_maker, WhatsAppMessage, WhatsAppMessage.wamid == m["id"]) == 1
    [c] = await convs(session_maker, tenant)
    assert c.unread_count == 1


async def test_celular_com_e_sem_9_e_a_mesma_conversa(client, session_maker):
    tenant, pnid = await _number(session_maker)
    await post(client, event(pnid, [text_msg(frm="5511987654321")]))
    await post(client, event(pnid, [text_msg(frm="551187654321", ts=1761235300)]))
    [c] = await convs(session_maker, tenant)
    assert c.unread_count == 2 and c.wa_id == "551187654321" and c.phone == "5511987654321"


async def test_contato_so_com_bsuid_e_depois_com_telefone(client, session_maker):
    """BSUID: nome exato do campo na Meta ainda não confirmado; aceitamos contacts[].user_id e from_user_id."""
    tenant, pnid = await _number(session_maker)
    so_bsuid = {"id": wamid(), "timestamp": "1761235200", "type": "text", "text": {"body": "oi"}, "from_user_id": "BR.123abc"}
    r = await post(client, event(pnid, [so_bsuid], contacts=[{"profile": {"name": "Ana"}, "user_id": "BR.123abc"}]))
    assert r.json()["saved"] == 1
    [c] = await convs(session_maker, tenant)
    assert (c.contact_key, c.phone, c.bsuid) == ("u:BR.123abc", None, "BR.123abc")

    com_os_dois = text_msg(frm="5511912345678", ts=1761235300, from_user_id="BR.123abc")
    await post(client, event(pnid, [com_os_dois], contacts=[{"profile": {"name": "Ana"}, "wa_id": "5511912345678", "user_id": "BR.123abc"}]))
    [c] = await convs(session_maker, tenant)
    assert (c.contact_key, c.phone, c.unread_count) == ("u:BR.123abc", "5511912345678", 2)


async def test_mensagem_sem_telefone_nem_bsuid_e_ignorada(client, session_maker):
    tenant, pnid = await _number(session_maker)
    m = {"id": wamid(), "timestamp": "1761235200", "type": "text", "text": {"body": "?"}}
    r = await post(client, event(pnid, [m], contacts=[]))
    assert r.status_code == 200 and r.json()["saved"] == 0
    assert await convs(session_maker, tenant) == []


async def test_numero_sem_loja_vinculada_e_ignorado(client, session_maker):
    m = text_msg()
    r = await post(client, event("PNID-QUE-NAO-EXISTE", [m]))
    assert r.status_code == 200 and r.json()["saved"] == 0
    assert await count(session_maker, WhatsAppMessage, WhatsAppMessage.wamid == m["id"]) == 0


async def test_cada_numero_grava_na_sua_loja(client, session_maker):
    loja_a, pnid_a = await _number(session_maker)
    loja_b, pnid_b = await _number(session_maker)
    await post(client, event(pnid_a, [text_msg()]))
    await post(client, event(pnid_b, [text_msg()]))
    assert len(await convs(session_maker, loja_a)) == 1
    assert len(await convs(session_maker, loja_b)) == 1
    assert (await convs(session_maker, loja_a))[0].id != (await convs(session_maker, loja_b))[0].id


async def test_tudo_ou_nada_erro_no_meio_nao_grava_nada(client, session_maker, monkeypatch):
    tenant, pnid = await _number(session_maker)
    m1, m2 = text_msg(), text_msg(ts=1761235300)
    real = svc._save_inbound

    async def falha_na_segunda(db, number, msg, contacts, result):
        if msg["id"] == m2["id"]:
            raise RuntimeError("falha simulada")
        await real(db, number, msg, contacts, result)

    monkeypatch.setattr(svc, "_save_inbound", falha_na_segunda)
    r = await post(client, event(pnid, [m1, m2]))
    assert r.status_code == 500  # a Meta reenvia
    assert await count(session_maker, WhatsAppMessage, WhatsAppMessage.wamid.in_([m1["id"], m2["id"]])) == 0
    assert await convs(session_maker, tenant) == []

    monkeypatch.setattr(svc, "_save_inbound", real)
    r = await post(client, event(pnid, [m1, m2]))  # reenvio da Meta
    assert r.json()["saved"] == 2


async def test_conflito_simultaneo_reprocessa_uma_vez(client, session_maker, monkeypatch):
    """Outra entrega gravou a mesma mensagem entre a checagem e o commit: desfaz e reprocessa."""
    import app.webhooks.whatsapp_cloud as hook

    tenant, pnid = await _number(session_maker)
    m = text_msg()
    chamadas = []

    async def conflito_na_primeira(db, payload):
        chamadas.append(1)
        if len(chamadas) == 1:
            await svc.process_payload(db, payload)
            raise IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed: whatsapp_messages.wamid"))
        return await svc.process_payload(db, payload)

    monkeypatch.setattr(hook, "process_payload", conflito_na_primeira)
    r = await post(client, event(pnid, [m]))
    assert r.status_code == 200 and r.json()["saved"] == 1 and len(chamadas) == 2
    assert await count(session_maker, WhatsAppMessage, WhatsAppMessage.wamid == m["id"]) == 1


async def test_indice_unico_do_wamid_no_banco(session_maker):
    tenant, pnid = await _number(session_maker)
    async with session_maker() as s:
        num = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
        c = WhatsAppConversation(tenant_id=tenant, number_id=num.id, contact_key="5511900000000", unread_count=0)
        s.add(c)
        await s.flush()
        mid = wamid()
        for _ in range(2):
            s.add(WhatsAppMessage(tenant_id=tenant, conversation_id=c.id, wamid=mid, direction="in", msg_type="text", status="received"))
        with pytest.raises(IntegrityError):
            await s.flush()
        await s.rollback()


# ── status de entrega ─────────────────────────────────────────────────────────

async def _outbound(session_maker, tenant, pnid):
    """Mensagem de saída já aceita pela Meta (o envio ainda não existe; gravada direto)."""
    async with session_maker() as s:
        num = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
        c = WhatsAppConversation(tenant_id=tenant, number_id=num.id, contact_key=f"55119{next(_seq):08d}", unread_count=0)
        s.add(c)
        await s.flush()
        mid = wamid()
        s.add(WhatsAppMessage(tenant_id=tenant, conversation_id=c.id, wamid=mid, direction="out", msg_type="text", status="sent"))
        await s.commit()
        return mid


async def _status_of(session_maker, mid):
    async with session_maker() as s:
        m = (await s.execute(select(WhatsAppMessage).where(WhatsAppMessage.wamid == mid))).scalar_one()
        return m.status, m.error


def st(mid, status, ts=1761235400, **extra):
    return {"id": mid, "status": status, "timestamp": str(ts), "recipient_id": "5511987654321", **extra}


async def test_status_so_avanca(client, session_maker):
    tenant, pnid = await _number(session_maker)
    mid = await _outbound(session_maker, tenant, pnid)
    assert (await post(client, event(pnid, statuses=[st(mid, "delivered")]))).json()["statuses"] == 1
    assert (await post(client, event(pnid, statuses=[st(mid, "read")]))).json()["statuses"] == 1
    # Fora de ordem ou repetido: ignorado
    assert (await post(client, event(pnid, statuses=[st(mid, "delivered")]))).json()["statuses"] == 0
    assert (await post(client, event(pnid, statuses=[st(mid, "read")]))).json()["statuses"] == 0
    assert (await post(client, event(pnid, statuses=[st(mid, "failed", errors=[{"code": 131026}])]))).json()["statuses"] == 0
    assert (await _status_of(session_maker, mid))[0] == "read"


async def test_status_falhou_guarda_erro(client, session_maker):
    tenant, pnid = await _number(session_maker)
    mid = await _outbound(session_maker, tenant, pnid)
    erros = [{"code": 131047, "title": "Re-engagement message"}]
    assert (await post(client, event(pnid, statuses=[st(mid, "failed", errors=erros)]))).json()["statuses"] == 1
    status, error = await _status_of(session_maker, mid)
    assert status == "failed" and json.loads(error) == erros
    # Depois de falhar, um "delivered" atrasado não ressuscita
    assert (await post(client, event(pnid, statuses=[st(mid, "delivered")]))).json()["statuses"] == 0


async def test_status_de_mensagem_desconhecida_ou_de_outra_loja_e_ignorado(client, session_maker):
    tenant_a, pnid_a = await _number(session_maker)
    _, pnid_b = await _number(session_maker)
    mid = await _outbound(session_maker, tenant_a, pnid_a)
    assert (await post(client, event(pnid_a, statuses=[st("wamid.NAO_EXISTE", "delivered")]))).json()["statuses"] == 0
    assert (await post(client, event(pnid_b, statuses=[st(mid, "delivered")]))).json()["statuses"] == 0
    assert (await _status_of(session_maker, mid))[0] == "sent"


async def test_campo_que_nao_e_messages_e_ignorado(client, session_maker):
    _, pnid = await _number(session_maker)
    payload = event(pnid, [text_msg()])
    payload["entry"][0]["changes"][0]["field"] = "account_update"
    assert (await post(client, payload)).json()["saved"] == 0
    payload = event(pnid, [text_msg()])
    payload["object"] = "page"
    assert (await post(client, payload)).json()["saved"] == 0
