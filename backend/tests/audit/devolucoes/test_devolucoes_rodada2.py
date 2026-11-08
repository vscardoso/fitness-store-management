"""Rodada 2: validação dos consertos (item repetido, desconto no item, centavo, quantity_defective)."""
from datetime import date, timedelta
from decimal import Decimal as D

import pytest
from sqlalchemy import select

from app.services.money_ledger import period_totals
from tests.test_lot_costs import _limpa_loja_1, _lote, _produto  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _estoque, _vender

pytestmark = pytest.mark.asyncio
API = "/api/v1"


@pytest.fixture(autouse=True)
async def _loja_padrao(async_session):
    yield
    await async_session.rollback()
    from sqlalchemy import update
    from app.models.store import Store
    await async_session.execute(update(Store).where(Store.id == 1).values(allow_money_refund=True, return_window_days=7))
    await async_session.commit()


async def _dev(client, h, sale_id, itens, **extra):
    return await client.post(f"{API}/returns/{sale_id}", headers=h, json={"reason": "Auditoria rodada 2", "items": itens, **extra})


async def _mes(db, t_id):
    db.expire_all()
    hoje = date.today()
    return await period_totals(db, t_id, hoje.replace(day=1), hoje)


async def _base(db, t_id):
    t = await _mes(db, t_id)
    return t.revenue, t.cost, t.profit


async def _fontes(db, sale_item_id):
    from app.models.sale import SaleItem
    db.expire_all()
    it = (await db.execute(select(SaleItem).where(SaleItem.id == sale_item_id))).scalar_one()
    return it.sale_sources["sources"]


async def _status(db, sale_id):
    from app.models.sale import Sale
    db.expire_all()
    s = (await db.execute(select(Sale).where(Sale.id == sale_id))).scalar_one()
    return str(getattr(s.status, "value", s.status)).lower().split(".")[-1]


async def _cat(db, product_id):
    from app.models.product import Product
    return (await db.execute(select(Product.category_id).where(Product.id == product_id))).scalar_one()


