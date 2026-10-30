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


async def test_convite_monta_o_link_com_texto(test_client, async_session):
    _sem_override()
    store, num, h = await _loja(async_session)
    num.display_phone_number = "553433050261"
    await async_session.commit()
    r = await test_client.get("/api/v1/whatsapp/invite", headers=h, params={"text": "Oi! Vi o look da W.A Fitness"})
    assert r.status_code == 200, r.text
    assert r.json() == {"phone": "553433050261", "link": "https://wa.me/553433050261?text=Oi%21%20Vi%20o%20look%20da%20W.A%20Fitness"}
    assert (await test_client.get("/api/v1/whatsapp/invite", headers=h)).json()["link"] == "https://wa.me/553433050261"


async def test_convite_sem_numero_na_loja_e_descobre_na_meta(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session)
    # sem número de exibição gravado e a Meta inacessível: erro legível, nada inventado
    class Falha(_FakeClient):
        async def get(self, *a, **k):
            import httpx
            raise httpx.ConnectError("sem rede")
    monkeypatch.setattr(svc.httpx, "AsyncClient", Falha)
    r = await test_client.get("/api/v1/whatsapp/invite", headers=h)
    assert r.status_code == 424
    # a Meta responde: o número é gravado para as próximas vezes
    import httpx
    class Ok(_FakeClient):
        async def get(self, *a, **k):
            return httpx.Response(200, json={"display_phone_number": "+55 34 3305-0261"})
    monkeypatch.setattr(svc.httpx, "AsyncClient", Ok)
    r = await test_client.get("/api/v1/whatsapp/invite", headers=h)
    assert r.json()["link"] == "https://wa.me/553433050261"
    # loja sem número oficial
    outra = Store(name="Sem Zap", slug="sem-zap-x", subdomain="sem-zap-x", is_default=False, is_active=True)
    async_session.add(outra)
    await async_session.commit()
    u = User(email="semzap@example.com", full_name="V", hashed_password=get_password_hash("Senha1234"),
             role=UserRole.SELLER, tenant_id=outra.id, is_active=True)
    async_session.add(u)
    await async_session.commit()
    h2 = {"Authorization": "Bearer " + create_access_token(data={"sub": str(u.id)}), "X-Tenant-Id": str(outra.id)}
    assert (await test_client.get("/api/v1/whatsapp/invite", headers=h2)).status_code == 409


async def test_conversa_ligada_ao_cadastro_busca_e_abrir_pela_cliente(test_client, async_session, monkeypatch):
    from app.models.customer import Customer
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num, phone="5511988887777", wa_id="551188887777")
    cli = Customer(full_name="Wanessa Santos", phone="(11) 98888-7777", tenant_id=store.id)
    sem_conversa = Customer(full_name="Bia Sem Conversa", phone="21977776666", tenant_id=store.id)
    sem_fone = Customer(full_name="Cris Sem Fone", tenant_id=store.id)
    async_session.add_all([cli, sem_conversa, sem_fone])
    await async_session.commit()
    ids = (cli.id, sem_conversa.id, sem_fone.id)
    # o nome do cadastro vence o nome do perfil do WhatsApp
    item = (await test_client.get("/api/v1/whatsapp/conversations", headers=h)).json()[0]
    assert item["name"] == "Wanessa Santos" and item["customer_id"] == ids[0]
    # busca por nome do cadastro, por telefone e sem resultado
    assert len((await test_client.get("/api/v1/whatsapp/conversations", headers=h, params={"q": "wanes"})).json()) == 1
    assert len((await test_client.get("/api/v1/whatsapp/conversations", headers=h, params={"q": "8888-7777"})).json()) == 1
    assert (await test_client.get("/api/v1/whatsapp/conversations", headers=h, params={"q": "zzz"})).json() == []
    # conversa já existente da cliente
    r = (await test_client.get(f"/api/v1/whatsapp/by-customer/{ids[0]}", headers=h)).json()
    assert r["id"] == c.id and r["name"] == "Wanessa Santos"
    assert (await test_client.get(f"/api/v1/whatsapp/by-customer/{ids[1]}", headers=h)).json() is None
    # abrir conversa de quem ainda não escreveu: cria sem mandar nada, janela fechada; repetir devolve a mesma
    r1 = await test_client.post("/api/v1/whatsapp/conversations/start", headers=h, json={"customer_id": ids[1]})
    assert r1.status_code == 200 and r1.json()["window_open"] is False and r1.json()["name"] == "Bia Sem Conversa"
    r2 = await test_client.post("/api/v1/whatsapp/conversations/start", headers=h, json={"customer_id": ids[1]})
    assert r2.json()["id"] == r1.json()["id"]
    chamadas = _meta(monkeypatch)
    r = await test_client.post(f"/api/v1/whatsapp/conversations/{r1.json()['id']}/send", headers=h, json={"text": "oi"})
    assert r.status_code == 409 and chamadas == []
    # sem telefone: erro legível; cliente de outra loja não existe para esta
    assert (await test_client.post("/api/v1/whatsapp/conversations/start", headers=h, json={"customer_id": ids[2]})).status_code == 409
    assert (await test_client.post("/api/v1/whatsapp/conversations/start", headers=h, json={"customer_id": 999999})).status_code == 404


