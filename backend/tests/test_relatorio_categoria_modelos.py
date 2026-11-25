"""Detalhe de uma categoria no relatório de vendas: quais modelos (cor e tamanho) saíram e quantas peças, líquidas do que voltou.
O total tem que bater com a linha da categoria em "Vendas por categoria" (mesmas regras, mesmo período)."""
import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio


async def _categoria_do_produto(db, product_id):
    from app.models.category import Category
    from app.models.product import Product
    p = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one()
    return (await db.execute(select(Category.name).where(Category.id == p.category_id))).scalar_one()


async def test_detalhe_da_categoria_bate_com_a_linha_do_relatorio(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="130.00")
    cat = await _categoria_do_produto(async_session, p.id)
    sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Outra cor", "settlement_method": "pix",
        "items": [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}]})
    assert r.status_code == 201, r.text

    det = await test_client.get("/api/v1/reports/sales/category", headers=h, params={"category": cat, "period": "today"})
    assert det.status_code == 200, det.text
    d = det.json()
    assert d["category"] == cat and d["models"] == 1
    por_var = {i["variant_id"]: i for i in d["items"]}
    assert por_var[va.id]["pieces"] == 4          # vendeu 5 e 1 voltou na troca
    assert por_var[vb.id]["pieces"] == 1          # a peça nova da troca
    assert d["pieces"] == 5 == sum(i["pieces"] for i in d["items"])

    rel = await test_client.get("/api/v1/reports/sales", headers=h, params={"period": "today"})
    assert rel.status_code == 200, rel.text
    linha = next(c for c in rel.json()["by_category"] if c["category"] == cat)
    assert linha["pieces"] == d["pieces"]
    assert abs(linha["revenue"] - d["revenue"]) < 0.01 and abs(linha["profit"] - d["profit"]) < 0.01


async def test_detalhe_categoria_inexistente_vem_vazio_e_nao_vaza_outra_loja(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _vender(test_client, h, p, va, 1, "100.00")
    r = await test_client.get("/api/v1/reports/sales/category", headers=h, params={"category": "Não existe", "period": "today"})
    assert r.status_code == 200 and r.json()["items"] == [] and r.json()["pieces"] == 0
    assert (await test_client.get("/api/v1/reports/sales/category", headers=h, params={"period": "today"})).status_code == 422
