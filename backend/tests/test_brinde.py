"""Brinde: peça que sai do estoque sem cobrança. Só administrador. O custo vira a linha "Brindes" do Resultado do Mês.
Brinde NÃO aceita devolução (só cancelar por engano no mesmo mês).

Regras do dono (09/11/2026): custo posto vira linha própria fora do custo das vendidas; não dá pontos; pode sem cliente
cadastrada (com nome e motivo); só admin; registro separado, ligado à venda.
"""
import json
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto  # noqa: F401  (fixture autouse)
from tests.test_short_codes import _user
from tests.test_troca import _cenario, _estoque, _vender

pytestmark = pytest.mark.asyncio
API = "/api/v1"
D = Decimal


async def _dar(client, h, itens, **extra):
    corpo = {"items": itens, "reason_type": "promotion", "recipient_name": "Influenciadora Maria"}
    corpo.update(extra)
    return await client.post(f"{API}/gifts/", headers=h, json=corpo)


async def _resultado(client, h):
    hoje = date.today()
    return (await client.get(f"{API}/expenses/resultado-mes", params={"year": hoje.year, "month": hoje.month}, headers=h)).json()


async def _auditoria(db, tenant_id, acao):
    from app.models.audit_log import AuditLog
    db.expire_all()
    rows = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.action == acao).order_by(AuditLog.id))).scalars().all()
    return [(r, json.loads(r.detail) if r.detail else {}) for r in rows]


async def test_brinde_baixa_o_estoque_e_vira_a_linha_de_brindes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    uid = test_user.id
    assert await _estoque(async_session, va.id) == 10
    r = await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}])
    assert r.status_code == 201, r.text
    g = r.json()
    assert g["status"] == "given" and g["total_cost"] == 40.0 and g["recipient"] == "Influenciadora Maria"
    assert g["gift_number"].startswith("BRINDE-") and g["list_value"] == 100.0
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 9

    res = await _resultado(test_client, h)
    assert float(res["gifts_total"]) == 40.0 and res["gifts_count"] == 1
    assert float(res["revenue"]) == 0 and float(res["cmv"]) == 0 and res["sales_count"] == 0     # brinde não é venda
    assert float(res["net_profit"]) == -40.0

    # livro do estoque: motivo "brinde", quem deu
    from app.models.entry_item_event import EntryItemEvent
    ev = (await async_session.execute(select(EntryItemEvent).where(EntryItemEvent.reason == "brinde"))).scalars().all()
    assert len(ev) == 1 and ev[0].delta == -1 and ev[0].user_id == uid
    # nada de pagamento, caixa ou venda
    from app.models.sale import Payment, Sale
    assert (await async_session.execute(select(Payment).where(Payment.sale_id.is_(None)))).scalars().all() == []
    # registro no histórico: quem, quanto, motivo, para quem
    (reg,) = await _auditoria(async_session, t_id, "GIFT_CREATED")
    assert reg[0].user_id == uid and reg[1]["custo"] == 40.0 and reg[1]["para"] == "Influenciadora Maria"
    assert reg[1]["motivo"] == "Divulgação / influenciadora" and reg[0].entity_id == g["id"]


async def test_venda_com_brinde_ligado_nao_mexe_na_venda_nem_nos_pontos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, _ = await _vender(test_client, h, p, va, 1, "100.00")
    from app.models.customer import Customer
    cli = Customer(full_name="Cliente Fiel", phone="34999990000", tenant_id=t_id, loyalty_points=7, total_spent=D("0"))
    async_session.add(cli)
    await async_session.commit()
    pontos, gasto, cid = cli.loyalty_points, cli.total_spent, cli.id
    r = await _dar(test_client, h, [{"variant_id": vb.id, "quantity": 1}], reason_type="with_sale", customer_id=cid,
                   recipient_name=None, related_sale_id=sale_id)
    assert r.status_code == 201, r.text
    assert r.json()["related_sale_id"] == sale_id and r.json()["customer_name"] == "Cliente Fiel"
    async_session.expire_all()
    cli2 = (await async_session.execute(select(Customer).where(Customer.id == cid))).scalar_one()
    assert cli2.loyalty_points == pontos and cli2.total_spent == gasto          # brinde não dá pontos nem soma "total gasto"
    res = await _resultado(test_client, h)
    assert float(res["revenue"]) == 100.0 and float(res["cmv"]) == 40.0 and res["sales_count"] == 1
    assert float(res["gifts_total"]) == 40.0
    assert float(res["net_profit"]) == 100 - 40 - 40                            # lucro = receita - custo vendidas - despesas - brindes


