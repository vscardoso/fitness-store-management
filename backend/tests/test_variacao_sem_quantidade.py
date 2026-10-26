"""Variação com quantidade 0 nunca é criada (não existe variação zerada que nunca entrou no estoque)."""
import itertools
from datetime import date

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _loja_api, _limpa_loja_1, D  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
_n = itertools.count(1)


def _v(prefix, cor, qtd):
    return {"sku": f"{prefix}-{cor}-001", "color": cor, "size": "M", "price": 30, "cost_price": 10, "quantity": qtd}


async def test_produto_novo_com_entrada_nao_cria_variacao_com_zero(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    prefix = f"ZERO{n}"
    r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
        "entry_code": f"Z-{n:04d}", "entry_date": date.today().isoformat(), "entry_type": "local",
        "supplier_name": "Fornecedor Teste", "product_name": f"Regata {n}", "product_category_id": cat,
        "base_price": 30, "variants": [_v(prefix, "PRE", 2), _v(prefix, "LIL", 0)]})
    assert r.status_code in (200, 201), r.text
    cores = [c for (c,) in (await async_session.execute(
        select(ProductVariant.color).where(ProductVariant.sku.like(f"{prefix}-%")))).all()]
    assert cores == ["Pre"]                                   # a de quantidade 0 não foi criada


async def test_todas_com_zero_e_recusado_e_nada_e_gravado(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    prefix = f"ZERO{n}"
    r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
        "entry_code": f"Z-{n:04d}", "entry_date": date.today().isoformat(), "entry_type": "local",
        "supplier_name": "Fornecedor Teste", "product_name": f"Regata {n}", "product_category_id": cat,
        "base_price": 30, "variants": [_v(prefix, "LIL", 0)]})
    assert r.status_code >= 400, r.text
    achadas = (await async_session.execute(select(ProductVariant).where(ProductVariant.sku.like(f"{prefix}-%")))).scalars().all()
    assert achadas == []
