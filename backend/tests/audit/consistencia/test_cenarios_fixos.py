"""Cenários fixos (valores conferidos à mão) da auditoria de consistência: cada um isola uma regra que as telas precisam respeitar."""
import pytest
from sqlalchemy import select

from app.services.stock_ledger import reconcile
from tests.audit.consistencia.mundo import C, D, devolve, mundo, q2, vende
from tests.test_estresse_dinheiro import _numeros
from tests.test_lot_costs import _limpa_loja_1, _lote, _produto  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
API = "/api/v1"


def _limpa(t_id):
    from app.core.dashboard_cache import _dashboard_cache, invalidate_dashboard_cache
    _dashboard_cache.clear()
    invalidate_dashboard_cache(t_id)


async def _top(client, h):
    d = (await client.get(f"{API}/sales/reports/top-products", headers=h, params={"period": "this_month", "limit": 50})).json()
    return d


# ───────────────────────────────────────────────────────── desconto no item x devolução
async def test_devolucao_de_item_com_desconto_no_item_nao_devolve_mais_do_que_foi_pago(test_client, async_session, test_user):
    """Cliente pagou R$ 160 por 2 peças de R$ 100 (desconto de R$ 40 no item). Devolvendo as 2, o estorno não pode passar de R$ 160."""
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 2, "40")])
    assert r.status_code == 201 and q2(r.json()["total_amount"]) == D("160.00")
    antes = await _numeros(test_client, h)
    rr = await devolve(test_client, h, book, s, s.lines[0], 2)
    assert rr.status_code == 201, rr.text
    estorno = D(str(rr.json()["total_refund"]))
    assert estorno <= D("160.00"), f"estorno R$ {estorno} maior que os R$ 160,00 pagos (desconto do item ignorado)"
    n = {k: v - antes[k] for k, v in (await _numeros(test_client, h)).items()}
    assert q2(n["inicio_total"]) <= 0 and q2(n["relatorio"]) <= 0  # só confirma o sinal da variação
    # venda toda devolvida: a receita líquida tem que ser exatamente zero (nem negativa)
    assert q2((await _numeros(test_client, h))["relatorio"] - antes["relatorio"] + D("160")) == D("0.00"), "receita líquida de venda 100% devolvida != 0"


async def test_devolucao_com_desconto_no_item_e_na_venda(test_client, async_session, test_user):
    """Item com desconto + desconto na venda inteira: o estorno proporcional nunca passa do que a cliente pagou pela peça."""
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 4, "100"), (ids.b, 1, "0")], desconto="52")
    # subtotal 4*100-100 + 120 = 420; total 368; item A pago = 300 * 368/420
    assert r.status_code == 201 and q2(r.json()["total_amount"]) == D("368.00")
    pago_a = D("300") * D("368") / D("420")
    rr = await devolve(test_client, h, book, s, s.lines[0], 4)
    assert rr.status_code == 201, rr.text
    estorno = D(str(rr.json()["total_refund"]))
    assert abs(estorno - pago_a) <= D("0.02"), f"estorno {estorno} != pago pelo item A {q2(pago_a)}"


# ───────────────────────────────────────────────────────── venda parcialmente devolvida x telas
async def test_venda_com_devolucao_parcial_continua_nos_produtos_mais_vendidos_pelo_valor_liquido(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 10, "0")])
    d0 = await _top(test_client, h)
    assert sum(x["quantity_sold"] for x in d0["products"]) == 10
    rr = await devolve(test_client, h, book, s, s.lines[0], 4)
    assert rr.status_code == 201
    _limpa(t_id)
    d1 = await _top(test_client, h)
    liquido = sum(x["quantity_sold"] for x in d1["products"])
    receita = sum(D(str(x["total_revenue"])) for x in d1["products"])
    res = {x["product_id"]: x for x in (await test_client.get(f"{API}/expenses/resultado-mes/produtos", headers=h)).json()}
    assert res[ids.p1]["pieces_net"] == 6 and q2(res[ids.p1]["revenue"]) == D("600.00")   # referência (conta única)
    assert liquido == 6 and q2(receita) == D("600.00"), (
        f"Produtos mais vendidos: {liquido} peças e R$ {receita} depois de devolver 4 de 10 (esperado 6 e R$ 600,00; "
        f"a venda parcialmente devolvida some da lista)")


