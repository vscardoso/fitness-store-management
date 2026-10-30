"""WhatsApp oficial: saudação automática (1 por janela de 24 h), com a Meta simulada. Nenhum número real."""
import asyncio
import json
import time

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppConversation, WhatsAppMessage
from app.services import whatsapp_cloud_service as svc
from tests.test_whatsapp_cloud import (  # noqa: F401  (fixtures reaproveitadas)
    SECRET, URL, _number, client, event, session_maker, sign, st, text_msg,
)

pytestmark = pytest.mark.asyncio
TEXTO = "Oi! Seja bem-vinda à W.A Fitness. Em breve a gente te responde. Se quiser ir adiantando, conta o que você procura: peça, tamanho ou modelo."


def agora() -> int:
    return int(time.time())


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "token-de-teste")


_GRAPH_ORIGINAL = svc._post_graph


class Meta:
    """Graph API falsa: guarda o que foi mandado e pode falhar."""

    def __init__(self, monkeypatch):
        self.enviadas = []
        self.erro = None
        self._n = 0

        async def falso(phone_number_id, body):
            if self.erro:
                raise self.erro
            self._n += 1
            self.enviadas.append((phone_number_id, body))
            return {"messages": [{"id": f"wamid.SAUDACAO{self._n}{id(self)}"}]}

        monkeypatch.setattr(svc, "_post_graph", falso)


async def _loja(session_maker, *, ligada=True, texto=TEXTO):
    tenant_id, pnid = await _number(session_maker)
    async with session_maker() as s:
        n = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
        n.greeting_enabled, n.greeting_text = ligada, texto
        await s.commit()
    return tenant_id, pnid


async def _post(client, payload):
    body = json.dumps(payload).encode()
    return await client.post(URL, content=body, headers={"Content-Type": "application/json", "X-Hub-Signature-256": sign(body)})


async def _saidas(session_maker, tenant_id):
    async with session_maker() as s:
        return (await s.execute(select(WhatsAppMessage).where(
            WhatsAppMessage.tenant_id == tenant_id, WhatsAppMessage.direction == "out").order_by(WhatsAppMessage.id))).scalars().all()


async def test_uma_saudacao_por_janela(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker)
    fone = "5511987651001"
    r = await _post(client, event(pnid, [text_msg(frm=fone, ts=agora())]))
    assert r.status_code == 200 and r.json()["saved"] == 1
    assert len(meta.enviadas) == 1
    assert meta.enviadas[0][1]["text"]["body"] == TEXTO and meta.enviadas[0][1]["to"] == fone
    saidas = await _saidas(session_maker, tenant)
    assert len(saidas) == 1 and saidas[0].text == TEXTO and saidas[0].status == "sent" and saidas[0].wamid.startswith("wamid.SAUDACAO")
    # a cliente continua escrevendo dentro da janela: nenhuma saudação nova
    for _ in range(3):
        assert (await _post(client, event(pnid, [text_msg(frm=fone, ts=agora())]))).status_code == 200
    assert len(meta.enviadas) == 1 and len(await _saidas(session_maker, tenant)) == 1
    # a janela de 24 h acaba (envelhece a conversa) e a cliente volta: saúda de novo
    async with session_maker() as s:
        conv = (await s.execute(select(WhatsAppConversation).where(WhatsAppConversation.tenant_id == tenant))).scalar_one()
        velho = conv.last_inbound_at.replace(year=conv.last_inbound_at.year) - __import__("datetime").timedelta(hours=25)
        conv.last_inbound_at, conv.last_greeting_at = velho, velho
        await s.commit()
    assert (await _post(client, event(pnid, [text_msg(frm=fone, ts=agora())]))).status_code == 200
    assert len(meta.enviadas) == 2 and len(await _saidas(session_maker, tenant)) == 2


async def test_desligada_sem_texto_ou_sem_token_nao_envia(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    for kwargs in ({"ligada": False}, {"ligada": True, "texto": None}, {"ligada": True, "texto": "   "}):
        tenant, pnid = await _loja(session_maker, **kwargs)
        r = await _post(client, event(pnid, [text_msg(frm="5511987651002", ts=agora())]))
        assert r.status_code == 200 and r.json()["saved"] == 1
        assert await _saidas(session_maker, tenant) == []
    assert meta.enviadas == []
    # ligada mas sem token configurado: a mensagem de entrada fica salva, nada sai
    tenant, pnid = await _loja(session_maker)
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "")
    r = await _post(client, event(pnid, [text_msg(frm="5511987651003", ts=agora())]))
    assert r.status_code == 200 and r.json()["saved"] == 1 and meta.enviadas == []


