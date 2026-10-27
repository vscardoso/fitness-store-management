"""Item 2.2: caixa e vendedor não recebem custo, lucro nem margem nas respostas da API; admin e gerente recebem.

Antes só o menu do app escondia as telas: a API mandava cost_price, unit_cost, lucro e margem para qualquer papel.
"""
import pytest
from sqlalchemy import select

from app.core.cost_mask import is_cost_key, mask
from tests.test_condicional import (  # noqa: F401  (fixtures autouse)
    _cenario, _criar, _devolver, _enviar, _item, _limpa_loja_1, _limpa_vendas_e_envios, _upd, URL,
)
from tests.test_short_codes import _user

pytestmark = pytest.mark.asyncio


def test_quais_chaves_sao_custo():
    for k in ("cost_price", "unit_cost", "total_cost", "landed_unit_cost", "profit", "total_profit", "margin_percent",
              "gross_margin_pct", "roi", "cmv", "markup_percentage", "total_investment", "average_unit_cost", "lucro"):
        assert is_cost_key(k), k
    for k in ("unit_price", "price", "total_amount", "customer", "costume", "installments_cost", "discount_amount",
              "quantity", "sale_number", "margin_top_x"[:0] or "subtotal"):
        assert not is_cost_key(k), k
    assert mask({"a": 1, "items": [{"unit_cost": 40, "unit_price": 100, "sale_sources": {"sources": [{"unit_cost": 40}]}}]}) == \
        {"a": 1, "items": [{"unit_cost": None, "unit_price": 100, "sale_sources": {"sources": [{"unit_cost": None}]}}]}


async def _venda(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user, custo=40, preco="100.00")
    r = await test_client.post("/api/v1/customers/", headers=h, json={"full_name": "Cliente Custo", "phone": "34988887777"})
    cid = r.json()["id"]
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    await _enviar(test_client, h, s["id"])
    r = await _devolver(test_client, h, s["id"], [_upd(s["items"][0], kept=1, ret=1)], payment_method="pix")
    assert r.status_code == 200, r.text
    from app.models.sale import Sale
    sale_id = (await async_session.execute(select(Sale.id).where(Sale.notes.like(f"%Condicional #{s['id']}%")))).scalar_one()
    return ids, h, s["id"], sale_id


async def test_vendedor_e_caixa_nao_veem_custo(test_client, async_session, test_user):
    from app.models.user import UserRole
    ids, admin, sid, sale_id = await _venda(test_client, async_session, test_user)
    vendedor = await _user(async_session, ids.t, UserRole.SELLER)
    caixa = await _user(async_session, ids.t, UserRole.CASHIER)
    gerente = await _user(async_session, ids.t, UserRole.MANAGER)

    # condicional: o item traz o custo real da peça (40) e o preço (100)
    for h, ve in ((admin, True), (gerente, True), (vendedor, False)):
        item = (await test_client.get(f"{URL}/{sid}", headers=h)).json()["items"][0]
        assert float(item["unit_price"]) == 100.0
        assert (item["unit_cost"] is not None) == ve, (h, item["unit_cost"])
        if ve:
            assert float(item["unit_cost"]) == 40.0

    # venda: custo e lucro dos itens
    for h, ve in ((admin, True), (vendedor, False), (caixa, False)):
        r = await test_client.get(f"/api/v1/sales/{sale_id}", headers=h)
        assert r.status_code == 200, r.text
        venda = r.json()
        assert float(venda["total_amount"]) == 100.0, "o valor da venda continua visível"
        texto = r.text
        if ve:
            assert '"unit_cost":40' in texto.replace(" ", "") or '"unit_cost":40.0' in texto.replace(" ", ""), texto[:400]
        else:
            for item in venda.get("items", []):
                for k, v in item.items():
                    if is_cost_key(k):
                        assert v is None, (k, v)
            for k, v in venda.items():
                if is_cost_key(k):
                    assert v is None, (k, v)

    # produto e variações
    for path in (f"/api/v1/products/{ids.p}", f"/api/v1/product-variants/product/{ids.p}"):
        r = await test_client.get(path, headers=vendedor)
        assert r.status_code == 200, (path, r.text[:200])
        assert all(v is None for k, v in _walk(r.json()) if is_cost_key(k)), path


def _walk(obj, key=None):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k, v
            yield from _walk(v, k)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk(v, key)