async def test_venda_devolvida_por_inteiro_nao_aparece_com_receita_nos_produtos_mais_vendidos(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 3, "0")])
    assert (await devolve(test_client, h, book, s, s.lines[0], 3)).status_code == 201
    _limpa(t_id)
    d = await _top(test_client, h)
    assert sum(D(str(x["total_revenue"])) for x in d["products"]) == 0
    assert sum(x["quantity_sold"] for x in d["products"]) == 0


async def test_relatorio_mensal_mais_vendidos_e_liquido_de_devolucao(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 10, "0")])
    assert (await devolve(test_client, h, book, s, s.lines[0], 4)).status_code == 201
    _limpa(t_id)
    m = (await test_client.get(f"{API}/reports/monthly", headers=h)).json()
    top = m["sales"]["top_products"]
    assert m["result"]["current"]["revenue"] == 600.0
    assert sum(x["revenue"] for x in top) == pytest.approx(600.0), (
        f"mais vendidos do Relatório mensal soma R$ {sum(x['revenue'] for x in top)} mas a receita do mês é R$ 600,00")
    assert sum(x["quantity_sold"] for x in top) == 6, f"peças dos mais vendidos: {sum(x['quantity_sold'] for x in top)} (liquido 6)"


# ───────────────────────────────────────────────────────── lucro por lote x devolução entre lotes
async def test_lucro_por_lote_atribui_a_devolucao_ao_lote_que_recebeu_a_peca(test_client, async_session, test_user):
    """Venda de 12 de A pega 10 do lote 1 (R$40) e 2 do lote 2 (R$40 posto). Devolver 2 volta ao lote 2 (último), não ao lote 1."""
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 12, "0")])
    assert (await devolve(test_client, h, book, s, s.lines[0], 2)).status_code == 201
    _limpa(t_id)
    e1, e2 = ids.entries[0], ids.entries[1]
    a1 = (await test_client.get(f"{API}/stock-entries/{e1}/analytics", headers=h)).json()
    a2 = (await test_client.get(f"{API}/stock-entries/{e2}/analytics", headers=h)).json()
    t1 = (await test_client.get(f"{API}/stock-entries/{e1}/tracking", headers=h)).json()["totals"]
    t2 = (await test_client.get(f"{API}/stock-entries/{e2}/tracking", headers=h)).json()["totals"]
    assert (t1["sold"], t2["sold"]) == (10, 0)                       # rastreio (correto: a peça voltou ao lote 2)
    assert (a1["total_quantity_sold"], a2["total_quantity_sold"]) == (10, 0), (
        f"Lucro por lote atribui a devolução ao lote errado: lote1={a1['total_quantity_sold']} lote2={a2['total_quantity_sold']} (esperado 10 e 0)")
    assert q2(a1["real_revenue"]) == D("1000.00") and q2(a2["real_revenue"]) == D("0.00")


