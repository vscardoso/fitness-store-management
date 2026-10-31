"""Endpoints de vendas: criar, listar, buscar, cancelar e relatórios.

Contrato atual: venda exige `payments` (soma = total), payment_method em minúscula, status em minúscula,
produto precisa de categoria e o estoque entra por lote (EntryItem), cancelar exige `reason` e é só ADMIN.
Banco de teste é compartilhado: cada teste cria cliente/produto próprios e filtra pelo que criou.
"""
import itertools
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
D = Decimal
_n = itertools.count(1)
URL = "/api/v1/sales"


async def _cenario(db, test_user, *, estoque=100, preco="100.00", custo=50):
    """Produto com 1 variação e `estoque` peças a `custo`. Devolve (headers, product_id, variant_id)."""
    t_id, token, cat = await _loja_api(db, test_user)
    p, v = await _produto(db, t_id, cat, "Produto Venda", preco)
    if estoque:
        await _lote(db, t_id, [(v, p, estoque, custo)])
    pid, vid = p.id, v.id
    await db.commit()
    return {"Authorization": f"Bearer {token}"}, pid, vid


async def _cliente(client, h):
    r = await client.post("/api/v1/customers", headers=h, json={
        "full_name": "Cliente Teste Venda", "email": f"venda-{uuid.uuid4().hex[:10]}@test.com", "phone": "11999999999"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _corpo(pid, vid, qtd=2, preco="100.00", metodo="credit_card", customer_id=None):
    total = D(preco) * qtd
    corpo = {"payment_method": metodo,
             "items": [{"product_id": pid, "variant_id": vid, "quantity": qtd, "unit_price": str(preco)}],
             "payments": [{"amount": str(total), "payment_method": metodo}]}
    if customer_id:
        corpo["customer_id"] = customer_id
    return corpo


async def _vender(client, h, pid, vid, **kw):
    r = await client.post(URL + "/", headers=h, json=_corpo(pid, vid, **kw))
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_sale(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    data = await _vender(test_client, h, pid, vid, customer_id=cid)
    assert data["customer_id"] == cid
    assert float(data["total_amount"]) == 200.0
    assert data["status"] == "completed"
    assert len(data["items"]) == 1 and data["items"][0]["quantity"] == 2
    assert data["id"] and data["sale_number"].startswith("VENDA-")


async def test_create_sale_without_payments_is_refused(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    corpo = _corpo(pid, vid)
    corpo.pop("payments")
    r = await test_client.post(URL + "/", headers=h, json=corpo)
    assert r.status_code == 422


async def test_create_sale_with_payment_that_does_not_cover_total_is_refused(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    corpo = _corpo(pid, vid, qtd=2)
    corpo["payments"][0]["amount"] = "50.00"          # total é 200
    r = await test_client.post(URL + "/", headers=h, json=corpo)
    assert r.status_code == 400, r.text


async def test_create_sale_with_uppercase_payment_method_is_refused(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    r = await test_client.post(URL + "/", headers=h, json=_corpo(pid, vid, metodo="CREDIT_CARD"))
    assert r.status_code == 422


async def test_list_sales_contains_created_sale(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    venda = await _vender(test_client, h, pid, vid, customer_id=cid)
    r = await test_client.get(URL + "/", headers=h, params={"customer_id": cid})
    assert r.status_code == 200
    assert [s["id"] for s in r.json()] == [venda["id"]]
    r = await test_client.get(URL + "/", headers=h, params={"skip": 0, "limit": 100})
    assert r.status_code == 200 and isinstance(r.json(), list)


async def test_get_sale_by_id_and_by_number(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    venda = await _vender(test_client, h, pid, vid)
    r = await test_client.get(f"{URL}/{venda['id']}", headers=h)
    assert r.status_code == 200 and r.json()["id"] == venda["id"]
    r = await test_client.get(f"{URL}/number/{venda['sale_number']}", headers=h)
    assert r.status_code == 200 and r.json()["id"] == venda["id"]
    assert (await test_client.get(f"{URL}/99999999", headers=h)).status_code == 404


async def test_cancel_sale_restores_stock(test_client, async_session, test_user):
    from sqlalchemy import select
    from app.models.entry_item import EntryItem
    h, pid, vid = await _cenario(async_session, test_user, estoque=10)

    async def estoque():
        async_session.expire_all()
        rows = (await async_session.execute(select(EntryItem).where(EntryItem.variant_id == vid))).scalars().all()
        return sum(r.quantity_remaining for r in rows)

    venda = await _vender(test_client, h, pid, vid, qtd=3)
    assert await estoque() == 7
    r = await test_client.post(f"{URL}/{venda['id']}/cancel", headers=h, params={"reason": "Cliente desistiu"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"
    assert await estoque() == 10                       # as 3 peças voltaram


async def test_cancel_sale_requires_reason(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    venda = await _vender(test_client, h, pid, vid)
    r = await test_client.post(f"{URL}/{venda['id']}/cancel", headers=h)
    assert r.status_code == 422


async def test_daily_report_counts_todays_sale(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    antes = (await test_client.get(f"{URL}/reports/daily", headers=h)).json()
    await _vender(test_client, h, pid, vid, qtd=1)
    depois = (await test_client.get(f"{URL}/reports/daily", headers=h)).json()
    assert depois["sales_count"] == antes["sales_count"] + 1
    assert depois["total_sales"] == pytest.approx(antes["total_sales"] + 100.0)
    for k in ("date", "total_sales", "sales_count", "active_sales_count", "average_ticket", "status_breakdown"):
        assert k in depois


async def test_daily_report_active_count_ignores_cancelled(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    venda = await _vender(test_client, h, pid, vid, qtd=1)
    antes = (await test_client.get(f"{URL}/reports/daily", headers=h)).json()
    r = await test_client.post(f"{URL}/{venda['id']}/cancel", headers=h, params={"reason": "Teste"})
    assert r.status_code == 200
    depois = (await test_client.get(f"{URL}/reports/daily", headers=h)).json()
    assert depois["active_sales_count"] == antes["active_sales_count"] - 1


async def test_period_report(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    await _vender(test_client, h, pid, vid, qtd=1)
    hoje = date.today()
    r = await test_client.get(f"{URL}/reports/period", headers=h,
                              params={"start_date": hoje.isoformat(), "end_date": hoje.isoformat()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sales_count"] >= 1 and body["total_sales"] >= 100.0
    assert body["start_date"] == body["end_date"] == hoje.isoformat()


async def test_period_report_with_inverted_dates_is_refused(test_client, async_session, test_user):
    h, _, _ = await _cenario(async_session, test_user, estoque=0)
    hoje = date.today()
    r = await test_client.get(f"{URL}/reports/period", headers=h, params={
        "start_date": hoje.isoformat(), "end_date": (hoje - timedelta(days=1)).isoformat()})
    assert r.status_code == 400


async def test_list_sales_date_filter(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h)
    venda = await _vender(test_client, h, pid, vid, qtd=1, customer_id=cid)
    r = await test_client.get(f"{URL}/", headers=h, params={"start_date": "2000-01-01", "end_date": "2000-01-31"})
    assert r.status_code == 200 and venda["id"] not in {s["id"] for s in r.json()}
    hoje = date.today().isoformat()
    r = await test_client.get(f"{URL}/", headers=h, params={"start_date": hoje, "end_date": hoje, "limit": 100})
    assert r.status_code == 200 and venda["id"] in {s["id"] for s in r.json()}


async def test_create_sale_without_auth(test_client):
    r = await test_client.post(URL + "/", json={"payment_method": "cash", "items": [], "payments": []})
    assert r.status_code == 401


async def test_create_sale_with_invalid_product(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    corpo = {"payment_method": "cash", "items": [{"product_id": 99999999, "quantity": 1, "unit_price": "10.00"}],
             "payments": [{"amount": "10.00", "payment_method": "cash"}]}
    r = await test_client.post(URL + "/", headers=h, json=corpo)
    assert r.status_code in (400, 404)


async def test_create_sale_with_insufficient_stock(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user, estoque=5)
    r = await test_client.post(URL + "/", headers=h, json=_corpo(pid, vid, qtd=1000, preco="10.00", metodo="cash"))
    assert r.status_code == 400, r.text


async def test_top_products_report(test_client, async_session, test_user):
    h, pid, vid = await _cenario(async_session, test_user)
    await _vender(test_client, h, pid, vid, qtd=4)
    r = await test_client.get(f"{URL}/reports/top-products", headers=h, params={"period": "this_month", "limit": 50})
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, dict)
    linhas = next(v for v in body.values() if isinstance(v, list))
    achada = [x for x in linhas if x["product_id"] == pid]
    assert achada and achada[0]["ranking"] >= 1
