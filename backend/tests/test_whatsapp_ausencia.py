"""WhatsApp oficial: horário comercial e mensagem de ausência (1 por janela de 24 h, nunca junto da saudação)."""
import asyncio
import json
import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppConversation, WhatsAppMessage
from app.services import whatsapp_cloud_service as svc
from tests.test_whatsapp_cloud import (  # noqa: F401  (fixtures reaproveitadas)
    SECRET, URL, _number, client, event, session_maker, sign, st, text_msg,
)
from tests.test_whatsapp_saudacao import Meta, _post, _saidas, agora

pytestmark = pytest.mark.asyncio
SAUDACAO = "Olá! Seja bem-vinda à W.A Fitness."
AUSENCIA = "Olá! No momento a loja está fechada. Assim que abrirmos, a gente te responde."
BRT = timezone(timedelta(hours=-3))


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "token-de-teste")


def horario_em_torno_de(ts: int) -> dict:
    """Horário que inclui o instante `ts` (em Brasília) e mais nada."""
    local = datetime.fromtimestamp(ts, timezone.utc).astimezone(BRT)
    m = local.hour * 60 + local.minute
    a, b = max(0, m - 5), min(1439, m + 5)
    h = {d: [] for d in svc.DAYS}
    h[svc.DAYS[local.weekday()]] = [[f"{a // 60:02d}:{a % 60:02d}", f"{b // 60:02d}:{b % 60:02d}"]]
    return h


FECHADA = {d: [] for d in svc.DAYS}   # nunca abre


async def _loja(session_maker, *, hours, away=True, away_text=AUSENCIA, greeting=True):
    tenant_id, pnid = await _number(session_maker)
    async with session_maker() as s:
        n = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
        n.greeting_enabled, n.greeting_text = greeting, SAUDACAO
        n.away_enabled, n.away_text = away, away_text
        n.business_hours = json.dumps(hours) if hours is not None else None
        await s.commit()
    return tenant_id, pnid


# ── horário: funções puras (virada do dia, domingo, validação) ───────────────

def test_horario_virada_do_dia_domingo_e_fuso():
    h = svc.parse_hours(json.dumps({**FECHADA, "sat": [["09:00", "18:00"]], "sun": [], "mon": [["08:00", "12:00"], ["14:00", "18:00"]]}))
    brt = lambda *a: datetime(*a, tzinfo=BRT)
    # sábado 2026-10-31
    assert svc.is_open_at(h, brt(2026, 10, 31, 9, 0)) and svc.is_open_at(h, brt(2026, 10, 31, 17, 59))
    assert not svc.is_open_at(h, brt(2026, 10, 31, 18, 0)) and not svc.is_open_at(h, brt(2026, 10, 31, 8, 59))
    # virada do dia: 23:59 de sábado e 00:00 de domingo são fechados; 00:00 de segunda também
    assert not svc.is_open_at(h, brt(2026, 10, 31, 23, 59)) and not svc.is_open_at(h, brt(2026, 11, 1, 0, 0))
    # domingo (1/11) fechado o dia inteiro; segunda tem duas faixas e o intervalo de almoço fecha
    assert not svc.is_open_at(h, brt(2026, 11, 1, 12, 0))
    assert svc.is_open_at(h, brt(2026, 11, 2, 8, 0)) and not svc.is_open_at(h, brt(2026, 11, 2, 13, 0)) and svc.is_open_at(h, brt(2026, 11, 2, 14, 0))
    # o instante em UTC é convertido para Brasília: 02:30 UTC de domingo ainda é sábado 23:30 em Brasília (fechado,
    # mas sábado), e 12:30 UTC de sábado é 09:30 em Brasília (aberto)
    assert svc.is_open_at(h, datetime(2026, 10, 31, 12, 30, tzinfo=timezone.utc))
    assert not svc.is_open_at(h, datetime(2026, 11, 1, 2, 30, tzinfo=timezone.utc))
    # 20:30 UTC de segunda é 17:30 em Brasília: aberto
    assert svc.is_open_at(h, datetime(2026, 11, 2, 20, 30, tzinfo=timezone.utc))
    assert svc.is_open_at(None, brt(2026, 11, 1, 3, 0))   # sem horário configurado = sempre aberta


