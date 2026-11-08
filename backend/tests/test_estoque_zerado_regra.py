"""Regra do Victor (08/11/2026): produto com estoque zerado não entra em contagem nenhuma. Só conta o que esgotou por VENDA
(vendeu e zerou), e só em "Sem estoque". Zerado que nunca vendeu (variação excluída, baixa, cadastro só de catálogo) serve
apenas para o catálogo: não é "sem estoque", não gera alerta."""
import pytest
from sqlalchemy import update

from app.services.stock_rules import counts_as_out_of_stock
from tests.test_lot_costs import _limpa_loja_1, _lote, _produto  # noqa: F401  (_limpa_loja_1 é fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1"


def test_regra_pura():
    assert counts_as_out_of_stock(0, True) is True
    assert counts_as_out_of_stock(0, False) is False      # zerado que nunca vendeu: só catálogo
    assert counts_as_out_of_stock(5, True) is False       # tem estoque: não é "sem estoque"


async def _vender_tudo(client, h, p, v, qtd):
    r = await client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": "100.00"}],
        "payments": [{"amount": str(100 * qtd), "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text


async def test_so_esgotado_por_venda_conta_como_sem_estoque(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)       # produto P: 10 de A e 10 de B
    from app.models.product import Product
    cat = (await async_session.get(Product, p.id)).category_id
    nunca, vn = await _produto(async_session, t_id, cat, "Zerado sem venda", "80.00")   # sem entrada: só catálogo
    await async_session.commit()

    antes = (await test_client.get(f"{API}/dashboard/stats", headers=h)).json()["stock"]
    await _vender_tudo(test_client, h, p, va, 10)
    await _vender_tudo(test_client, h, p, vb, 10)                       # P esgotou POR VENDA
    stock = (await test_client.get(f"{API}/dashboard/stats", headers=h)).json()["stock"]
    assert stock["out_of_stock_count"] == antes["out_of_stock_count"] + 1      # só o P; o "Zerado sem venda" não conta

    lista = (await test_client.get(f"{API}/products/grouped", headers=h, params={"limit": 500})).json()
    itens = lista if isinstance(lista, list) else lista["items"]
    por_id = {x["id"]: x for x in itens}
    assert por_id[p.id]["total_stock"] == 0 and por_id[p.id]["has_sales"] is True
    assert por_id[nunca.id]["total_stock"] == 0 and por_id[nunca.id]["has_sales"] is False


async def test_alerta_sem_estoque_so_para_produto_que_vendeu(test_client, async_session, test_user):
    """Produto que teve entrada, foi zerado SEM venda (variação excluída, baixa) não gera alerta de "acabou"."""
    from app.models.entry_item import EntryItem
    from app.models.inventory import Inventory
    from app.services.app_notification_service import AppNotificationService
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    from app.models.product import Product
    cat = (await async_session.get(Product, p.id)).category_id
    zerado, vz = await _produto(async_session, t_id, cat, "Zerado por baixa", "80.00")
    await _lote(async_session, t_id, [(vz, zerado, 3, 40)])
    async_session.add(Inventory(product_id=zerado.id, quantity=0, min_stock=0, tenant_id=t_id))
    await async_session.execute(update(EntryItem).where(EntryItem.product_id == zerado.id).values(quantity_remaining=0))
    await async_session.commit()
    await _vender_tudo(test_client, h, p, va, 10)
    await _vender_tudo(test_client, h, p, vb, 10)                       # P esgotou por venda

    estado = await AppNotificationService()._stock_state(async_session, t_id)
    assert p.id in estado and estado[p.id][0] == "out_of_stock"        # vendeu e zerou: avisa
    assert zerado.id not in estado                                      # zerado sem venda: não avisa


async def test_custo_do_produto_esgotado_vem_da_compra_mais_recente(test_client, async_session, test_user):
    """Detalhe do produto mostra o custo: média das peças em estoque; sem estoque, o custo da compra mais recente."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)           # custo da compra: R$ 40 por peça
    r = await test_client.post(f"{API}/products/fifo-costs", headers=h, json=[p.id])
    assert r.status_code == 200, r.text
    c = r.json()[str(p.id)]
    assert c["average_unit_cost"] == 40 and c["total_quantity"] == 20 and c["last_unit_cost"] == 40
    await _vender_tudo(test_client, h, p, va, 10)
    await _vender_tudo(test_client, h, p, vb, 10)                           # esgotou: não há peça em estoque
    c = (await test_client.post(f"{API}/products/fifo-costs", headers=h, json=[p.id])).json()[str(p.id)]
    assert c["total_quantity"] == 0 and c["last_unit_cost"] == 40