async def _venda(client, h, itens, desc_venda="0", pago="0"):
    r = await client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "discount_amount": str(desc_venda),
        "items": [{"product_id": p.id, "variant_id": v.id, "quantity": q, "unit_price": str(pr), "discount_amount": str(di)}
                  for p, v, q, pr, di in itens],
        "payments": [{"amount": str(pago), "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    return r.json()


async def test_centavo_e_desconto_no_item_e_na_venda_juntos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r0, c0, _ = await _base(async_session, t_id)
    s = await _venda(test_client, h, [(p, va, 3, "100.00", "0")], "10.00", "290.00")
    soma = []
    for _ in range(3):
        d = await _dev(test_client, h, s["id"], [{"sale_item_id": s["items"][0]["id"], "quantity": 1}])
        assert d.status_code == 201, d.text
        soma.append(D(str(d.json()["total_refund"])))
    assert soma == [D("96.67"), D("96.67"), D("96.66")] and sum(soma) == D("290.00")
    # desconto no item (30) e na venda (15): 200 - 30 = 170 ; - 15 = 155
    s = await _venda(test_client, h, [(p, va, 2, "100.00", "30.00")], "15.00", "155.00")
    assert D(str(s["total_amount"])) == D("155.00")
    item = s["items"][0]["id"]
    d1 = await _dev(test_client, h, s["id"], [{"sale_item_id": item, "quantity": 1}])
    d2 = await _dev(test_client, h, s["id"], [{"sale_item_id": item, "quantity": 1}])
    assert d1.status_code == d2.status_code == 201, (d1.text, d2.text)
    assert D(str(d1.json()["total_refund"])) + D(str(d2.json()["total_refund"])) == D("155.00")
    t = await _mes(async_session, t_id)
    assert t.revenue - r0 == D("0")


async def test_tres_parciais_seguidas_e_depois_total(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    s = await _venda(test_client, h, [(p, va, 7, "33.33", "0")], "5.00", "228.31")
    assert D(str(s["total_amount"])) == D("228.31")
    item = s["items"][0]["id"]
    refunds = []
    for q in (1, 2, 1):
        d = await _dev(test_client, h, s["id"], [{"sale_item_id": item, "quantity": q}])
        assert d.status_code == 201, d.text
        refunds.append(D(str(d.json()["total_refund"])))
        e = (await test_client.get(f"{API}/returns/eligibility/{s['id']}", headers=h)).json()
        assert D(str(e["items"][0]["max_refund_amount"])) == D("228.31") - sum(refunds)
    d = await _dev(test_client, h, s["id"], [{"sale_item_id": item, "quantity": 3}])
    assert d.status_code == 201
    refunds.append(D(str(d.json()["total_refund"])))
    assert sum(refunds) == D("228.31")
    assert await _status(async_session, s["id"]) == "refunded"


async def test_defeito_depois_restock_na_mesma_venda_e_fontes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r0, c0, pr0 = await _base(async_session, t_id)
    e0 = await _estoque(async_session, va.id)
    sale_id, item_id = await _vender(test_client, h, p, va, 4, "100.00")
    for restock in (False, True, False):
        assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1, "restock": restock}])).status_code == 201
    assert await _estoque(async_session, va.id) == e0 - 4 + 1
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert d.status_code == 201, d.text
    assert await _status(async_session, sale_id) == "refunded"
    assert await _estoque(async_session, va.id) == e0 - 4 + 2
    f = await _fontes(async_session, item_id)
    assert sum(s.get("quantity_returned", 0) for s in f) == 2
    assert sum(s.get("quantity_defective", 0) for s in f) == 2
    assert all(s.get("quantity_returned", 0) + s.get("quantity_defective", 0) <= s["quantity_taken"] for s in f)
    t = await _mes(async_session, t_id)
    assert (t.revenue - r0, t.cost - c0, t.profit - pr0) == (D("0"), D("80"), D("-80"))
    r = await test_client.post(f"{API}/sales/{sale_id}/cancel", headers=h, params={"reason": "Tentativa depois"})
    assert r.status_code == 400
    assert await _estoque(async_session, va.id) == e0 - 4 + 2


async def test_defeito_em_dois_lotes_marca_camadas_e_restock_usa_a_que_sobrou(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cat_id = await _cat(async_session, p.id)
    p2, v2 = await _produto(async_session, t_id, cat_id, "Defeito2", "100.00")
    await _lote(async_session, t_id, [(v2, p2, 2, 40)])
    await _lote(async_session, t_id, [(v2, p2, 2, 60)])
    await async_session.commit()
    v2_id, p2_id = v2.id, p2.id
    c0 = (await _mes(async_session, t_id)).cost
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p2_id, "variant_id": v2_id, "quantity": 3, "unit_price": "100.00"}],
        "payments": [{"amount": "300.00", "payment_method": "cash"}]})
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    e0 = await _estoque(async_session, v2_id)
    assert (await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 2, "restock": False}])).status_code == 201
    assert await _estoque(async_session, v2_id) == e0
    f = await _fontes(async_session, item_id)
    assert [s.get("quantity_defective", 0) for s in f] == [1, 1]
    d = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert d.status_code == 201 and await _estoque(async_session, v2_id) == e0 + 1
    f = await _fontes(async_session, item_id)
    assert sum(s.get("quantity_returned", 0) for s in f) == 1
    # custo: vendeu 2x40 + 1x60 = 140; peça que voltou custou 40 (a camada que sobrou); 140 - 40 = 100 (defeitos ficam)
    t = await _mes(async_session, t_id)
    assert abs((t.cost - c0) - D("100")) <= D("0.02")   # custo médio do item é gravado com 2 casas (46,67 x 3 = 140,01)