def test_validacao_do_horario_da_tela():
    ok = svc.validate_hours({"mon": [["14:00", "18:00"], ["08:00", "12:00"]]})
    assert ok["mon"] == [["08:00", "12:00"], ["14:00", "18:00"]] and ok["sun"] == []
    for ruim in ({"mon": [["18:00", "09:00"]]}, {"mon": [["09:00", "09:00"]]}, {"mon": [["9:00", "18:00"]]},
                 {"mon": [["09:00", "25:00"]]}, {"mon": [["08:00", "12:00"], ["11:00", "13:00"]]},
                 {"mon": [["01:00", "02:00"], ["03:00", "04:00"], ["05:00", "06:00"], ["07:00", "08:00"], ["09:00", "10:00"]]},
                 {"mon": [["09:00"]]}, "x"):
        with pytest.raises(ValueError):
            svc.validate_hours(ruim)


# ── ausência pelo webhook ────────────────────────────────────────────────────

async def test_fora_do_horario_so_a_ausencia_uma_por_janela(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker, hours=FECHADA)
    fone = "5511987661001"
    assert (await _post(client, event(pnid, [text_msg(frm=fone, ts=agora())]))).status_code == 200
    assert len(meta.enviadas) == 1 and meta.enviadas[0][1]["text"]["body"] == AUSENCIA   # a saudação NÃO sai
    for _ in range(3):
        assert (await _post(client, event(pnid, [text_msg(frm=fone, ts=agora())]))).status_code == 200
    assert len(meta.enviadas) == 1
    # janela de 24 h vence: a cliente volta e recebe a ausência de novo
    async with session_maker() as s:
        conv = (await s.execute(select(WhatsAppConversation).where(WhatsAppConversation.tenant_id == tenant))).scalar_one()
        velho = conv.last_inbound_at - timedelta(hours=25)
        conv.last_inbound_at, conv.last_away_at = velho, velho
        await s.commit()
    assert (await _post(client, event(pnid, [text_msg(frm=fone, ts=agora())]))).status_code == 200
    assert len(meta.enviadas) == 2 and all(b["text"]["body"] == AUSENCIA for _, b in meta.enviadas)
    saidas = await _saidas(session_maker, tenant)
    assert len(saidas) == 2 and all(m.status == "sent" and m.wamid for m in saidas)


async def test_dentro_do_horario_vale_a_saudacao(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    ts = agora()
    tenant, pnid = await _loja(session_maker, hours=horario_em_torno_de(ts))
    assert (await _post(client, event(pnid, [text_msg(frm="5511987661002", ts=ts)]))).status_code == 200
    assert [b["text"]["body"] for _, b in meta.enviadas] == [SAUDACAO]


async def test_ausencia_desligada_sem_texto_ou_sem_horario_nao_envia_ausencia(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    casos = [dict(hours=FECHADA, away=False), dict(hours=FECHADA, away_text=None), dict(hours=FECHADA, away_text="  "),
             dict(hours=None)]   # sem horário configurado = sempre aberta: só a saudação
    for i, kw in enumerate(casos):
        tenant, pnid = await _loja(session_maker, **kw)
        assert (await _post(client, event(pnid, [text_msg(frm=f"551198766110{i}", ts=agora())]))).status_code == 200
        corpos = [b["text"]["body"] for t, b in meta.enviadas[-1:]] if meta.enviadas else []
        assert AUSENCIA not in [b["text"]["body"] for _, b in meta.enviadas]
    # nesses casos a saudação continua valendo (ausência desligada não suprime a saudação)
    assert all(b["text"]["body"] == SAUDACAO for _, b in meta.enviadas) and len(meta.enviadas) == len(casos)


async def test_saudacao_e_ausencia_nunca_juntas_na_mesma_janela(session_maker):
    tenant, pnid = await _loja(session_maker, hours=FECHADA)
    agora_dt = datetime.now(timezone.utc)
    async with session_maker() as s:
        n = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == pnid))).scalar_one()
        conv = WhatsAppConversation(tenant_id=tenant, number_id=n.id, contact_key="5511987661003", phone="5511987661003", wa_id="5511987661003")
        s.add(conv)
        await s.commit()
        assert await svc._claim_greeting(s, n, conv, agora_dt) is True
        await s.commit()
        assert await svc._claim_away(s, n, conv, agora_dt + timedelta(minutes=1)) is False   # saudação já ocupou a janela
        conv2 = WhatsAppConversation(tenant_id=tenant, number_id=n.id, contact_key="5511987661004", phone="5511987661004", wa_id="5511987661004")
        s.add(conv2)
        await s.commit()
        assert await svc._claim_away(s, n, conv2, agora_dt) is True
        await s.commit()
        assert await svc._claim_greeting(s, n, conv2, agora_dt + timedelta(minutes=1)) is False  # e a ausência a ocupou


