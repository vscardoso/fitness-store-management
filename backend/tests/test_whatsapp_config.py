"""WhatsApp: perfil comercial (Meta mockada), horário e ausência, respostas rápidas e etiquetas."""
import json

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.user import UserRole
from app.models.whatsapp_cloud import WhatsAppCloudNumber
from app.services import whatsapp_cloud_service as svc
from tests.test_whatsapp_inbox import _conversa, _gerente, _loja, _sem_override  # noqa: F401

pytestmark = pytest.mark.asyncio
API = "/api/v1/whatsapp"


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "token-de-teste")


class Perfil:
    """Graph API falsa do perfil: guarda o que foi pedido e pode falhar."""

    def __init__(self, monkeypatch):
        self.chamadas = []
        self.erro = None
        self.resposta_post = {"success": True}
        self.estado = {"about": "Moda fitness", "address": "Av. Teste, 1", "description": "Loja", "email": "loja@example.com",
                       "websites": ["https://exemplo.com.br"], "vertical": "APPAREL", "profile_picture_url": "https://cdn.example/foto.jpg"}

        async def falso(phone_number_id, body=None):
            self.chamadas.append((phone_number_id, body))
            if self.erro:
                raise self.erro
            if body is None:
                return {"data": [dict(self.estado)]}
            self.estado.update({k: v for k, v in body.items() if k != "messaging_product"})
            return self.resposta_post

        monkeypatch.setattr(svc, "_graph_profile", falso)


# ── perfil ───────────────────────────────────────────────────────────────────

def test_validacao_do_perfil_antes_de_chamar_a_meta():
    ok = svc.validate_profile({"about": "  oi ", "address": "", "websites": ["https://a.com", ""], "vertical": "apparel"})
    assert ok == {"about": "oi", "websites": ["https://a.com"], "vertical": "APPAREL"}
    ruins = [{"about": "x" * 140}, {"address": "x" * 257}, {"description": "x" * 513}, {"email": "x" * 129},
             {"email": "sem-arroba"}, {"websites": ["http://inseguro.com"]}, {"websites": ["https://a.com", "https://b.com", "https://c.com"]},
             {"vertical": "INVENTADO"}, {}]
    for r in ruins:
        with pytest.raises(ValueError):
            svc.validate_profile(r)
    assert svc.validate_profile({"about": "x" * 139, "description": "y" * 512})   # nos limites passa


async def test_perfil_ler_gravar_so_campos_preenchidos_e_erros_legiveis(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, h = await _loja(async_session, role=UserRole.ADMIN)
    meta = Perfil(monkeypatch)
    r = await test_client.get(f"{API}/profile", headers=h)
    assert r.status_code == 200 and r.json()["about"] == "Moda fitness" and r.json()["vertical"] == "APPAREL"
    assert r.json()["limits"]["about"] == 139 and "APPAREL" in r.json()["verticals"]
    assert meta.chamadas == [(num.phone_number_id, None)]   # leitura não grava nada
    # grava só o que veio preenchido
    r = await test_client.put(f"{API}/profile", headers=h, json={"about": "Novo recado", "email": "", "websites": ["https://provadorfit.com.br"]})
    assert r.status_code == 200 and r.json()["about"] == "Novo recado"
    post = [c for c in meta.chamadas if c[1] is not None][0][1]
    assert post == {"about": "Novo recado", "websites": ["https://provadorfit.com.br"]}
    # tamanho errado: 400 sem chamar a Meta
    antes = len(meta.chamadas)
    r = await test_client.put(f"{API}/profile", headers=h, json={"about": "x" * 140})
    assert r.status_code == 400 and "139" in r.json()["detail"] and len(meta.chamadas) == antes
    # erro da Meta, resposta sem success e timeout viram frase legível, nunca "salvo"
    meta.erro = svc.SendError("O WhatsApp recusou a alteração do perfil. Confira os campos e tente de novo.", 424)
    r = await test_client.put(f"{API}/profile", headers=h, json={"about": "tenta"})
    assert r.status_code == 424 and "recusou" in r.json()["detail"]
    meta.erro = None
    meta.resposta_post = {"success": False}
    r = await test_client.put(f"{API}/profile", headers=h, json={"about": "tenta de novo"})
    assert r.status_code == 424 and "não confirmou" in r.json()["detail"]


async def test_perfil_so_admin_e_loja_sem_numero(test_client, async_session, monkeypatch):
    _sem_override()
    store, num, hs = await _loja(async_session)           # vendedor
    ha = await _gerente(async_session, store)             # gerente
    Perfil(monkeypatch)
    for hh in (hs, ha):
        assert (await test_client.get(f"{API}/profile", headers=hh)).status_code == 403
        assert (await test_client.put(f"{API}/profile", headers=hh, json={"about": "x"})).status_code == 403


async def test_graph_do_perfil_erros_reais_viram_frase(monkeypatch):
    import httpx

    class Falso:
        resp = erro = None
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): return await self.post()
        async def post(self, *a, **k):
            if Falso.erro:
                raise Falso.erro
            return Falso.resp

    monkeypatch.setattr(svc.httpx, "AsyncClient", Falso)
    for resp, erro, trecho in [(httpx.Response(401, json={"error": {"code": 190}}), None, "venceu"),
                               (httpx.Response(400, json={"error": {"code": 100}}), None, "recusou"),
                               (httpx.Response(503, json={}), None, "recusou"),
                               (None, httpx.ReadTimeout("lento"), "falar com o WhatsApp")]:
        Falso.resp, Falso.erro = resp, erro
        with pytest.raises(svc.SendError) as e:
            await svc._graph_profile("pn", {"about": "x"})
        assert trecho in e.value.message and e.value.status_code == 424
    Falso.erro = None
    Falso.resp = httpx.Response(200, json={"success": True})
    assert (await svc._graph_profile("pn", {"about": "x"})) == {"success": True}