async def test_validacoes_recusam_sem_gravar_nada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ok = [{"variant_id": va.id, "quantity": 1}]
    casos = [
        ({"items": []}, "pelo menos uma peça"),
        ({"items": ok, "reason_type": "inventado"}, "motivo"),
        ({"items": ok, "reason_type": "other"}, "motivo"),
        ({"items": ok, "recipient_name": None}, "para quem"),
        ({"items": ok, "recipient_name": "ab"}, "para quem"),
        ({"items": [{"variant_id": va.id, "quantity": 0}]}, "quantidade"),
        ({"items": [{"variant_id": 99999999, "quantity": 1}]}, "não encontrada"),
        ({"items": ok, "customer_id": 99999999}, "Cliente"),
        ({"items": [{"variant_id": va.id, "quantity": 11}]}, "Sem estoque suficiente"),
    ]
    for extra, trecho in casos:
        r = await _dar(test_client, h, **{"itens": extra.pop("items")}, **extra)
        assert r.status_code == 400 and trecho.lower() in r.json()["detail"].lower(), (extra, r.status_code, r.text)
    lista = (await test_client.get(f"{API}/gifts/", headers=h)).json()
    assert lista["total_count"] == 0
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 10


async def test_so_administrador_mexe_em_brinde(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    gid = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}])).json()["id"]
    for papel in (UserRole.MANAGER, UserRole.SELLER, UserRole.CASHIER):
        hh = await _user(async_session, t_id, papel)
        assert (await _dar(test_client, hh, [{"variant_id": va.id, "quantity": 1}])).status_code == 403, papel
        assert (await test_client.get(f"{API}/gifts/", headers=hh)).status_code == 403, papel
        assert (await test_client.get(f"{API}/gifts/{gid}", headers=hh)).status_code == 403, papel
        assert (await test_client.post(f"{API}/gifts/{gid}/cancel", headers=hh, json={"reason": "engano"})).status_code == 403, papel
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 9               # só o brinde do admin


async def test_duas_camadas_de_custo_somam_e_guardam_as_fontes(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "Faixa", "10.00")
    await _lote(async_session, t_id, [(v, p, 1, "20.00")])
    await _lote(async_session, t_id, [(v, p, 5, "30.00")])
    await async_session.commit()
    r = await _dar(test_client, h, [{"variant_id": v.id, "quantity": 2}], reason_type="courtesy")
    assert r.status_code == 201, r.text
    assert r.json()["total_cost"] == 50.0                                   # 1 a R$ 20 + 1 a R$ 30, a mais antiga primeiro
    from app.models.gift import GiftItem
    (it,) = (await async_session.execute(select(GiftItem).where(GiftItem.gift_id == r.json()["id"]))).scalars().all()
    fontes = it.sale_sources["sources"]
    assert [(s["quantity_taken"], s["unit_cost"]) for s in fontes] == [(1, 20.0), (1, 30.0)]


