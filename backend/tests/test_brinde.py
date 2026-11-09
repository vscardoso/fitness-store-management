"""Brinde: peça que sai do estoque sem cobrança. Só administrador. O custo vira a linha "Brindes" do Resultado do Mês.

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
        assert (await test_client.post(f"{API}/gifts/{gid}/return", headers=hh, json={"items": []})).status_code == 403, papel
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
    assert (await test_client.post(f"{API}/gifts/{g['id']}/return", headers=h, json={"items": [{"gift_item_id": 1, "quantity": 1}]})).status_code == 409
    (reg,) = await _auditoria(async_session, t_id, "GIFT_CANCELLED")
    assert reg[1]["motivo"] == "Peça errada" and reg[0].user_id == uid


async def test_devolver_parcial_volta_o_custo_no_dia_e_nao_passa_do_dado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    g = (await _dar(test_client, h, [{"variant_id": va.id, "quantity": 3}])).json()
    item = g["items"][0]["id"]
    for ruim, trecho in (({"items": []}, "quais peças"), ({"items": [{"gift_item_id": item, "quantity": 4}]}, "restam"),
                         ({"items": [{"gift_item_id": item, "quantity": 0}]}, "maior que zero"),
                         ({"items": [{"gift_item_id": 99999, "quantity": 1}]}, "não pertence")):
        r = await test_client.post(f"{API}/gifts/{g['id']}/return", headers=h, json=ruim)
        assert r.status_code == 400 and trecho in r.json()["detail"].lower(), (ruim, r.text)
    r = await test_client.post(f"{API}/gifts/{g['id']}/return", headers=h, json={"items": [{"gift_item_id": item, "quantity": 2}], "note": "voltou"})
    assert r.status_code == 200, r.text
    assert r.json()["net_cost"] == 40.0 and r.json()["cost_returned"] == 80.0
    assert r.json()["items"][0]["quantity_returned"] == 2
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 9                         # 10 - 3 + 2
    res = await _resultado(test_client, h)
    assert float(res["gifts_total"]) == 40.0                                  # 120 dado - 80 que voltou
    # o que sobrou (1 peça) ainda pode voltar; mais do que isso não
    assert (await test_client.post(f"{API}/gifts/{g['id']}/return", headers=h, json={"items": [{"gift_item_id": item, "quantity": 2}]})).status_code == 400
    assert (await test_client.post(f"{API}/gifts/{g['id']}/return", headers=h, json={"items": [{"gift_item_id": item, "quantity": 1}]})).status_code == 200
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 10
    assert float((await _resultado(test_client, h))["gifts_total"]) == 0.0
    # com peça já devolvida, o cancelamento por engano não vale mais
    r = await test_client.post(f"{API}/gifts/{g['id']}/cancel", headers=h, json={"reason": "engano"})
    assert r.status_code == 409 and "Devolver" in r.json()["detail"]
    assert len(await _auditoria(async_session, t_id, "GIFT_RETURNED")) == 2


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