# ── horário e ausência (configuração) ────────────────────────────────────────

async def test_configuracao_da_ausencia_valida_salva_e_isola(test_client, async_session):
    _sem_override()
    a, num_a, ha = await _loja(async_session, role=UserRole.ADMIN)
    b, num_b, hb = await _loja(async_session, role=UserRole.ADMIN)
    _, _, hs = await _loja(async_session)
    g = (await test_client.get(f"{API}/away", headers=ha)).json()
    assert g["enabled"] is False and g["has_hours"] is False and g["timezone"] == "America/Sao_Paulo" and g["hours"]["mon"] == []
    assert (await test_client.get(f"{API}/away", headers=hs)).status_code == 403
    horas = {"mon": [["09:00", "18:00"]], "tue": [["09:00", "18:00"]], "sat": [["09:00", "13:00"]]}
    # ligar sem texto, sem horário, com horário ruim e com texto grande
    for corpo in ({"enabled": True, "text": "", "hours": horas}, {"enabled": True, "text": "Fechado."}, {"enabled": True, "text": "x", "hours": {"mon": []}},
                  {"enabled": False, "text": "x" * 1001}, {"enabled": False, "hours": {"mon": [["18:00", "09:00"]]}}):
        r = await test_client.put(f"{API}/away", headers=ha, json=corpo)
        assert r.status_code == 400, (corpo, r.text)
    r = await test_client.put(f"{API}/away", headers=ha, json={"enabled": True, "text": "  Olá! No momento a loja está fechada.  ", "hours": horas})
    assert r.status_code == 200 and r.json()["enabled"] is True and r.json()["text"] == "Olá! No momento a loja está fechada."
    assert r.json()["hours"]["sat"] == [["09:00", "13:00"]] and r.json()["has_hours"] is True
    # desligar mantém texto e horário; trocar só o horário mantém o resto
    r = await test_client.put(f"{API}/away", headers=ha, json={"enabled": False, "text": "Olá! No momento a loja está fechada."})
    assert r.json()["enabled"] is False and r.json()["has_hours"] is True
    # a outra loja não é afetada
    assert (await test_client.get(f"{API}/away", headers=hb)).json()["has_hours"] is False
    guardado = (await async_session.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.id == num_a.id))).scalar_one()
    assert json.loads(guardado.business_hours)["mon"] == [["09:00", "18:00"]]


# ── respostas rápidas ────────────────────────────────────────────────────────

