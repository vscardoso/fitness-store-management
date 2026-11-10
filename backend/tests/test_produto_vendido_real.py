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