# ───────────────────────────────────────────────────────── defeito (peça devolvida que não volta)
async def test_peca_com_defeito_mesma_conta_em_todas_as_telas(test_client, async_session, test_user):
    """Vende 5, devolve 2 com defeito (não voltam). Receita 300, custo 5*40 (prejuízo fica), 3 peças líquidas."""
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 5, "0")])
    assert (await devolve(test_client, h, book, s, s.lines[0], 2, restock=False)).status_code == 201
    _limpa(t_id)
    n = await _numeros(test_client, h)
    assert q2(n["relatorio"]) == D("300.00") and q2(n["relatorio_custo"]) == D("200.00")
    e1 = ids.entries[0]
    a = (await test_client.get(f"{API}/stock-entries/{e1}/analytics", headers=h)).json()
    assert q2(a["cost_of_sold"]) == D("200.00"), f"Lucro por lote: custo {a['cost_of_sold']} (peça com defeito não voltou: custo fica em 200)"
    tr = (await test_client.get(f"{API}/stock-entries/{e1}/tracking", headers=h)).json()["totals"]
    f = (await test_client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()["sell_through"]
    # 2 telas têm que concordar sobre quantas peças foram vendidas/saíram sem venda
    assert (tr["sold"], tr["removed"]) == (f["total_sold"], f["other_out"]), (
        f"Rastreio do lote: vendidas={tr['sold']} sem venda={tr['removed']}; Saúde do Estoque: vendidas={f['total_sold']} outras saídas={f['other_out']}")


# ───────────────────────────────────────────────────────── baixa, exclusão e produto zerado
async def _estado(client, db, t_id, h, ids):
    _limpa(t_id)
    db.expire_all()
    out = {"rec": await reconcile(db, t_id), "track": {}, "ents": {}}
    for eid in ids.entries:
        out["track"][eid] = (await client.get(f"{API}/stock-entries/{eid}/tracking", headers=h)).json()["totals"]
    out["fifo"] = (await client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()
    out["stats"] = (await client.get(f"{API}/dashboard/stats", headers=h)).json()
    return out


async def test_baixas_e_exclusoes_nao_mexem_em_dinheiro_e_a_conta_do_lote_fecha(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 12, "5"), (ids.b, 5, "0")], desconto="20")
    assert (await devolve(test_client, h, book, s, s.lines[0], 2)).status_code == 201
    _limpa(t_id)
    dinheiro = {k: v for k, v in (await _numeros(test_client, h)).items()}

    # baixa pela Conferência (admin liga a chave): 4 de B
    await test_client.put(f"{API}/store/stock-writeoff-settings", json={"enabled": True}, headers=h)
    w = await test_client.post(f"{API}/reports/stock-check/writeoff", headers=h, json={
        "reason": "avaria", "items": [{"variant_id": ids.b, "quantity": 4}]})
    assert w.status_code == 200, w.text
    book.remove_fifo(ids.b, 4)
    # variação C (nunca vendida) excluída com baixa de todo o estoque
    d = await test_client.delete(f"{API}/product-variants/{ids.c}", headers=h, params={"zerar_estoque": "true"})
    assert d.status_code in (200, 204), d.text
    book.remove_fifo(ids.c, 50)

    est = await _estado(test_client, async_session, t_id, h, ids)
    assert est["rec"]["ok"] and est["rec"]["untracked"] == [], est["rec"]
    for eid, t in est["track"].items():
        assert t["closed"] is True and t["removed_unrecorded"] == 0, (eid, t)
    removidas = sum(t["removed"] for t in est["track"].values())
    assert removidas == 54, f"saíram sem venda: rastreio={removidas} esperado=54"
    assert est["fifo"]["sell_through"]["other_out"] == 54, est["fifo"]["sell_through"]
    assert est["fifo"]["sell_through"]["total_sold"] == 12 + 5 - 2
    # dinheiro não muda com baixa/exclusão
    depois = await _numeros(test_client, h)
    for k in ("inicio_total", "relatorio", "relatorio_custo", "resultado", "resultado_custo", "mes_lucro"):
        assert depois[k] == dinheiro[k], f"{k} mudou com baixa: {dinheiro[k]} -> {depois[k]}"
    # lista de entradas: taxa de venda usa venda real (E5 tinha 50 baixadas, 0 vendidas)
    lista = {e["id"]: e for e in (await test_client.get(f"{API}/stock-entries/", headers=h, params={"limit": 50})).json()}
    assert lista[ids.entries[4]]["items_sold"] == 0 and lista[ids.entries[4]]["sell_through_rate"] == 0
    # camadas do livro x banco (a baixa tira do lote mais antigo primeiro)
    from app.models.entry_item import EntryItem
    for vid, layers in book.layers.items():
        for l in layers:
            rem = (await async_session.execute(select(EntryItem.quantity_remaining).where(EntryItem.id == l.item_id))).scalar()
            assert rem == l.rem, f"item {l.item_id}: banco={rem} livro={l.rem}"


