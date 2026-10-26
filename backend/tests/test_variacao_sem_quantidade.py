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


async def _entrada_com_dois(test_client, h, cat, n, prefix):
    r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
        "entry_code": f"X-{n:04d}", "entry_date": date.today().isoformat(), "entry_type": "local",
        "supplier_name": "Fornecedor Teste", "product_name": f"Blusa {n}", "product_category_id": cat,
        "base_price": 30, "variants": [_v(prefix, "PRE", 2), _v(prefix, "LIL", 3)]})
    assert r.status_code in (200, 201), r.text
    g = await test_client.get(f"/api/v1/stock-entries/{r.json()['id']}", headers=h)
    assert g.status_code == 200, g.text
    return r.json()["id"], {i["variant_label"] if i.get("variant_label") else i["id"]: i for i in g.json()["entry_items"]}, g.json()["entry_items"]


async def test_excluir_produto_da_entrada_sem_venda(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    from app.models.entry_item import EntryItem
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    prefix = f"DEL{n}"
    entry_id, _, itens = await _entrada_com_dois(test_client, h, cat, n, prefix)
    assert len(itens) == 2
    alvo = next(i for i in itens if i["quantity_received"] == 3)
    r = await test_client.delete(f"/api/v1/stock-entries/entry-items/{alvo['id']}", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["variant_removed"] is True and r.json()["product_removed"] is False

    g = await test_client.get(f"/api/v1/stock-entries/{entry_id}", headers=h)
    restantes = g.json()["entry_items"]
    assert [i["id"] for i in restantes] == [i["id"] for i in itens if i["id"] != alvo["id"]]
    async_session.expire_all()
    ativas = (await async_session.execute(
        select(ProductVariant).where(ProductVariant.sku.like(f"{prefix}-%"), ProductVariant.is_active == True))).scalars().all()
    assert len(ativas) == 1                                    # a variação da peça excluída não ficou zerada por aí
    # estoque derivado: só as 2 peças que sobraram
    p = await test_client.get(f"/api/v1/inventory/product/{ativas[0].product_id}", headers=h)
    assert p.status_code == 200 and p.json()["quantity"] == 2, p.text


async def test_nao_exclui_o_ultimo_produto_nem_o_que_ja_vendeu(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    entry_id, _, itens = await _entrada_com_dois(test_client, h, cat, n, f"DEL{n}")
    vendido, outro = itens[0], itens[1]
    it = (await async_session.execute(select(EntryItem).where(EntryItem.id == vendido["id"]))).scalar_one()
    it.quantity_remaining = it.quantity_received - 1           # simula 1 peça vendida
    await async_session.commit()

    r = await test_client.delete(f"/api/v1/stock-entries/entry-items/{vendido['id']}", headers=h)
    assert r.status_code == 400 and "vendida" in r.json()["detail"]
    ok = await test_client.delete(f"/api/v1/stock-entries/entry-items/{outro['id']}", headers=h)
    assert ok.status_code == 200, ok.text
    ultimo = await test_client.delete(f"/api/v1/stock-entries/entry-items/{vendido['id']}", headers=h)
    assert ultimo.status_code == 400                           # vendido continua protegido
    g = await test_client.get(f"/api/v1/stock-entries/{entry_id}", headers=h)
    assert len(g.json()["entry_items"]) == 1