async def test_contato_do_sistema_nunca_recebe_ausencia(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker, hours=FECHADA)
    async with session_maker() as s:
        s.add(WhatsAppCloudNumber(tenant_id=tenant, phone_number_id="PNID-OUTRO-AUS", display_phone_number="551132151035"))
        await s.commit()
    assert (await _post(client, event(pnid, [text_msg(frm="551132151035", ts=agora())]))).status_code == 200
    assert meta.enviadas == []


async def test_falhas_da_meta_na_ausencia_nunca_derrubam_o_webhook(client, session_maker, monkeypatch):
    import httpx
    original = svc._post_graph
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker, hours=FECHADA)
    for i, erro in enumerate([svc.SendError("recusou", 424), Exception("inesperado")]):
        meta.erro = erro
        r = await _post(client, event(pnid, [text_msg(frm=f"551198766200{i}", ts=agora())]))
        assert r.status_code == 200 and r.json()["saved"] == 1
    monkeypatch.setattr(svc, "_post_graph", original)

    class Falso:
        resp = erro = None
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k):
            if Falso.erro:
                raise Falso.erro
            return Falso.resp

    monkeypatch.setattr(svc.httpx, "AsyncClient", Falso)
    for n, (resp, erro) in enumerate([(httpx.Response(401, json={}), None), (httpx.Response(503, json={}), None), (None, httpx.ReadTimeout("x"))]):
        Falso.resp, Falso.erro = resp, erro
        r = await _post(client, event(pnid, [text_msg(frm=f"551198766300{n}", ts=agora())]))
        assert r.status_code == 200 and r.json()["saved"] == 1
    assert await _saidas(session_maker, tenant) == []


async def test_reentrega_e_mensagens_simultaneas_uma_ausencia(client, session_maker, monkeypatch):
    meta = Meta(monkeypatch)
    tenant, pnid = await _loja(session_maker, hours=FECHADA)
    m = text_msg(frm="5511987661005", ts=agora())
    for _ in range(4):
        assert (await _post(client, event(pnid, [m]))).status_code == 200
    rs = await asyncio.gather(*[_post(client, event(pnid, [text_msg(frm="5511987661006", ts=agora())])) for _ in range(4)])
    assert [r.status_code for r in rs] == [200] * 4
    assert len(meta.enviadas) == 2 and len(await _saidas(session_maker, tenant)) == 2   # uma por cliente


async def test_a_virada_do_dia_no_webhook_usa_o_horario_de_brasilia(client, session_maker, monkeypatch):
    """Mensagem de 23:59 de sábado em Brasília cai no sábado (aberto até 23:59:59 só se a faixa cobrir): usa o dia local, não o UTC."""
    meta = Meta(monkeypatch)
    # faixa só no DOMINGO; a mensagem chega no sábado à noite em Brasília (que já é domingo em UTC)
    horario = {**FECHADA, "sun": [["00:00", "23:59"]]}
    tenant, pnid = await _loja(session_maker, hours=horario)
    sabado_23h30_brt = datetime(2026, 10, 31, 23, 30, tzinfo=BRT)            # = 2026-11-01 02:30 UTC
    # a janela de envio compara com o relógio real: força "agora" para perto dessa data
    real_now = svc.datetime
    class FakeDT(datetime):
        @classmethod
        def now(cls, tz=None):
            return sabado_23h30_brt.astimezone(tz) if tz else sabado_23h30_brt.replace(tzinfo=None)
    monkeypatch.setattr(svc, "datetime", FakeDT)
    ts = int(sabado_23h30_brt.timestamp())
    assert (await _post(client, event(pnid, [text_msg(frm="5511987661007", ts=ts)]))).status_code == 200
    assert [b["text"]["body"] for _, b in meta.enviadas] == [AUSENCIA]   # sábado em Brasília: fechado, mesmo sendo domingo em UTC
    monkeypatch.setattr(svc, "datetime", real_now)