async def test_excluir_item_e_entrada_sem_venda_mantem_a_conta_e_o_dinheiro(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    from tests.test_estresse_vendas_fifo import _variacao
    t_id, h, ids, book = await mundo(async_session, test_user)
    p, v1 = await _produto(async_session, t_id, ids.cat, "Aud Excl", "50.00")
    v2 = await _variacao(async_session, p, t_id, "50.00", cor="Preto", tam="P")
    from datetime import date
    e6 = await _lote(async_session, t_id, [(v1, p, 8, 20), (v2, p, 4, 20)], entry_date=date.today())
    e6_id = e6.id
    await async_session.commit()
    r, s = await vende(test_client, h, ids, book, [(ids.a, 3, "0")])
    _limpa(t_id)
    dinheiro = await _numeros(test_client, h)
    from app.models.entry_item import EntryItem
    item2 = (await async_session.execute(select(EntryItem.id).where(EntryItem.entry_id == e6_id, EntryItem.variant_id == v2.id))).scalar()
    d = await test_client.delete(f"{API}/stock-entries/entry-items/{item2}", headers=h)
    assert d.status_code == 200, d.text
    _limpa(t_id)
    tr = (await test_client.get(f"{API}/stock-entries/{e6_id}/tracking", headers=h)).json()
    assert tr["totals"]["received"] == 8 and tr["totals"]["closed"] is True, tr["totals"]
    rec = await reconcile(async_session, t_id)
    assert rec["ok"], rec["untracked"]
    d = await test_client.delete(f"{API}/stock-entries/{e6_id}", headers=h)
    assert d.status_code == 200, d.text
    _limpa(t_id)
    rec = await reconcile(async_session, t_id)
    assert rec["ok"] and rec["untracked"] == [], rec
    assert (await _numeros(test_client, h)) == dinheiro, "excluir item/entrada sem venda não pode mexer no dinheiro"
    f = (await test_client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()["sell_through"]
    # Saúde do estoque só enxerga entradas ativas: peças da E6 excluída não podem virar "outras saídas"
    assert f["other_out"] == 0, f


async def test_excluir_entrada_com_venda_nao_deixa_receita_sem_lote(test_client, async_session, test_user):
    """Entrada com peças já vendidas: o app recusa ou, se aceita, o dinheiro e a conta do lote continuam coerentes."""
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 3, "0")])
    _limpa(t_id)
    antes = await _numeros(test_client, h)
    d = await test_client.delete(f"{API}/stock-entries/{ids.entries[0]}", headers=h)
    _limpa(t_id)
    depois = await _numeros(test_client, h)
    if d.status_code == 200:
        # aceitou: então a receita e o custo (FIFO gravado na venda) não podem mudar; o rastreio/saúde não podem dar 500
        assert depois["relatorio"] == antes["relatorio"] and depois["relatorio_custo"] == antes["relatorio_custo"]
        for url in (f"/stock-entries/{ids.entries[0]}/tracking", f"/stock-entries/{ids.entries[0]}/analytics", "/dashboard/fifo-performance", "/stock-entries/"):
            rr = await test_client.get(f"{API}{url}", headers=h)
            assert rr.status_code in (200, 404), (url, rr.status_code, rr.text[:200])
        f = (await test_client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()["sell_through"]
        assert f["other_out"] >= 0
    else:
        assert d.status_code in (400, 409), (d.status_code, d.text[:200])
        assert depois == antes


async def test_produto_zerado_so_conta_como_sem_estoque_se_ja_vendeu(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    from datetime import date
    # P3: 3 peças, todas vendidas -> esgotou por venda. P4: 3 peças, baixadas na Conferência, nunca vendeu -> só catálogo.
    p3, v3 = await _produto(async_session, t_id, ids.cat, "Aud Vendido", "30.00")
    p4, v4 = await _produto(async_session, t_id, ids.cat, "Aud Baixado", "30.00")
    await _lote(async_session, t_id, [(v3, p3, 3, 10), (v4, p4, 3, 10)], entry_date=date.today())
    ids.prod[v3.id], ids.price[v3.id] = p3.id, D("30")
    v3id, v4id = v3.id, v4.id
    await async_session.commit()
    base = (await test_client.get(f"{API}/dashboard/stats", headers=h)).json()["stock"]["out_of_stock_count"]
    r, s = await vende(test_client, h, ids, book, [(v3id, 3, "0")]) if False else (None, None)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p3.id, "variant_id": v3id, "quantity": 3, "unit_price": "30"}],
        "payments": [{"amount": "90", "payment_method": "cash"}]})
    assert r.status_code == 201, r.text
    await test_client.put(f"{API}/store/stock-writeoff-settings", json={"enabled": True}, headers=h)
    w = await test_client.post(f"{API}/reports/stock-check/writeoff", headers=h, json={"reason": "perda", "items": [{"variant_id": v4id, "quantity": 3}]})
    assert w.status_code == 200, w.text
    _limpa(t_id)
    st = (await test_client.get(f"{API}/dashboard/stats", headers=h)).json()["stock"]
    assert st["out_of_stock_count"] - base == 1, f"sem estoque: +{st['out_of_stock_count'] - base} (esperado +1: só o que vendeu e zerou)"
    inbox = (await test_client.get(f"{API}/notifications/inbox", headers=h)).json()
    texto = str(inbox)
    assert "Aud Vendido" in texto and "Aud Baixado" not in texto, "alerta de sem estoque só para produto que já vendeu"