async def test_respostas_rapidas_crud_unicidade_reuso_e_permissoes(test_client, async_session):
    _sem_override()
    a, _, ha = await _loja(async_session, role=UserRole.ADMIN)
    b, _, hb = await _loja(async_session, role=UserRole.ADMIN)
    hs = {**ha}   # vendedor da loja A
    _, _, hs0 = await _loja(async_session)
    r = await test_client.post(f"{API}/quick-replies", headers=ha, json={"shortcut": "/Preco", "text": "O preço é R$ 99, {nome}."})
    assert r.status_code == 200 and r.json()["shortcut"] == "preco"
    qid = r.json()["id"]
    assert (await test_client.post(f"{API}/quick-replies", headers=ha, json={"shortcut": "preco", "text": "outro"})).status_code == 409
    for ruim in ({"shortcut": "com espaço", "text": "x"}, {"shortcut": "", "text": "x"}, {"shortcut": "ok", "text": ""}, {"shortcut": "ok", "text": "x" * 1001}):
        assert (await test_client.post(f"{API}/quick-replies", headers=ha, json=ruim)).status_code == 400
    # a outra loja pode usar o mesmo atalho; não vê nem mexe nas da primeira
    assert (await test_client.post(f"{API}/quick-replies", headers=hb, json={"shortcut": "preco", "text": "da loja B"})).status_code == 200
    assert [x["text"] for x in (await test_client.get(f"{API}/quick-replies", headers=hb)).json()] == ["da loja B"]
    assert (await test_client.put(f"{API}/quick-replies/{qid}", headers=hb, json={"shortcut": "x", "text": "invasor"})).status_code == 404
    assert (await test_client.delete(f"{API}/quick-replies/{qid}", headers=hb)).status_code == 404
    # editar e apagar; apagado não aparece e o atalho pode ser reaproveitado
    assert (await test_client.put(f"{API}/quick-replies/{qid}", headers=ha, json={"shortcut": "valor", "text": "Custa R$ 100."})).json()["shortcut"] == "valor"
    assert (await test_client.delete(f"{API}/quick-replies/{qid}", headers=ha)).status_code == 200
    assert (await test_client.get(f"{API}/quick-replies", headers=ha)).json() == []
    r = await test_client.post(f"{API}/quick-replies", headers=ha, json={"shortcut": "valor", "text": "Novo texto"})
    assert r.status_code == 200 and r.json()["id"] == qid
    # vendedor lê, mas não grava
    assert (await test_client.get(f"{API}/quick-replies", headers=hs0)).status_code == 200
    assert (await test_client.post(f"{API}/quick-replies", headers=hs0, json={"shortcut": "x", "text": "y"})).status_code == 403


# ── etiquetas ────────────────────────────────────────────────────────────────