async def test_marcar_como_lida_avisa_a_meta_sem_travar(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    cid = c.id
    chamadas = _meta(monkeypatch)
    assert (await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/read", headers=h)).status_code == 200
    assert chamadas and chamadas[0][1]["status"] == "read" and chamadas[0][1]["message_id"].startswith("wamid.in")
    # Meta fora do ar: a leitura local continua valendo
    c2 = await _conversa(async_session, store, num, wa_id="551177776666", phone="5511977776666")
    cid2 = c2.id
    _meta(monkeypatch, erro=svc.SendError("falhou", 424))
    assert (await test_client.post(f"/api/v1/whatsapp/conversations/{cid2}/read", headers=h)).status_code == 200
    assert (await test_client.get("/api/v1/whatsapp/unread-count", headers=h)).json() == {"unread": 0}


async def test_cobranca_por_mensagem_guardada_dos_status_e_resumo(test_client, async_session, monkeypatch):
    """O `pricing` dos status da Meta (fixture com valores FALSOS, no formato da documentação) vira custo real por mensagem."""
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    cid = c.id
    wamids = []
    for i in range(4):
        w = f"wamid.PR{i}"
        wamids.append(w)
        _meta(monkeypatch, {"messages": [{"id": w}]})
        assert (await test_client.post(f"/api/v1/whatsapp/conversations/{cid}/send", headers=h, json={"text": f"m{i}"})).status_code == 200
    pricing = [
        {"billable": False, "pricing_model": "PMP", "category": "service", "type": "free_customer_service"},
        {"billable": True, "pricing_model": "PMP", "category": "utility", "type": "regular"},
        {"billable": False, "pricing_model": "PMP", "category": "referral_conversion", "type": "free_entry_point"},
    ]
    for w, pr in zip(wamids, pricing):
        res = svc.ProcessResult()
        await svc._apply_status(async_session, num, {"id": w, "status": "sent", "timestamp": "1760000000", "pricing": pr}, res)
    # a 4ª mensagem ainda não recebeu status com cobrança
    await async_session.commit()
    m = (await async_session.execute(select(WhatsAppMessage).where(WhatsAppMessage.wamid == wamids[1]))).scalar_one()
    assert (m.pricing_billable, m.pricing_category, m.pricing_type, m.pricing_model) == (True, "utility", "regular", "PMP")
    assert '"category": "utility"' in m.pricing_raw
    # status de entrega seguinte não apaga a cobrança já guardada
    res = svc.ProcessResult()
    await svc._apply_status(async_session, num, {"id": wamids[1], "status": "delivered", "timestamp": "1760000100"}, res)
    await async_session.commit()
    await async_session.refresh(m)
    assert m.pricing_category == "utility" and m.status == "delivered"
    r = await test_client.get("/api/v1/whatsapp/costs", headers=h)
    # vendedor não vê dinheiro
    assert r.status_code == 403
    gerente = await _gerente(async_session, store)
    r = await test_client.get("/api/v1/whatsapp/costs", headers=gerente)
    assert r.status_code == 200, r.text
    d = r.json()
    assert (d["sent"], d["billable"], d["free"], d["unknown"]) == (4, 1, 2, 1)
    assert d["by_category"] == {"service": 1, "utility": 1, "referral_conversion": 1}
    assert d["by_type"]["free_entry_point"] == 1


async def _gerente(db, store):
    n = next(_seq)
    u = User(email=f"ger.{n}@example.com", full_name="Gerente", hashed_password=get_password_hash("Senha1234"),
             role=UserRole.MANAGER, tenant_id=store.id, is_active=True)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"Authorization": "Bearer " + create_access_token(data={"sub": str(u.id)}), "X-Tenant-Id": str(store.id)}


# ── fotos, áudio e PDF ────────────────────────────────────────────────────────

class _MediaClient:
    """httpx.AsyncClient falso para o envio e o download de arquivos. Ajuste `rotas` em cada teste."""
    rotas: dict = {}
    vistos: list = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, json=None, data=None, files=None, headers=None):
        import httpx
        _MediaClient.vistos.append(("POST", url, json, data, files))
        r = _MediaClient.rotas.get(("POST", url.rsplit("/", 1)[-1]))
        return r if r is not None else httpx.Response(200, json={"messages": [{"id": f"wamid.M{next(_seq)}"}]})

    async def get(self, url, headers=None, params=None):
        import httpx
        _MediaClient.vistos.append(("GET", url, None, None, None))
        r = _MediaClient.rotas.get(("GET", url.rsplit("/", 1)[-1]))
        return r if r is not None else httpx.Response(404)