async def test_so_mensagem_de_cliente_dispara(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker)
    # reação não dispara
    reacao = text_msg(frm="5511987651004", ts=agora(), type="reaction", reaction={"message_id": "wamid.X", "emoji": "👍"})
    reacao.pop("text")
    assert (await _post(client, event(pnid, [reacao]))).status_code == 200
    # status não dispara
    assert (await _post(client, event(pnid, statuses=[st("wamid.INEXISTENTE", "delivered")]))).status_code == 200
    # número da própria loja (ou outro número do sistema) escrevendo: não dispara
    async with session_maker() as s:
        s.add(WhatsAppCloudNumber(tenant_id=tenant, phone_number_id="PNID-OUTRO", display_phone_number="551132151035"))
        await s.commit()
    assert (await _post(client, event(pnid, [text_msg(frm="551132151035", ts=agora())]))).status_code == 200
    # evento de número sem loja vinculada: ignorado
    assert (await _post(client, event("PNID-DESCONHECIDO", [text_msg(frm="5511987651005", ts=agora())]))).status_code == 200
    assert meta.enviadas == [] and await _saidas(session_maker, tenant) == []
    # uma mensagem de cliente de verdade dispara
    assert (await _post(client, event(pnid, [text_msg(frm="5511987651006", ts=agora())]))).status_code == 200
    assert len(meta.enviadas) == 1


async def test_integrado_saida_com_wamid_status_e_cobranca_de_servico(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker)
    assert (await _post(client, event(pnid, [text_msg(frm="5511987651007", ts=agora())]))).status_code == 200
    saida = (await _saidas(session_maker, tenant))[0]
    pricing = {"billable": False, "pricing_model": "PMP", "category": "service", "type": "free_customer_service"}
    r = await _post(client, event(pnid, statuses=[{**st(saida.wamid, "sent"), "pricing": pricing}]))
    assert r.status_code == 200   # "sent" repetido não muda o status, mas a cobrança informada é guardada
    r = await _post(client, event(pnid, statuses=[st(saida.wamid, "delivered")]))
    saida = (await _saidas(session_maker, tenant))[0]
    assert saida.status == "delivered" and saida.direction == "out"
    assert (saida.pricing_category, saida.pricing_type, saida.pricing_billable) == ("service", "free_customer_service", False)


async def test_falhas_da_meta_nunca_derrubam_o_webhook(client, session_maker, monkeypatch):
    import httpx
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker)
    casos = [svc.SendError("O WhatsApp recusou o envio.", 424), Exception("falha inesperada")]
    for i, erro in enumerate(casos):
        meta.erro = erro
        r = await _post(client, event(pnid, [text_msg(frm=f"551198765200{i}", ts=agora())]))
        assert r.status_code == 200 and r.json()["saved"] == 1, r.text
    assert await _saidas(session_maker, tenant) == []
    # erro 4xx, 5xx e timeout reais no Graph (httpx falso): o webhook responde 200 e nada vira "enviada"
    meta.erro = None
    monkeypatch.setattr(svc, "_post_graph", _GRAPH_ORIGINAL)   # volta ao envio de verdade, com o httpx falso abaixo

    class Falso:
        resp = None
        erro = None
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k):
            if Falso.erro:
                raise Falso.erro
            return Falso.resp

    monkeypatch.setattr(svc.httpx, "AsyncClient", Falso)
    for n, (resp, erro) in enumerate([(httpx.Response(401, json={"error": {"code": 190}}), None),
                                      (httpx.Response(503, json={}), None), (None, httpx.ReadTimeout("lento"))]):
        Falso.resp, Falso.erro = resp, erro
        r = await _post(client, event(pnid, [text_msg(frm=f"551198765300{n}", ts=agora())]))
        assert r.status_code == 200 and r.json()["saved"] == 1
    assert await _saidas(session_maker, tenant) == []
    async with session_maker() as s:
        assert (await s.execute(select(func.count()).select_from(WhatsAppMessage).where(
            WhatsAppMessage.tenant_id == tenant, WhatsAppMessage.direction == "in"))).scalar() == 5


async def test_reentrega_da_mesma_mensagem_nao_saúda_de_novo(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker)
    m = text_msg(frm="5511987651008", ts=agora())
    for _ in range(4):
        assert (await _post(client, event(pnid, [m]))).status_code == 200
    assert len(meta.enviadas) == 1 and len(await _saidas(session_maker, tenant)) == 1


async def test_duas_mensagens_diferentes_ao_mesmo_tempo_uma_saudacao(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker)
    rs = await asyncio.gather(*[_post(client, event(pnid, [text_msg(frm="5511987651009", ts=agora())])) for _ in range(4)])
    assert [r.status_code for r in rs] == [200] * 4
    assert len(meta.enviadas) == 1 and len(await _saidas(session_maker, tenant)) == 1