# ───────────────────────────────────────────────────────── desconto da venda inteira nos "mais vendidos"
async def test_mais_vendidos_do_relatorio_usam_o_valor_pago_com_desconto_da_venda(test_client, async_session, test_user):
    """10 peças a R$ 100 com R$ 100 de desconto na venda: a loja ficou com R$ 900. Todas as telas têm que dizer 900."""
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 10, "0")], desconto="100")
    assert r.status_code == 201
    _limpa(t_id)
    n = await _numeros(test_client, h)
    assert q2(n["relatorio"]) == D("900.00") and q2(n["resultado"]) == D("900.00")
    rel = (await test_client.get(f"{API}/reports/sales", headers=h, params={"period": "this_month"})).json()
    top_rel = sum(D(str(x["revenue"])) for x in rel["top_products"])
    assert q2(top_rel) == D("900.00"), f"Relatório de vendas, mais vendidos: R$ {top_rel} (esperado 900,00 = valor pago)"
    m = (await test_client.get(f"{API}/reports/monthly", headers=h)).json()
    top_m = sum(D(str(x["revenue"])) for x in m["sales"]["top_products"])
    assert q2(top_m) == D("900.00"), f"Relatório mensal, mais vendidos: R$ {top_m} (esperado 900,00)"
    res = {x["product_id"]: x for x in (await test_client.get(f"{API}/expenses/resultado-mes/produtos", headers=h)).json()}
    assert q2(res[ids.p1]["revenue"]) == D("900.00")


async def test_mais_vendidos_do_relatorio_usam_o_valor_pago_com_desconto_no_item(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 10, "100")])        # 1000 - 100 = 900
    assert r.status_code == 201 and q2(r.json()["total_amount"]) == D("900.00")
    _limpa(t_id)
    rel = (await test_client.get(f"{API}/reports/sales", headers=h, params={"period": "this_month"})).json()
    top_rel = sum(D(str(x["revenue"])) for x in rel["top_products"])
    assert q2(top_rel) == D("900.00"), f"Relatório de vendas, mais vendidos: R$ {top_rel} (desconto do item ignorado; esperado 900,00)"


# ───────────────────────────────────────────────────────── relatório por período (tela "Vendas por período")
async def test_relatorio_por_periodo_igual_a_conta_unica_com_cancelada_e_devolucao(test_client, async_session, test_user):
    from datetime import date
    t_id, h, ids, book = await mundo(async_session, test_user)
    r1, s1 = await vende(test_client, h, ids, book, [(ids.a, 10, "0")])
    r2, s2 = await vende(test_client, h, ids, book, [(ids.c, 2, "0")])
    assert (await test_client.post(f"{API}/sales/{s2.id}/cancel", headers=h, params={"reason": "lançada errado"})).status_code == 200
    assert (await devolve(test_client, h, book, s1, s1.lines[0], 4)).status_code == 201
    _limpa(t_id)
    hoje = date.today().isoformat()
    n = await _numeros(test_client, h)
    p = (await test_client.get(f"{API}/sales/reports/period", headers=h, params={"start_date": hoje, "end_date": hoje})).json()
    assert q2(p["total_sales"]) == q2(n["relatorio"]) == D("600.00"), (
        f"Vendas por período: total R$ {p['total_sales']} (venda cancelada de R$ 160 e devolução de R$ 400; esperado 600,00)")
    y = (await test_client.get(f"{API}/dashboard/sales/yoy", headers=h)).json()
    mes_atual = y["months"][date.today().month - 1]
    assert q2(list(v for k, v in mes_atual.items() if k in ("current", "current_total", "total"))[0]) == D("600.00"), mes_atual
