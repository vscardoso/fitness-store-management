"""Comprovante da venda para a cliente: PDF (58/80/A6) e texto do WhatsApp. Nunca mostra custo; não é documento fiscal."""
import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio


def _texto_pdf(content: bytes) -> str:
    from tests.test_short_codes import _pdf_text
    return _pdf_text(content)


def _largura_mm(content: bytes) -> float:
    import re
    w = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", content)
    return float(w.group(1)) * 25.4 / 72


async def _venda(client, h, p, v, qtd=2, preco="100.00", cliente_id=None, desconto="0"):
    body = {"payment_method": "cash", "discount_amount": desconto,
            "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": preco}],
            "payments": [{"amount": str(float(preco) * qtd - float(desconto)), "payment_method": "cash"}]}
    if cliente_id:
        body["customer_id"] = cliente_id
    r = await client.post("/api/v1/sales/", headers=h, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def test_comprovante_pdf_texto_e_sem_custo(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = await _venda(test_client, h, p, va, 2, "100.00")

    for size, largura in (("58", 58), ("80", 80), ("a6", 105)):
        r = await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf?size={size}", headers=h)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
        assert abs(_largura_mm(r.content) - largura) < 0.5            # largura exata do papel
        t = _texto_pdf(r.content)
        assert "Legging Troca" in t and "R$ 200,00" in t and "Dinheiro" in t
        assert "Sem valor fiscal" in t
        assert "R$ 40,00" not in t and "custo" not in t.lower()        # custo nunca aparece

    r = await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)
    assert r.status_code == 200
    j = r.json()
    assert "Total: R$ 200,00" in j["text"] and "2x Legging Troca" in j["text"] and "sem valor fiscal" in j["text"]
    assert "R$ 40,00" not in j["text"]
    assert j["whatsapp_url"] is None                                   # sem cliente, sem link
    assert j["receipt"]["pieces"] == 2


async def test_comprovante_com_cliente_desconto_troco_e_link(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    from app.models.customer import Customer
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = Customer(full_name="Maria da Silva", phone="(34) 99650-0091", tenant_id=t_id)
    async_session.add(c)
    await async_session.commit()
    sid = await _venda(test_client, h, p, va, 3, "100.00", cliente_id=c.id, desconto="30")

    j = (await test_client.get(f"/api/v1/sales/{sid}/receipt?change=10", headers=h)).json()
    assert "Desconto: -R$ 30,00" in j["text"] and "Total: R$ 270,00" in j["text"] and "Troco: R$ 10,00" in j["text"]
    assert "Cliente: Maria da Silva" in j["text"]
    assert j["whatsapp_url"].startswith("https://wa.me/5534996500091?text=")
    assert "Maria%20da%20Silva" in j["whatsapp_url"]

    pdf = await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf?size=80&change=10", headers=h)
    t = _texto_pdf(pdf.content)
    assert "Maria da Silva" in t and "Troco" in t and "R$ 270,00" in t


async def test_comprovante_telefone_invalido_nao_gera_link(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    from app.models.customer import Customer
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = Customer(full_name="Sem Fone", phone="123", tenant_id=t_id)
    async_session.add(c)
    await async_session.commit()
    sid = await _venda(test_client, h, p, va, 1, "100.00", cliente_id=c.id)
    j = (await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)).json()
    assert j["whatsapp_url"] is None and "Cliente: Sem Fone" in j["text"]


async def test_comprovante_de_venda_cancelada_avisa(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = await _venda(test_client, h, p, va, 1, "100.00")
    assert (await test_client.post(f"/api/v1/sales/{sid}/cancel?reason=teste", headers=h)).status_code == 200
    j = (await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)).json()
    assert "VENDA CANCELADA" in j["text"]
    assert "VENDA CANCELADA" in _texto_pdf((await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf", headers=h)).content)


async def test_comprovante_de_outra_loja_e_inexistente_dao_404_e_tamanho_invalido_422(test_client, async_session, test_user):
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    assert (await test_client.get("/api/v1/sales/99999999/receipt", headers=h)).status_code == 404
    assert (await test_client.get("/api/v1/sales/99999999/receipt/pdf", headers=h)).status_code == 404
    sid = await _venda(test_client, h, p, va, 1, "100.00")
    assert (await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf?size=999", headers=h)).status_code == 422
    assert (await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf")).status_code in (401, 403)


async def test_listar_por_numero_devolve_so_a_venda_pedida(test_client, async_session, test_user):
    """Antes o filtro `sale_number` era ignorado sem período e vinha a venda mais recente (comprovante da venda errada)."""
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    a = await _venda(test_client, h, p, va, 1, "100.00")
    b = await _venda(test_client, h, p, va, 1, "100.00")
    num_a = (await test_client.get(f"/api/v1/sales/{a}", headers=h)).json()["sale_number"]
    r = await test_client.get(f"/api/v1/sales/?sale_number={num_a}", headers=h)
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == [a]
    assert (await test_client.get("/api/v1/sales/?sale_number=NAO-EXISTE", headers=h)).json() == []


async def test_item_da_venda_traz_codigo_da_etiqueta_mas_comprovante_nao(test_client, async_session, test_user):
    """O #produto-variação aparece na tela de controle (API da venda) e NUNCA no comprovante da cliente."""
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = await _venda(test_client, h, p, va, 1, "100.00")
    item = (await test_client.get(f"/api/v1/sales/{sid}", headers=h)).json()["items"][0]
    cod = item["variant_code"]
    assert cod and cod.startswith("#") and "-" in cod, item
    j = (await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)).json()
    assert cod not in j["text"]
    assert cod not in _texto_pdf((await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf", headers=h)).content)


async def test_lista_de_vendas_traz_codigo_da_etiqueta_dos_itens(test_client, async_session, test_user):
    """A lista de vendas (celular e notebook) mostra os códigos #produto-variação das peças, com ou sem período."""
    from datetime import date
    from tests.test_troca import _cenario
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = await _venda(test_client, h, p, va, 1, "100.00")
    hoje = date.today().isoformat()
    for url in ("/api/v1/sales/?limit=50", f"/api/v1/sales/?start_date={hoje}&end_date={hoje}&limit=50"):
        lista = (await test_client.get(url, headers=h)).json()
        venda = next(v for v in lista if v["id"] == sid)
        assert venda["items"][0]["variant_code"], url


# ── envio pelo WhatsApp OFICIAL da loja (número fixo), Meta simulada ──────────────────────────────────────────

import httpx  # noqa: E402


class _Meta:
    """httpx.AsyncClient falso do upload do PDF; as mensagens passam por `_post_graph` falso (ver `_meta`)."""
    upload = httpx.Response(200, json={"id": "MEDIA-COMP"})
    subidos = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, **kw):
        _Meta.subidos.append((url, kw.get("files")))
        return _Meta.upload


import itertools  # noqa: E402

_wamid = itertools.count(1)   # id de mensagem único (a tabela exige wamid único; a lista de chamadas pode ser zerada no teste)


def _meta(monkeypatch, erro=None):
    from app.core.config import settings
    from app.services import whatsapp_cloud_service as svc
    chamadas = []
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "token-de-teste")

    async def falso(phone_number_id, body):
        chamadas.append((phone_number_id, body))
        if erro:
            raise erro
        return {"messages": [{"id": f"wamid.comp{next(_wamid)}"}]}

    monkeypatch.setattr(svc, "_post_graph", falso)
    monkeypatch.setattr(svc.httpx, "AsyncClient", _Meta)
    _Meta.upload = httpx.Response(200, json={"id": "MEDIA-COMP"})
    _Meta.subidos = []
    return chamadas


async def _zap(db, t_id, *, com_numero=True, janela_aberta=True, fone="(34) 99650-0091"):
    """Cliente com telefone e (opcional) número oficial da loja + conversa com a janela de 24 h aberta ou fechada."""
    from datetime import datetime, timedelta, timezone
    from app.models.customer import Customer
    from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppConversation
    from app.services.whatsapp_cloud_service import customer_phone_key
    c = Customer(full_name="Maria da Silva", phone=fone, tenant_id=t_id)
    db.add(c)
    await db.flush()
    if com_numero:
        num = WhatsAppCloudNumber(tenant_id=t_id, phone_number_id="pn-comprovante", display_phone_number="553433050261")
        db.add(num)
        await db.flush()
        key = customer_phone_key(fone)
        ago = timedelta(hours=1 if janela_aberta else 30)
        now = datetime.now(timezone.utc)
        db.add(WhatsAppConversation(tenant_id=t_id, number_id=num.id, contact_key=key, phone=key, wa_id=key,
                                    last_inbound_at=now - ago, last_message_at=now - ago))
    await db.commit()
    return c


async def test_envio_oficial_dentro_da_janela_manda_o_pdf_pelo_numero_da_loja(test_client, async_session, test_user, monkeypatch):
    from tests.test_troca import _cenario
    chamadas = _meta(monkeypatch)
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _zap(async_session, t_id)
    sid = await _venda(test_client, h, p, va, 2, "100.00", cliente_id=c.id)

    info = (await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)).json()
    assert info["store_whatsapp"] == {"connected": True, "number": "(34) 3305-0261"}

    r = await test_client.post(f"/api/v1/sales/{sid}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == {"mode": "pdf", "store_number": "(34) 3305-0261", "customer": "Maria da Silva"}
    assert len(chamadas) == 1 and chamadas[0][0] == "pn-comprovante"          # saiu pelo número da LOJA
    corpo = chamadas[0][1]
    assert corpo["type"] == "document" and corpo["to"] == "5534996500091"
    assert corpo["document"]["filename"].startswith("comprovante-") and "R$ 200,00" in corpo["document"]["caption"]
    assert _Meta.subidos and _Meta.subidos[0][1]["file"][1].startswith(b"%PDF")  # o arquivo subido é o PDF do comprovante


async def test_envio_oficial_fora_da_janela_usa_o_modelo_aprovado(test_client, async_session, test_user, monkeypatch):
    from app.core.config import settings
    from tests.test_troca import _cenario
    chamadas = _meta(monkeypatch)
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _zap(async_session, t_id, janela_aberta=False)
    sid = await _venda(test_client, h, p, va, 2, "100.00", cliente_id=c.id)

    # sem modelo configurado: explica e NÃO manda nada
    monkeypatch.setattr(settings, "WHATSAPP_RECEIPT_TEMPLATE", "")
    r = await test_client.post(f"/api/v1/sales/{sid}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 409 and "modelo" in r.json()["detail"] and not chamadas

    # com modelo: manda o modelo com cliente, loja, venda e total
    monkeypatch.setattr(settings, "WHATSAPP_RECEIPT_TEMPLATE", "comprovante_venda")
    r = await test_client.post(f"/api/v1/sales/{sid}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 200 and r.json()["mode"] == "template", r.text
    tpl = chamadas[0][1]["template"]
    assert chamadas[0][1]["type"] == "template" and tpl["name"] == "comprovante_venda" and tpl["language"]["code"] == "pt_BR"
    params = [x["text"] for x in tpl["components"][0]["parameters"]]
    assert params[0] == "Maria" and params[3] == "R$ 200,00" and params[2].startswith("VENDA-")


async def test_envio_oficial_recusas(test_client, async_session, test_user, monkeypatch):
    from tests.test_troca import _cenario
    chamadas = _meta(monkeypatch)
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sem_cliente = await _venda(test_client, h, p, va, 1, "100.00")
    r = await test_client.post(f"/api/v1/sales/{sem_cliente}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 409 and "cliente" in r.json()["detail"]
    sem_fone = await _zap(async_session, t_id, com_numero=False, fone="123")
    sid = await _venda(test_client, h, p, va, 1, "100.00", cliente_id=sem_fone.id)
    r = await test_client.post(f"/api/v1/sales/{sid}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 409
    com_fone = await _zap(async_session, t_id, com_numero=False)               # loja sem número oficial ligado
    sid2 = await _venda(test_client, h, p, va, 1, "100.00", cliente_id=com_fone.id)
    assert (await test_client.get(f"/api/v1/sales/{sid2}/receipt", headers=h)).json()["store_whatsapp"]["connected"] is False
    r = await test_client.post(f"/api/v1/sales/{sid2}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 409 and "número oficial" in r.json()["detail"]
    assert not chamadas
    assert (await test_client.post("/api/v1/sales/99999999/receipt/send-whatsapp", headers=h)).status_code == 404


async def test_envio_oficial_meta_recusa_e_nada_fica_gravado(test_client, async_session, test_user, monkeypatch):
    from sqlalchemy import func, select
    from app.models.whatsapp_cloud import WhatsAppMessage
    from app.services.whatsapp_cloud_service import SendError
    from tests.test_troca import _cenario
    _meta(monkeypatch, erro=SendError("O WhatsApp recusou o envio. Confira o número da cliente e tente de novo.", 424))
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _zap(async_session, t_id)
    sid = await _venda(test_client, h, p, va, 1, "100.00", cliente_id=c.id)
    antes = (await async_session.execute(select(func.count()).select_from(WhatsAppMessage))).scalar()
    r = await test_client.post(f"/api/v1/sales/{sid}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 424 and "recusou" in r.json()["detail"]
    assert (await async_session.execute(select(func.count()).select_from(WhatsAppMessage))).scalar() == antes


async def test_comprovante_depois_da_devolucao_mostra_devolvido_troca_e_pontos(test_client, async_session, test_user):
    """O comprovante reflete a devolução: o que voltou, quanto foi estornado, o que ficou da venda e os pontos."""
    from app.models.customer import Customer
    from tests.test_troca import _cenario, _config
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    c = Customer(full_name="Maria da Silva", phone="(34) 99650-0091", tenant_id=t_id)
    async_session.add(c)
    await async_session.commit()
    sid = await _venda(test_client, h, p, va, 3, cliente_id=c.id)       # R$ 300, ganha 30 pontos (1 por R$ 10)
    antes = (await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)).json()
    assert antes["receipt"]["returns"] == [] and antes["receipt"]["points_earned"] == 30
    assert "Devolução" not in antes["text"]

    item_id = (await test_client.get(f"/api/v1/sales/{sid}", headers=h)).json()["items"][0]["id"]
    r = await test_client.post(f"/api/v1/returns/{sid}", headers=h, json={"reason": "não serviu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text

    d = (await test_client.get(f"/api/v1/sales/{sid}/receipt", headers=h)).json()
    rec = d["receipt"]
    assert rec["refunded"] == 100 and rec["net_total"] == 200 and len(rec["returns"]) == 1
    assert rec["returns"][0]["items"][0]["quantity"] == 1 and rec["returns"][0]["exchange"] is None
    assert rec["points_earned"] == 30 and rec["points_kept"] == 20          # devolveu 1/3: perde 10 dos 30 pontos
    assert "Devolução em" in d["text"] and "Estornado: R$ 100,00" in d["text"] and "Ficou da venda: R$ 200,00" in d["text"]
    assert "ganhou 30, ficou com 20" in d["text"]
    assert "motivo" not in d["text"].lower() and "não serviu" not in d["text"]       # o motivo é interno
    pdf = _texto_pdf((await test_client.get(f"/api/v1/sales/{sid}/receipt/pdf", headers=h)).content)
    assert "DEVOLUÇÃO" in pdf and "FICOU DA VENDA" in pdf and "R$ 200,00" in pdf and "ficou com 20" in pdf
    assert "não serviu" not in pdf

    # troca: a peça nova aparece e a diferença
    sid2 = await _venda(test_client, h, p, va, 2, cliente_id=c.id)
    item2 = (await test_client.get(f"/api/v1/sales/{sid2}", headers=h)).json()["items"][0]["id"]
    r = await test_client.post(f"/api/v1/returns/{sid2}", headers=h, json={
        "reason": "tamanho", "items": [{"sale_item_id": item2, "quantity": 1, "replacement_variant_id": vb.id}]})
    assert r.status_code == 201, r.text
    d2 = (await test_client.get(f"/api/v1/sales/{sid2}/receipt", headers=h)).json()
    ret = d2["receipt"]["returns"][0]
    assert ret["exchange"] and ret["exchange"]["items"][0]["quantity"] == 1
    assert "Levou no lugar" in d2["text"]
    assert "TROCA" in _texto_pdf((await test_client.get(f"/api/v1/sales/{sid2}/receipt/pdf", headers=h)).content)


async def test_aviso_de_devolucao_pelo_whatsapp_da_loja(test_client, async_session, test_user, monkeypatch):
    """Depois de uma devolução comum, o comprovante atualizado vai pelo número da loja: PDF com legenda na janela de 24 h,
    modelo aprovado de devolução fora dela."""
    from app.core.config import settings
    from tests.test_troca import _cenario, _config
    chamadas = _meta(monkeypatch)
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    c = await _zap(async_session, t_id)
    sid = await _venda(test_client, h, p, va, 3, cliente_id=c.id)
    item_id = (await test_client.get(f"/api/v1/sales/{sid}", headers=h)).json()["items"][0]["id"]
    r = await test_client.post(f"/api/v1/returns/{sid}", headers=h, json={"reason": "não serviu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text

    r = await test_client.post(f"/api/v1/sales/{sid}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 200 and r.json()["mode"] == "pdf", r.text
    legenda = chamadas[0][1]["document"]["caption"]
    assert "devolução registrada (R$ 100,00)" in legenda and "Ficou da venda: R$ 200,00" in legenda and "Pontos desta compra: 20" in legenda
    assert "não serviu" not in legenda                                     # o motivo é interno

    # fora da janela de 24 h
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select, update
    from app.models.whatsapp_cloud import WhatsAppConversation
    await async_session.execute(update(WhatsAppConversation).where(WhatsAppConversation.tenant_id == t_id).values(
        last_inbound_at=datetime.now(timezone.utc) - timedelta(hours=30)))
    await async_session.commit()
    chamadas.clear()
    monkeypatch.setattr(settings, "WHATSAPP_RETURN_TEMPLATE", "")
    monkeypatch.setattr(settings, "WHATSAPP_RECEIPT_TEMPLATE", "comprovante_venda")      # o da venda NÃO serve para devolução
    r = await test_client.post(f"/api/v1/sales/{sid}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 409 and not chamadas
    monkeypatch.setattr(settings, "WHATSAPP_RETURN_TEMPLATE", "devolucao_registrada")
    r = await test_client.post(f"/api/v1/sales/{sid}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 200 and r.json()["mode"] == "template", r.text
    tpl = chamadas[0][1]["template"]
    params = [x["text"] for x in tpl["components"][0]["parameters"]]
    assert tpl["name"] == "devolucao_registrada" and params[0] == "Maria" and params[3] == "R$ 100,00"
