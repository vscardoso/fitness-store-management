"""Card "Saúde do Estoque" do início: giro, lucro médio e itens parados calculados só com VENDAS REAIS.

Antes, qualquer peça que saía do estoque (baixa, perda, ajuste, exclusão) virava "vendida", o lucro médio usava o preço de
tabela de hoje e valia lucro/custo (markup) com o texto de margem, e "itens parados" era o estoque inteiro. Caso real: 3 peças
vendidas apareciam como "47 de 389 itens vendidos" e "+143%"."""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from app.core.dashboard_cache import invalidate_dashboard_cache
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _config

pytestmark = pytest.mark.asyncio
API = "/api/v1"


async def _vender(client, h, p, v, qtd, preco):
    r = await client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": str(preco)}],
        "payments": [{"amount": str(float(preco) * qtd), "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"], r.json()["items"][0]["id"]


async def _saude(client, h, t_id):
    invalidate_dashboard_cache(t_id)
    return (await client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()


async def test_saude_do_estoque_usa_so_vendas_reais(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    from app.models.sale import Sale
    from app.models.stock_entry import StockEntry
    t_id, h, p, va, vb = await _cenario(async_session, test_user)      # A: 10 e B: 10 peças, custo 40, preço 100
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)

    f = await _saude(test_client, h, t_id)
    assert f["sell_through"]["total_received"] == 20 and f["sell_through"]["total_sold"] == 0
    assert f["sell_through"]["rate"] == 0 and f["roi"]["avg_margin"] == 0 and f["stagnant"]["units"] == 0

    # 3 peças vendidas a R$ 100 (custo 40): giro 15%, margem REAL de 60% (lucro / valor vendido), não markup de 150%
    sale_a, item_a = await _vender(test_client, h, p, va, 3, "100.00")
    f = await _saude(test_client, h, t_id)
    st = f["sell_through"]
    assert (st["total_sold"], st["total_remaining"], st["other_out"], st["rate"]) == (3, 17, 0, 15.0)
    assert f["roi"]["avg_margin"] == 60.0 and f["roi"]["avg_roi"] == 60.0 and f["roi"]["negative_count"] == 0

    # 4 peças saem por baixa/perda/ajuste (sem venda): NÃO são vendidas, aparecem como "outras saídas"
    itens_b = (await async_session.execute(select(EntryItem).where(EntryItem.variant_id == vb.id))).scalars().all()
    itens_b[0].quantity_remaining -= 4
    await async_session.commit()
    f = await _saude(test_client, h, t_id)
    st = f["sell_through"]
    assert (st["total_sold"], st["total_remaining"], st["other_out"], st["rate"]) == (3, 13, 4, 15.0)

    # devolve 1 peça (volta ao estoque): vendidas líquidas = 2
    r = await test_client.post(f"{API}/returns/{sale_a}", headers=h, json={
        "reason": "não serviu", "items": [{"sale_item_id": item_a, "quantity": 1}]})
    assert r.status_code == 201, r.text
    f = await _saude(test_client, h, t_id)
    st = f["sell_through"]
    assert (st["total_sold"], st["other_out"], st["rate"]) == (2, 4, 10.0)
    assert f["roi"]["avg_margin"] == 60.0                              # 200 vendido, 80 de custo

    # mais 2 peças de B a R$ 100: a margem do card é a MESMA margem do painel (uma conta só)
    sale_b, _ = await _vender(test_client, h, p, vb, 2, "100.00")
    f = await _saude(test_client, h, t_id)
    assert f["roi"]["avg_margin"] == 60.0 and f["roi"]["negative_count"] == 0
    invalidate_dashboard_cache(t_id)
    painel = (await test_client.get(f"{API}/dashboard/stats", headers=h)).json()["sales"]["realized_margin_percent"]
    assert abs(f["roi"]["avg_margin"] - painel) < 0.15, (f["roi"], painel)

    # peças paradas: estoque com mais de 30 dias e sem venda nos últimos 30 dias
    await async_session.execute(update(StockEntry).where(StockEntry.tenant_id == t_id).values(entry_date=date.today() - timedelta(days=40)))
    await async_session.commit()
    f = await _saude(test_client, h, t_id)
    assert f["stagnant"]["units"] == 0                                 # A e B venderam agora: nada parado
    venda_b = (await async_session.execute(select(Sale).where(Sale.id == sale_b))).scalar_one()
    venda_b.created_at = datetime.now(timezone.utc) - timedelta(days=35)
    await async_session.commit()
    f = await _saude(test_client, h, t_id)
    restante_b = sum(i.quantity_remaining for i in (await async_session.execute(
        select(EntryItem).where(EntryItem.variant_id == vb.id))).scalars().all())
    assert f["stagnant"] == {"units": restante_b, "variants": 1, "days": 30} and restante_b > 0   # só o B está parado


async def test_saude_de_loja_sem_vendas_nao_inventa_numeros(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    from app.models.entry_item import EntryItem
    for i in (await async_session.execute(select(EntryItem).where(EntryItem.variant_id == va.id))).scalars().all():
        i.quantity_remaining = 0            # peças saíram sem venda nenhuma (baixa/ajuste)
    await async_session.commit()
    f = await _saude(test_client, h, t_id)
    assert f["sell_through"]["total_sold"] == 0 and f["sell_through"]["rate"] == 0
    assert f["sell_through"]["other_out"] == 10
    assert f["roi"]["avg_margin"] == 0 and f["roi"]["negative_count"] == 0


async def test_lote_vendido_abaixo_do_custo_aparece_como_prejuizo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)      # custo 40
    await _vender(test_client, h, p, va, 2, "30.00")                    # vende por 30: prejuízo de R$ 20 no lote
    f = await _saude(test_client, h, t_id)
    assert f["roi"]["negative_count"] == 1
    neg = f["roi"]["negative_entries"][0]
    assert neg["estimated_revenue"] == 60.0 and neg["cost_of_sold"] == 80.0 and neg["roi"] == -25.0
    assert f["roi"]["avg_margin"] == round((60 - 80) / 60 * 100, 1)      # margem negativa sobre o valor vendido
    invalidate_dashboard_cache(t_id)
    painel = (await test_client.get(f"{API}/dashboard/stats", headers=h)).json()["sales"]["realized_margin_percent"]
    assert abs(f["roi"]["avg_margin"] - painel) < 0.15, (f["roi"], painel)