async def test_etiquetas_crud_marcar_filtrar_e_isolar(test_client, async_session):
    _sem_override()
    a, num_a, ha = await _loja(async_session, role=UserRole.ADMIN)
    b, num_b, hb = await _loja(async_session, role=UserRole.ADMIN)
    c1 = await _conversa(async_session, a, num_a)
    c2 = await _conversa(async_session, a, num_a, wa_id="551166665555", phone="5511966665555")
    cb = await _conversa(async_session, b, num_b)
    cid1, cid2, cidb = c1.id, c2.id, cb.id
    r = await test_client.post(f"{API}/labels", headers=ha, json={"name": "Novo cliente", "color_key": "success"})
    assert r.status_code == 200 and r.json()["color_key"] == "success"
    l1 = r.json()["id"]
    l2 = (await test_client.post(f"{API}/labels", headers=ha, json={"name": "Pedido", "color_key": "warning"})).json()["id"]
    assert (await test_client.post(f"{API}/labels", headers=ha, json={"name": "Novo cliente", "color_key": "info"})).status_code == 409
    for ruim in ({"name": "", "color_key": "success"}, {"name": "x" * 41, "color_key": "success"}, {"name": "ok", "color_key": "#FF0000"}):
        assert (await test_client.post(f"{API}/labels", headers=ha, json=ruim)).status_code == 400
    # marcar: troca o conjunto inteiro
    r = await test_client.put(f"{API}/conversations/{cid1}/labels", headers=ha, json={"label_ids": [l1, l2]})
    assert r.status_code == 200 and [x["name"] for x in r.json()] == ["Novo cliente", "Pedido"]
    await test_client.put(f"{API}/conversations/{cid2}/labels", headers=ha, json={"label_ids": [l2]})
    lista = (await test_client.get(f"{API}/conversations", headers=ha)).json()
    assert {c["id"]: [l["name"] for l in c["labels"]] for c in lista} == {cid1: ["Novo cliente", "Pedido"], cid2: ["Pedido"]}
    # filtrar por etiqueta
    assert [c["id"] for c in (await test_client.get(f"{API}/conversations", headers=ha, params={"label_id": l1})).json()] == [cid1]
    assert len((await test_client.get(f"{API}/conversations", headers=ha, params={"label_id": l2})).json()) == 2
    det = (await test_client.get(f"{API}/conversations/{cid1}", headers=ha)).json()
    assert [l["name"] for l in det["labels"]] == ["Novo cliente", "Pedido"]
    # tirar uma etiqueta da conversa e recolocar
    await test_client.put(f"{API}/conversations/{cid1}/labels", headers=ha, json={"label_ids": [l2]})
    assert [c["id"] for c in (await test_client.get(f"{API}/conversations", headers=ha, params={"label_id": l1})).json()] == []
    await test_client.put(f"{API}/conversations/{cid1}/labels", headers=ha, json={"label_ids": [l1, l2]})
    assert len((await test_client.get(f"{API}/conversations", headers=ha, params={"label_id": l1})).json()) == 1
    # isolamento: outra loja não marca conversa nem usa etiqueta alheia
    assert (await test_client.put(f"{API}/conversations/{cid1}/labels", headers=hb, json={"label_ids": []})).status_code == 404
    assert (await test_client.put(f"{API}/conversations/{cidb}/labels", headers=hb, json={"label_ids": [l1]})).status_code == 400
    assert (await test_client.get(f"{API}/labels", headers=hb)).json() == []
    assert (await test_client.put(f"{API}/labels/{l1}", headers=hb, json={"name": "x", "color_key": "info"})).status_code == 404
    # renomear e apagar (some das conversas)
    assert (await test_client.put(f"{API}/labels/{l1}", headers=ha, json={"name": "Cliente nova", "color_key": "info"})).json()["name"] == "Cliente nova"
    assert (await test_client.delete(f"{API}/labels/{l1}", headers=ha)).status_code == 200
    lista = (await test_client.get(f"{API}/conversations", headers=ha)).json()
    assert {c["id"]: [l["name"] for l in c["labels"]] for c in lista} == {cid1: ["Pedido"], cid2: ["Pedido"]}
    # etiqueta apagada reaproveita o nome
    assert (await test_client.post(f"{API}/labels", headers=ha, json={"name": "Cliente nova", "color_key": "error"})).json()["id"] == l1


async def test_vendedor_marca_mas_nao_gerencia_etiquetas(test_client, async_session):
    _sem_override()
    a, num_a, ha = await _loja(async_session, role=UserRole.ADMIN)
    hs = await _vendedor(async_session, a)
    c = await _conversa(async_session, a, num_a)
    cid = c.id
    lid = (await test_client.post(f"{API}/labels", headers=ha, json={"name": "VIP", "color_key": "primary"})).json()["id"]
    assert (await test_client.get(f"{API}/labels", headers=hs)).status_code == 200
    assert (await test_client.post(f"{API}/labels", headers=hs, json={"name": "x", "color_key": "info"})).status_code == 403
    assert (await test_client.delete(f"{API}/labels/{lid}", headers=hs)).status_code == 403
    assert (await test_client.put(f"{API}/conversations/{cid}/labels", headers=hs, json={"label_ids": [lid]})).status_code == 200


async def _vendedor(db, store):
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User
    import itertools
    n = next(_SEQ)
    u = User(email=f"vend.{n}@example.com", full_name="Vendedora", hashed_password=get_password_hash("Senha1234"),
             role=UserRole.SELLER, tenant_id=store.id, is_active=True)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"Authorization": "Bearer " + create_access_token(data={"sub": str(u.id)}), "X-Tenant-Id": str(store.id)}


import itertools as _it
_SEQ = _it.count(9000)