async def test_cancelar_devolve_a_peca_e_tira_o_brinde_do_mes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    uid = test_user.id
    g = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 3}])).json()
    assert g["total_cost"] == 120.0
    for ruim, trecho in (({}, "motivo"), ({"reason": "ab"}, "motivo")):
        r = await test_client.post(f"{API}/gifts/{g['id']}/cancel", headers=h, json=ruim)
        assert r.status_code == 400 and trecho in r.json()["detail"].lower()
    r = await test_client.post(f"{API}/gifts/{g['id']}/cancel", headers=h, json={"reason": "Peça errada"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["net_cost"] == 0
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 10
    res = await _resultado(test_client, h)
    assert float(res["gifts_total"]) == 0 and res["gifts_count"] == 0 and float(res["net_profit"]) == 0
    assert (await test_client.post(f"{API}/gifts/{g['id']}/cancel", headers=h, json={"reason": "Peça errada"})).status_code == 409
    # não existe devolução de brinde: a rota nem existe
    assert (await test_client.post(f"{API}/gifts/{g['id']}/return", headers=h, json={"items": [{"gift_item_id": 1, "quantity": 1}]})).status_code in (404, 405)
    (reg,) = await _auditoria(async_session, t_id, "GIFT_CANCELLED")
    assert reg[1]["motivo"] == "Peça errada" and reg[0].user_id == uid


async def test_lote_fecha_a_conta_com_brinde_e_saude_do_estoque_nao_chama_de_perda(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _dar(test_client, h, [{"variant_id": va.id, "quantity": 2}])
    entry_id = (await async_session.execute(select(EntryItem.entry_id).where(EntryItem.variant_id == va.id))).scalars().first()
    tr = (await test_client.get(f"{API}/stock-entries/{entry_id}/tracking", headers=h)).json()
    t = tr["totals"]
    assert t["gifted"] == 2 and t["removed"] == 0 and t["sold"] == 0 and t["closed"] is True, t
    saude = (await test_client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()["sell_through"]
    assert saude["gifts"] == 2 and saude["other_out"] == 0 and saude["total_sold"] == 0, saude


async def test_listar_traz_custo_total_e_filtra_por_periodo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}])
    await _dar(test_client, h, [{"variant_id": vb.id, "quantity": 2}], reason_type="other", reason_note="Amiga da dona")
    lista = (await test_client.get(f"{API}/gifts/", headers=h)).json()
    assert lista["total_count"] == 2 and lista["page_cost"] == 120.0 and lista["page_pieces"] == 3
    amanha = (date.today().replace(day=1)).isoformat()
    f = (await test_client.get(f"{API}/gifts/", headers=h, params={"start_date": amanha, "end_date": date.today().isoformat()})).json()
    assert f["total_count"] == 2
    f = (await test_client.get(f"{API}/gifts/", headers=h, params={"start_date": "2000-01-01", "end_date": "2000-01-31"})).json()
    assert f["total_count"] == 0



# ───────────── comprovante para a pessoa validar (PDF e WhatsApp oficial da loja) ─────────────
async def test_comprovante_do_brinde_texto_pdf_sem_custo_nem_codigo_interno(test_client, async_session, test_user):
    from tests.test_comprovante_venda import _largura_mm, _texto_pdf
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    g = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 2}], reason_type="courtesy")).json()
    info = (await test_client.get(f"{API}/gifts/{g['id']}/receipt", headers=h)).json()
    t = info["text"]
    assert "BRINDE, SEM VALOR" in t and "Sem valor fiscal" in t and g["gift_number"] in t and "Influenciadora Maria" in t
    assert "2x" in t and "Valor de vitrine: R$ 200,00" in t and "Cortesia da loja" in t
    assert "80,00" not in t and "custo" not in t.lower()                       # nunca o custo (R$ 40 por peça)
    assert info["whatsapp_url"] is None and info["store_whatsapp"]["connected"] is False   # sem telefone nem número ligado
    for tam, largura in (("58", 58), ("80", 80), ("a6", 105)):
        r = await test_client.get(f"{API}/gifts/{g['id']}/receipt/pdf", headers=h, params={"size": tam})
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
        assert abs(_largura_mm(r.content) - largura) < 1
    pdf = _texto_pdf((await test_client.get(f"{API}/gifts/{g['id']}/receipt/pdf", headers=h)).content)
    assert "BRINDE, SEM VALOR" in pdf and "SEM COBRAN" in pdf and "200,00" in pdf
    assert "40,00" not in pdf and "80,00" not in pdf
    assert (await test_client.get(f"{API}/gifts/{g['id']}/receipt/pdf", headers=h, params={"size": "999"})).status_code == 422
    assert (await test_client.get(f"{API}/gifts/99999999/receipt", headers=h)).status_code == 404


