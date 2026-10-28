"""Cenários nomeados de estresse de vendas, FIFO, devolução e troca (oráculo de conservação em cada um).

O oráculo: para cada camada de entrada (entry_item), `recebido - restante` tem que ser igual ao que as vendas NÃO
canceladas ainda seguram dela (tirou - devolveu ao estoque). Se diferir, uma peça sumiu ou foi inventada.
Ver docs/PLANO_TESTES_VENDAS_FIFO.md.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.test_estresse_vendas_fifo import (  # noqa: F401
    _camadas, _cenario_30, _devolver, _estoque, _limpa_loja_1, _limpa_vendas, _lote, _variacao, _vender,
)

pytestmark = pytest.mark.asyncio
D = Decimal


async def _consumo_pelas_vendas(db, variant_ids):
    """{entry_item_id: peças que as vendas NÃO canceladas ainda seguram desta camada} (tirou - devolveu ao estoque)."""
    from app.models.sale import Sale, SaleItem
    rows = (await db.execute(
        select(SaleItem.sale_sources, Sale.status).join(Sale, Sale.id == SaleItem.sale_id)
        .where(SaleItem.variant_id.in_(variant_ids)))).all()
    out = {}
    for fontes, status in rows:
        if str(status).lower().endswith("cancelled") or not fontes:
            continue
        for src in (fontes.get("sources", []) if isinstance(fontes, dict) else fontes):
            out[src["entry_item_id"]] = out.get(src["entry_item_id"], 0) + int(src["quantity_taken"]) - int(src.get("quantity_returned", 0))
    return out


async def confere_conservacao(db, variant_ids, *, extra_consumo=None):
    db.expire_all()
    seguram = await _consumo_pelas_vendas(db, variant_ids)
    for vid in variant_ids:
        for item_id, recebido, restante, _custo in await _camadas(db, vid):
            assert 0 <= restante <= recebido, f"camada {item_id}: recebido {recebido}, restante {restante}"
            esperado = seguram.get(item_id, 0) + (extra_consumo or {}).get(item_id, 0)
            assert recebido - restante == esperado, (
                f"variação {vid}, camada {item_id}: saiu {recebido - restante} do estoque mas as vendas ativas seguram {esperado}")


async def foto(db, variant_ids):
    db.expire_all()
    return {vid: [(c[0], c[2]) for c in await _camadas(db, vid)] for vid in variant_ids}


async def test_30_devolucoes_de_1_peca_cada_voltam_exatamente_ao_lugar(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 30, "100.00")
    for i in range(30):
        r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}], motivo=f"peça {i}")
        assert r.status_code == 201, (i, r.text)
        await confere_conservacao(async_session, [va.id])
    assert [c[2] for c in await _camadas(async_session, va.id)] == [10, 15, 20]  # tudo como antes da venda
    assert (await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])).status_code == 400


async def test_cancelar_venda_depois_de_devolucao_parcial_nao_repoe_duas_vezes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 30, "100.00")
    assert (await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 5}])).status_code == 201
    r = await test_client.post(f"/api/v1/sales/{sale_id}/cancel", headers=h, params={"reason": "Cliente desistiu de tudo"})
    await confere_conservacao(async_session, [va.id])
    assert await _estoque(async_session, va.id) <= 45, "o cancelamento repôs peças que já tinham voltado"
    if r.status_code in (200, 201):
        assert [c[2] for c in await _camadas(async_session, va.id)] == [10, 15, 20]


async def test_peca_com_defeito_devolvida_nunca_volta_ao_estoque_nem_no_cancelamento(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 10, "100.00")
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 4, "restock": False}])
    assert r.status_code == 201, r.text
    assert await _estoque(async_session, va.id) == 35          # 45 - 10 vendidas; as 4 com defeito não voltam
    r = await test_client.post(f"/api/v1/sales/{sale_id}/cancel", headers=h, params={"reason": "Cancelando depois do defeito"})
    async_session.expire_all()
    # as 4 peças com defeito estão com a loja, mas defeituosas: o estoque vendável nunca passa de 45 - 4
    assert await _estoque(async_session, va.id) <= 41, f"peça com defeito voltou ao estoque (cancel={r.status_code})"


async def test_venda_maior_que_o_estoque_e_recusada_sem_mexer_em_nada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    antes = await foto(async_session, [va.id, vb.id])
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 46, "unit_price": "100.00"}],
        "payments": [{"amount": "4600.00", "payment_method": "cash"}]})
    assert r.status_code == 400, r.text
    assert await foto(async_session, [va.id, vb.id]) == antes
    await _vender(test_client, h, p, va, 45, "100.00")      # vender exatamente tudo funciona
    assert await _estoque(async_session, va.id) == 0
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"}],
        "payments": [{"amount": "100.00", "payment_method": "cash"}]})
    assert r.status_code == 400
    await confere_conservacao(async_session, [va.id])


async def test_venda_com_dois_itens_e_falta_de_estoque_no_segundo_nao_baixa_o_primeiro(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user, estoque_b=3)
    antes = await foto(async_session, [va.id, vb.id])
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 5, "unit_price": "100.00"},
                  {"product_id": p.id, "variant_id": vb.id, "quantity": 4, "unit_price": "100.00"}],
        "payments": [{"amount": "900.00", "payment_method": "cash"}]})
    assert r.status_code == 400, r.text
    assert await foto(async_session, [va.id, vb.id]) == antes   # tudo ou nada


async def test_troca_de_varios_itens_para_variacoes_diferentes_na_mesma_devolucao(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    vc = await _variacao(async_session, p, t_id, "100.00", cor="Verde", tam="G")
    await _lote(async_session, t_id, [(vc, p, 12, 35)], entry_date=date.today() - timedelta(days=5))
    vc = SimpleNamespace(id=vc.id)  # depois do commit o objeto expira; o id basta
    await async_session.commit()
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 8, "unit_price": "100.00"},
                  {"product_id": p.id, "variant_id": vb.id, "quantity": 6, "unit_price": "100.00"}],
        "payments": [{"amount": "1400.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    corpo = r.json()
    ia, ib = corpo["items"][0]["id"], corpo["items"][1]["id"]
    r = await _devolver(test_client, h, corpo["id"], [
        {"sale_item_id": ia, "quantity": 3, "replacement_variant_id": vc.id},
        {"sale_item_id": ib, "quantity": 2, "replacement_variant_id": vc.id}])
    assert r.status_code == 201, r.text
    assert D(str(r.json()["net_amount"])) == D("0.00")
    await confere_conservacao(async_session, [va.id, vb.id, vc.id])
    assert await _estoque(async_session, vc.id) == 12 - 5


async def test_troca_por_peca_mais_barata_devolve_a_diferenca(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user, preco_b="70.00")
    sale_id, item_id = await _vender(test_client, h, p, va, 4, "100.00")
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 4, "replacement_variant_id": vb.id}])
    assert r.status_code == 201, r.text
    assert D(str(r.json()["total_refund"])) == D("400.00")
    assert D(str(r.json()["net_amount"])) == D("-120.00")      # 4 x (70 - 100): a loja devolve R$ 120
    await confere_conservacao(async_session, [va.id, vb.id])


async def test_troca_cuja_peca_nova_atravessa_duas_camadas_de_custo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user, estoque_b=0)
    hoje = date.today()
    await _lote(async_session, t_id, [(vb, p, 3, 30)], entry_date=hoje - timedelta(days=9))
    await _lote(async_session, t_id, [(vb, p, 5, 36)], entry_date=hoje - timedelta(days=8))
    await async_session.commit()
    sale_id, item_id = await _vender(test_client, h, p, va, 6, "100.00")
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 6, "replacement_variant_id": vb.id}])
    assert r.status_code == 201, r.text
    assert [c[2] for c in await _camadas(async_session, vb.id)] == [0, 2]   # 3 da camada R$30 e 3 da R$36
    await confere_conservacao(async_session, [va.id, vb.id])


async def test_desconto_da_venda_reduz_o_valor_devolvido_proporcionalmente(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash", "discount_amount": "100.00",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 10, "unit_price": "100.00"}],
        "payments": [{"amount": "900.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 5}])
    assert r.status_code == 201, r.text
    reembolso = D(str(r.json()["total_refund"]))
    # cliente pagou R$ 900 por 10 peças (R$ 90 cada): devolver 5 devolve R$ 450, nunca R$ 500 (preço cheio)
    assert reembolso == D("450.00"), f"devolveu {reembolso} por 5 peças de uma venda de R$ 900 / 10 peças"


async def test_devolucao_fora_do_prazo_e_recusada(test_client, async_session, test_user):
    from app.models.sale import Sale
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 3, "100.00")
    s = (await async_session.execute(select(Sale).where(Sale.id == sale_id))).scalar_one()
    s.created_at = datetime.utcnow() - timedelta(days=20)
    await async_session.commit()
    antes = await foto(async_session, [va.id])
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert r.status_code == 400, r.text
    assert await foto(async_session, [va.id]) == antes


async def test_item_de_outra_venda_nao_pode_ser_devolvido(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    s1, i1 = await _vender(test_client, h, p, va, 3, "100.00")
    s2, i2 = await _vender(test_client, h, p, va, 3, "100.00")
    antes = await foto(async_session, [va.id])
    r = await _devolver(test_client, h, s1, [{"sale_item_id": i2, "quantity": 1}])
    assert r.status_code == 400, r.text
    assert await foto(async_session, [va.id]) == antes
    await confere_conservacao(async_session, [va.id])


async def test_custo_da_venda_de_30_pecas_e_a_soma_das_tres_camadas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 30, "100.00")
    corpo = (await test_client.get(f"/api/v1/sales/{sale_id}", headers=h)).json()
    fontes = corpo["items"][0].get("sale_sources") or {}
    fontes = fontes.get("sources", []) if isinstance(fontes, dict) else fontes
    assert sum(D(str(f["total_cost"])) for f in fontes) == D(10 * 40 + 15 * 45 + 5 * 50)