def _png() -> bytes:
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), (200, 30, 90)).save(buf, "PNG")
    return buf.getvalue()


async def test_envia_foto_e_pdf_so_depois_da_meta_e_recusa_o_resto(test_client, async_session, monkeypatch):
    import httpx
    _sem_override()
    store, num, h = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    c2 = await _conversa(async_session, store, num, inbound_ago_h=26, wa_id="551166665555", phone="5511966665555")
    cid, cid2 = c.id, c2.id
    monkeypatch.setattr(svc.httpx, "AsyncClient", _MediaClient)
    _MediaClient.vistos = []
    _MediaClient.rotas = {("POST", "media"): httpx.Response(200, json={"id": "MEDIA123"})}
    url = f"/api/v1/whatsapp/conversations/{cid}/send-media"
    r = await test_client.post(url, headers=h, files={"file": ("foto.png", _png(), "image/png")}, data={"caption": "Olha que linda"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["type"] == "image" and j["text"] == "Olha que linda" and j["media"]["kind"] == "image"
    envio = [v for v in _MediaClient.vistos if v[0] == "POST" and v[2]][-1][2]
    assert envio["type"] == "image" and envio["image"] == {"id": "MEDIA123", "caption": "Olha que linda"} and envio["to"] == "551188887777"
    # a foto sai regravada (sem EXIF): o que subiu para a Meta é JPEG/PNG válido
    subido = [v for v in _MediaClient.vistos if v[4]][-1][4]["file"]
    assert subido[2] in ("image/png", "image/jpeg") and subido[1][:4] in (b"\x89PNG", b"\xff\xd8\xff\xe0", b"\xff\xd8\xff\xdb", b"\xff\xd8\xff\xe1")
    # PDF
    r = await test_client.post(url, headers=h, files={"file": ("tabela.pdf", b"%PDF-1.4 teste", "application/pdf")})
    assert r.status_code == 200 and r.json()["type"] == "document" and r.json()["media"]["filename"] == "tabela.pdf"
    # arquivo que não é foto nem PDF, vazio e site disfarçado de foto
    for nome, conteudo in (("a.txt", b"oi"), ("v.exe", b"MZ\x90\x00"), ("x.png", b"<html><script>1</script></html>")):
        r = await test_client.post(url, headers=h, files={"file": (nome, conteudo, "image/png")})
        assert r.status_code == 400, (nome, r.text)
    # a Meta recusa o arquivo: erro legível e nada fica gravado como enviado
    antes = len((await async_session.execute(select(WhatsAppMessage).where(WhatsAppMessage.conversation_id == cid, WhatsAppMessage.direction == "out"))).scalars().all())
    _MediaClient.rotas = {("POST", "media"): httpx.Response(400, json={"error": {"code": 131053}})}
    r = await test_client.post(url, headers=h, files={"file": ("foto.png", _png(), "image/png")})
    assert r.status_code == 424 and "recusou o arquivo" in r.json()["detail"]
    depois = len((await async_session.execute(select(WhatsAppMessage).where(WhatsAppMessage.conversation_id == cid, WhatsAppMessage.direction == "out"))).scalars().all())
    assert antes == depois == 2
    # janela fechada: nem sobe o arquivo
    _MediaClient.vistos = []
    r = await test_client.post(f"/api/v1/whatsapp/conversations/{cid2}/send-media", headers=h, files={"file": ("foto.png", _png(), "image/png")})
    assert r.status_code == 409 and _MediaClient.vistos == []


async def test_abrir_arquivo_da_mensagem_busca_na_meta_e_isola_a_loja(test_client, async_session, monkeypatch):
    import json as _json
    import httpx
    _sem_override()
    store, num, h = await _loja(async_session)
    outra, num2, h2 = await _loja(async_session)
    c = await _conversa(async_session, store, num)
    msgs = []
    for tipo, info in (("image", {"id": "IMG1", "mime_type": "image/jpeg", "caption": "tem esse?"}),
                       ("audio", {"id": "AUD1", "mime_type": "audio/ogg; codecs=opus"}),
                       ("image", {"id": "SVG1", "mime_type": "image/svg+xml"}),
                       ("text", None)):
        m = WhatsAppMessage(tenant_id=store.id, conversation_id=c.id, wamid=f"wamid.F{next(_seq)}", direction="in", msg_type=tipo,
                            text=(info or {}).get("caption") if info else "oi", payload=_json.dumps({tipo: info} if info else {}),
                            status="received", sent_at=datetime.now(timezone.utc))
        async_session.add(m)
        msgs.append(m)
    await async_session.commit()
    ids = [m.id for m in msgs]; cid = c.id
    monkeypatch.setattr(svc.httpx, "AsyncClient", _MediaClient)
    _MediaClient.vistos = []
    _MediaClient.rotas = {
        ("GET", "IMG1"): httpx.Response(200, json={"url": "https://lookaside.example/img1", "mime_type": "image/jpeg", "file_size": 7}),
        ("GET", "img1"): httpx.Response(200, content=b"\xff\xd8\xffFOTO"),
        ("GET", "AUD1"): httpx.Response(200, json={"url": "https://lookaside.example/aud1", "mime_type": "audio/ogg", "file_size": 5}),
        ("GET", "aud1"): httpx.Response(200, content=b"OggS1"),
        ("GET", "SVG1"): httpx.Response(200, json={"url": "https://lookaside.example/svg1", "mime_type": "image/svg+xml", "file_size": 9}),
        ("GET", "svg1"): httpx.Response(200, content=b"<svg onload=1>"),
    }
    r = await test_client.get(f"/api/v1/whatsapp/messages/{ids[0]}/media", headers=h)
    assert r.status_code == 200 and r.content == b"\xff\xd8\xffFOTO" and r.headers["content-type"] == "image/jpeg"
    assert r.headers["x-content-type-options"] == "nosniff" and "sandbox" in r.headers["content-security-policy"]
    r = await test_client.get(f"/api/v1/whatsapp/messages/{ids[1]}/media", headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "audio/ogg"
    # SVG não é exibido: baixa como arquivo genérico
    r = await test_client.get(f"/api/v1/whatsapp/messages/{ids[2]}/media", headers=h)
    assert r.headers["content-type"] == "application/octet-stream" and r.headers["content-disposition"].startswith("attachment")
    # mensagem de texto não tem arquivo; outra loja não alcança a mensagem
    assert (await test_client.get(f"/api/v1/whatsapp/messages/{ids[3]}/media", headers=h)).status_code == 404
    assert (await test_client.get(f"/api/v1/whatsapp/messages/{ids[0]}/media", headers=h2)).status_code == 404
    # a conversa avisa o app de que há arquivo (sem entregar o arquivo)
    det = (await test_client.get(f"/api/v1/whatsapp/conversations/{cid}", headers=h)).json()["messages"]
    assert any(m["media"] and m["media"]["kind"] == "audio" for m in det)
    # a Meta já apagou o arquivo
    _MediaClient.rotas[("GET", "IMG1")] = httpx.Response(404)
    r = await test_client.get(f"/api/v1/whatsapp/messages/{ids[0]}/media", headers=h)
    assert r.status_code == 404 and "não está mais disponível" in r.json()["detail"]
