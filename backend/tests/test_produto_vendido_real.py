"""Tela do produto: "vendido" é venda de verdade. Peça que saiu por baixa da conferência, variação excluída ou ajuste NÃO é venda.

Caso real (10/11/2026): a Marrom G foi baixada pela conferência (Erro estoque) e a variação excluída; o histórico de entradas do
produto mostrava "vendido 1" (recebido - restante) e a dona achou que era uma venda estornada. Nunca houve venda desse produto.
"""
import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1, _loja_api  # noqa: F401  (fixture autouse)
from tests.test_sku_e_registro_de_erros import _criar, _n

pytestmark = pytest.mark.asyncio


async def test_baixa_nao_aparece_como_vendido_no_historico_de_entradas(test_client, async_session, test_user):
    from datetime import date
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    r = await _criar(test_client, h, cat, f"Top Baixa {n}", f"TBX{n}", f"VBX-{n:04d}")
    assert r.status_code in (200, 201), r.text
    pid = (await async_session.execute(select(ProductVariant.product_id).where(ProductVariant.sku == f"TBX{n}-PRE-001"))).scalar_one()
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.product_id == pid).order_by(EntryItem.id))).scalars().all()
    assert len(itens) == 2 and itens[0].quantity_received == 2
    ids = [i.id for i in itens]

    # sem nada acontecido: nada vendido, nada removido
    d = (await test_client.get(f"/api/v1/products/{pid}", headers=h)).json()
    assert [e["quantity_sold"] for e in d["entry_items"]] == [0, 0] and [e["quantity_removed"] for e in d["entry_items"]] == [0, 0]

    # 1 peça sai sem venda (como a baixa da conferência / exclusão da variação): o saldo cai, mas NÃO é venda
    it = (await async_session.execute(select(EntryItem).where(EntryItem.id == ids[0]))).scalar_one()
    it.quantity_remaining = it.quantity_received - 1
    await async_session.commit()
    d = (await test_client.get(f"/api/v1/products/{pid}", headers=h)).json()
    por_item = {e["entry_item_id"]: e for e in d["entry_items"]}
    assert por_item[ids[0]]["quantity_sold"] == 0 and por_item[ids[0]]["quantity_removed"] == 1
    assert por_item[ids[0]]["quantity_remaining"] == por_item[ids[0]]["quantity_received"] - 1
    assert sum(e["quantity_sold"] for e in d["entry_items"]) == 0


async def test_historico_do_produto_traz_a_peca_e_o_fornecedor_de_cada_uma_e_troca_com_venda(test_client, async_session, test_user):
    """Cada peça de uma entrada tem a sua variação e o seu fornecedor; trocar SÓ o fornecedor vale até para peça que já vendeu."""
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    r = await _criar(test_client, h, cat, f"Top Forn {n}", f"TFO{n}", f"VFO-{n:04d}")
    assert r.status_code in (200, 201), r.text
    pid = (await async_session.execute(select(ProductVariant.product_id).where(ProductVariant.sku == f"TFO{n}-PRE-001"))).scalar_one()
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.product_id == pid).order_by(EntryItem.id))).scalars().all()
    ids = [i.id for i in itens]

    d = (await test_client.get(f"/api/v1/products/{pid}", headers=h)).json()
    linhas = {e["entry_item_id"]: e for e in d["entry_items"]}
    assert len(linhas) == 2
    for e in linhas.values():
        assert e["variant_id"] and e["variant_color"] and e["variant_size"] == "M" and e["variant_active"] is True
        assert e["item_supplier_name"] == "Fornecedor Teste" and e["item_supplier_id"]
        assert e["variant_code"] is None or e["variant_code"].startswith("#")

    # troca o fornecedor da 1ª peça
    ok = await test_client.put(f"/api/v1/stock-entries/entry-items/{ids[0]}", headers=h, json={"supplier_name": f"Outro Forn {n}"})
    assert ok.status_code == 200, ok.text
    d = (await test_client.get(f"/api/v1/products/{pid}", headers=h)).json()
    linhas = {e["entry_item_id"]: e for e in d["entry_items"]}
    assert linhas[ids[0]]["item_supplier_name"] == f"Outro Forn {n}" and linhas[ids[1]]["item_supplier_name"] == "Fornecedor Teste"

    # peça que já vendeu (saldo menor que o recebido): trocar o fornecedor vale; mexer em custo/quantidade continua bloqueado
    it = (await async_session.execute(select(EntryItem).where(EntryItem.id == ids[1]))).scalar_one()
    it.quantity_remaining = it.quantity_received - 1
    await async_session.commit()
    ok2 = await test_client.put(f"/api/v1/stock-entries/entry-items/{ids[1]}", headers=h, json={"supplier_name": f"Outro Forn {n}"})
    assert ok2.status_code == 200, ok2.text
    bloqueado = await test_client.put(f"/api/v1/stock-entries/entry-items/{ids[1]}", headers=h, json={"unit_cost": 99})
    assert bloqueado.status_code == 400