async def test_comprovante_de_brinde_cancelado_sai_marcado_e_so_admin_baixa(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    g = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}])).json()
    await test_client.post(f"{API}/gifts/{g['id']}/cancel", headers=h, json={"reason": "Peça errada"})
    assert "BRINDE CANCELADO" in (await test_client.get(f"{API}/gifts/{g['id']}/receipt", headers=h)).json()["text"]
    for papel in (UserRole.MANAGER, UserRole.SELLER, UserRole.CASHIER):
        hh = await _user(async_session, t_id, papel)
        assert (await test_client.get(f"{API}/gifts/{g['id']}/receipt", headers=hh)).status_code == 403, papel
        assert (await test_client.get(f"{API}/gifts/{g['id']}/receipt/pdf", headers=hh)).status_code == 403, papel
        assert (await test_client.post(f"{API}/gifts/{g['id']}/receipt/send-whatsapp", headers=hh)).status_code == 403, papel


async def test_envio_do_comprovante_pelo_whatsapp_oficial_e_recusas(test_client, async_session, test_user, monkeypatch):
    from tests.test_comprovante_venda import _Meta, _meta, _zap
    chamadas = _meta(monkeypatch)
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    uid = test_user.id
    # sem cliente cadastrada: explica e não manda nada
    sem = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}])).json()
    r = await test_client.post(f"{API}/gifts/{sem['id']}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 409 and "cliente cadastrada" in r.json()["detail"] and not chamadas
    # cliente com janela aberta: sai o PDF pelo número da LOJA
    c = await _zap(async_session, t_id)
    cid = c.id
    g = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}], customer_id=cid, recipient_name=None)).json()
    info = (await test_client.get(f"{API}/gifts/{g['id']}/receipt", headers=h)).json()
    assert info["store_whatsapp"] == {"connected": True, "number": "(34) 3305-0261"} and info["whatsapp_url"].startswith("https://wa.me/5534996500091")
    r = await test_client.post(f"{API}/gifts/{g['id']}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 200 and r.json() == {"mode": "pdf", "store_number": "(34) 3305-0261", "customer": "Maria da Silva"}, r.text
    assert len(chamadas) == 1 and chamadas[0][0] == "pn-comprovante"
    corpo = chamadas[0][1]
    assert corpo["type"] == "document" and corpo["to"] == "5534996500091" and corpo["document"]["filename"].startswith("brinde-")
    assert g["gift_number"] in corpo["document"]["caption"]
    assert _Meta.subidos and _Meta.subidos[0][1]["file"][1].startswith(b"%PDF")
    # registrado: quem mandou, para quem, por qual canal
    (reg,) = await _auditoria(async_session, t_id, "GIFT_RECEIPT_SENT")
    assert reg[0].user_id == uid and reg[1]["para"] == "Maria da Silva" and reg[1]["canal"] == "whatsapp_oficial"
    assert await _auditoria(async_session, t_id, "ROTA_POST_GIFTS_RECEIPT_SEND_WHATSAPP") == []


async def test_envio_fora_da_janela_de_24h_explica_e_nao_manda(test_client, async_session, test_user, monkeypatch):
    from tests.test_comprovante_venda import _meta, _zap
    chamadas = _meta(monkeypatch)
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _zap(async_session, t_id, janela_aberta=False)
    g = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}], customer_id=c.id, recipient_name=None)).json()
    r = await test_client.post(f"{API}/gifts/{g['id']}/receipt/send-whatsapp", headers=h)
    assert r.status_code == 409 and "24 horas" in r.json()["detail"] and not chamadas