async def test_troca_com_diferenca_e_desconto_na_venda(test_client, async_session, test_user):
    from app.models.sale import Payment
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="130.00")
    s = await _venda(test_client, h, [(p, va, 3, "100.00", "0")], "10.00", "290.00")
    item = s["items"][0]["id"]
    d = await _dev(test_client, h, s["id"], [{"sale_item_id": item, "quantity": 1, "replacement_variant_id": vb.id}], settlement_method="pix")
    assert d.status_code == 201, d.text
    j = d.json()
    assert D(str(j["total_refund"])) == D("96.67") and D(str(j["net_amount"])) == D("33.33")
    async_session.expire_all()
    pagos = (await async_session.execute(select(Payment).where(Payment.sale_id == j["exchange_sale_id"]))).scalars().all()
    assert len(pagos) == 1 and D(str(pagos[0].amount)) == D("33.33")
    d2 = await _dev(test_client, h, s["id"], [{"sale_item_id": item, "quantity": 2}])
    assert d2.status_code == 201 and D(str(d2.json()["total_refund"])) == D("193.33")


async def test_fiado_com_desconto_devolucao_abate_exatamente(test_client, async_session, test_user):
    from tests.test_fiado import _aberto, _cliente
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id, "Fiado Desc Audit")
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "customer_id": cid, "payment_method": "on_account", "discount_amount": "20.00",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 3, "unit_price": "100.00"}],
        "payments": [{"amount": "280.00", "payment_method": "on_account", "installments": 2,
                      "first_due_date": (date.today() + timedelta(days=7)).isoformat(), "interval_days": 7}]})
    assert r.status_code in (200, 201), r.text
    sale_id, item = r.json()["id"], r.json()["items"][0]["id"]
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 280.0
    soma = D("0")
    for _ in range(3):
        d = await _dev(test_client, h, sale_id, [{"sale_item_id": item, "quantity": 1}])
        assert d.status_code == 201, d.text
        soma += D(str(d.json()["total_refund"]))
    assert soma == D("280.00")
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 0.0


async def test_devolucao_antiga_gravada_com_estorno_arredondado_fecha_o_centavo(test_client, async_session, test_user):
    from app.models.sale_return import ReturnItem
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    s = await _venda(test_client, h, [(p, va, 3, "100.00", "0")], "10.00", "290.00")
    item = s["items"][0]["id"]
    for _ in range(2):
        assert (await _dev(test_client, h, s["id"], [{"sale_item_id": item, "quantity": 1}])).status_code == 201
    async_session.expire_all()
    for ri in (await async_session.execute(select(ReturnItem).where(ReturnItem.sale_item_id == item))).scalars().all():
        ri.refund_amount = 96.67
    await async_session.commit()
    d = await _dev(test_client, h, s["id"], [{"sale_item_id": item, "quantity": 1}])
    assert d.status_code == 201 and D(str(d.json()["total_refund"])) == D("96.66")


async def test_item_repetido_agora_recusado_com_frase_clara(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
    for restock in (True, False):
        r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 3, "restock": restock},
                                                 {"sale_item_id": item_id, "quantity": 3, "restock": restock}])
        assert r.status_code == 400 and "excede" in r.json()["detail"], r.text
    # 3 + 2 é válido e fecha a venda
    r = await _dev(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 3}, {"sale_item_id": item_id, "quantity": 2, "restock": False}])
    assert r.status_code == 201 and D(str(r.json()["total_refund"])) == D("500.00")
    assert await _status(async_session, sale_id) == "refunded"


async def test_max_refund_amount_numerico_para_o_app(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    s, i = await _vender(test_client, h, p, va, 2, "100.00")
    v = (await test_client.get(f"{API}/returns/eligibility/{s}", headers=h)).json()["items"][0]["max_refund_amount"]
    assert float(v) == 200.0
    # já era string antes do conserto (Decimal no schema; era "200.0", agora "200.00"); o app multiplica em JS e funciona
    assert isinstance(v, str) and D(v) == D("200")