# ───────────── quem não é admin não vê o brinde em lugar nenhum ─────────────
async def test_gerente_nao_ve_brinde_o_valor_entra_nos_gastos_e_a_conta_fecha(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    from app.models.user import UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _dar(test_client, h, [{"variant_id": va.id, "quantity": 1}])                          # custo R$ 40
    hoje = date.today()
    hg = await _user(async_session, t_id, UserRole.MANAGER)
    adm = await _resultado(test_client, h)
    ger = (await test_client.get(f"{API}/expenses/resultado-mes", params={"year": hoje.year, "month": hoje.month}, headers=hg)).json()
    assert float(adm["gifts_total"]) == 40.0 and float(adm["total_expenses"]) == 0.0           # admin: linha própria
    assert float(ger["gifts_total"]) == 0.0 and ger["gifts_count"] == 0 and float(ger["total_expenses"]) == 40.0
    assert float(ger["net_profit"]) == float(adm["net_profit"]) == -40.0                       # o lucro é o mesmo para os dois
    por_dias = (await test_client.get(f"{API}/expenses/resultado-periodo", params={"days": 30}, headers=hg))
    if por_dias.status_code == 200:
        assert float(por_dias.json()["gifts_total"]) == 0.0
    # rastreio do lote e Saúde do Estoque: a peça dada aparece como "saiu sem venda" e a conta continua fechando
    entry_id = (await async_session.execute(select(EntryItem.entry_id).where(EntryItem.variant_id == va.id))).scalars().first()
    t = (await test_client.get(f"{API}/stock-entries/{entry_id}/tracking", headers=hg)).json()["totals"]
    assert t["gifted"] == 0 and t["removed"] == 1 and t["closed"] is True, t
    ta = (await test_client.get(f"{API}/stock-entries/{entry_id}/tracking", headers=h)).json()["totals"]
    assert ta["gifted"] == 1 and ta["removed"] == 0 and ta["closed"] is True, ta
    sg = (await test_client.get(f"{API}/dashboard/fifo-performance", headers=hg)).json()["sell_through"]
    assert sg["gifts"] == 0 and sg["other_out"] == 1, sg
    # relatório mensal (gerente): sem linha de brinde, despesas incluem o custo
    rm = await test_client.get(f"{API}/reports/monthly", headers=hg)
    if rm.status_code == 200:
        cur = rm.json()["result"]["current"]
        assert cur["gifts"] == 0 and cur["expenses"] == 40.0, cur


async def test_voucher_resgatado_exige_o_numero_e_sai_no_comprovante(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    itens = [{"variant_id": va.id, "quantity": 1}]
    r = await _dar(test_client, h, itens, reason_type="voucher")
    assert r.status_code == 400 and "voucher" in r.json()["detail"].lower()
    r = await _dar(test_client, h, itens, reason_type="voucher", reason_note="ab")
    assert r.status_code == 400
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 10                          # nada gravado
    r = await _dar(test_client, h, itens, reason_type="voucher", reason_note="Voucher 0123", recipient_name="Maria Cliente")
    assert r.status_code == 201, r.text
    g = r.json()
    assert g["reason_label"] == "Voucher resgatado" and g["reason_note"] == "Voucher 0123" and g["related_sale_id"] is None   # sem venda nenhuma
    txt = (await test_client.get(f"{API}/gifts/{g['id']}/receipt", headers=h)).json()["text"]
    assert "Resgate de voucher" in txt and "Voucher 0123" not in txt             # o número é interno, não vai para a pessoa
    res = await _resultado(test_client, h)
    assert float(res["gifts_total"]) == 40.0 and res["sales_count"] == 0
