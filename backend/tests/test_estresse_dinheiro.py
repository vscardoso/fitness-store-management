"""Item C do plano de testes (docs/PLANO_TESTES_VENDAS_FIFO.md): dinheiro e relatórios batem com o livro.

Regras (decisão do Victor, 28/10/2026): receita LÍQUIDA em todas as telas (vendas - devoluções), devolução abate no dia
em que aconteceu, peça devolvida com defeito continua no custo (prejuízo), total gasto do cliente líquido. A conta
única fica em app/services/money_ledger.py; aqui cada tela (início, "este mês", gráfico diário, relatório de vendas,
Resultado do Mês) é conferida contra um livro independente, montado só com o que o teste fez.

Antes: o relatório não descontava devolução e contava a troca duas vezes; o total geral do início zerava a venda
parcialmente devolvida; o "este mês" somava venda cancelada; o Resultado do Mês tirava inteira a venda com uma peça
devolvida; cancelar depois de devolução estornava os pontos de novo; a troca não entrava no total gasto; o troco em
dinheiro ficava gravado como pagamento.
"""
import os
import random
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

import pytest
from sqlalchemy import select, update

from tests.test_estresse_cenarios import confere_conservacao
from tests.test_estresse_vendas_fifo import (  # noqa: F401  (fixtures autouse)
    _cenario_30, _devolver, _estoque, _limpa_loja_1, _limpa_vendas, _lote, _variacao,
)

pytestmark = pytest.mark.asyncio
D = Decimal
C = D("0.01")
OPS = int(os.environ.get("ESTRESSE_OPS", "60"))
SEEDS = [int(x) for x in os.environ.get("ESTRESSE_DINHEIRO_SEEDS", "5,17,29").split(",")]


def q2(x) -> Decimal:
    return D(str(x)).quantize(C, rounding=ROUND_HALF_UP)


async def _cliente(client, h, nome):
    import itertools
    r = await client.post("/api/v1/customers/", headers=h, json={
        "full_name": nome, "phone": f"3499{random.randint(1000000, 9999999)}"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _vende(client, h, linhas, *, cliente=None, desconto="0", pagamentos=None):
    """linhas = [(product_id, variant_id, qtd, preco)]. Pagamento padrão: o total exato em dinheiro."""
    sub = sum(D(str(pr)) * q for _p, _v, q, pr in linhas)
    total = sub - D(desconto)
    pagamentos = pagamentos or [("cash", total)]
    r = await client.post("/api/v1/sales/", headers=h, json={
        "payment_method": pagamentos[0][0], "customer_id": cliente, "discount_amount": str(desconto),
        "items": [{"product_id": p, "variant_id": v, "quantity": q, "unit_price": str(pr)} for p, v, q, pr in linhas],
        "payments": [{"amount": str(a), "payment_method": m} for m, a in pagamentos]})
    return r


async def _numeros(client, h):
    """Os números de dinheiro de todas as telas."""
    from app.core.dashboard_cache import _dashboard_cache
    _dashboard_cache.clear()  # a limpeza entre testes apaga vendas sem passar pelo serviço (que limparia o cache)
    st = (await client.get("/api/v1/dashboard/stats", headers=h)).json()["sales"]
    mes = (await client.get("/api/v1/dashboard/sales/monthly", headers=h, params={"period": "this_month"})).json()
    dia = (await client.get("/api/v1/dashboard/sales/daily", headers=h, params={"days": 7})).json()
    rel = (await client.get("/api/v1/reports/sales", headers=h, params={"period": "this_month"})).json()
    res = (await client.get("/api/v1/expenses/resultado-mes", headers=h)).json()
    return {
        "inicio_hoje": D(str(st["total_today"])), "inicio_total": D(str(st["total_all"])),
        "inicio_lucro_total": D(str(st["realized_profit"])), "inicio_custo_total": D(str(st["total_cmv"])),
        "inicio_lucro_hoje": D(str(st["profit_today"])), "inicio_vendas_hoje": int(st["count_today"]),
        "mes": D(str(mes["total"])), "mes_lucro": D(str(mes["profit"])), "mes_vendas": int(mes["count"]),
        "grafico_7d": D(str(dia["totals"]["total"])),
        "relatorio": D(str(rel["total_revenue"])), "relatorio_lucro": D(str(rel["total_profit"])),
        "relatorio_custo": D(str(rel["total_cost"])), "relatorio_vendas": int(rel["total_sales"]),
        "relatorio_devolucoes": D(str(rel["returns_total"])),
        "relatorio_dias": sum((D(str(d["revenue"])) for d in rel["daily"]), D("0")),
        "relatorio_vendedores": sum((D(str(s["revenue"])) for s in rel["by_seller"]), D("0")),
        "resultado": D(str(res["revenue"])), "resultado_custo": D(str(res["cmv"])),
    }


def _delta(depois, antes):
    return {k: depois[k] - antes[k] for k in depois}


def _confere(delta, receita, custo, vendas, devolucoes, tol_custo=C):
    """Todas as telas mostram a mesma receita, o mesmo custo e o mesmo lucro (variação desde o início do teste)."""
    for k in ("inicio_hoje", "inicio_total", "mes", "grafico_7d", "relatorio", "relatorio_dias", "relatorio_vendedores", "resultado"):
        assert q2(delta[k]) == q2(receita), f"{k}: {delta[k]} (esperado {receita})"
    for k in ("inicio_custo_total", "relatorio_custo", "resultado_custo"):
        assert abs(delta[k] - custo) <= tol_custo, f"{k}: {delta[k]} (esperado {custo})"
    for k in ("inicio_lucro_hoje", "inicio_lucro_total", "mes_lucro", "relatorio_lucro"):
        assert abs(delta[k] - (receita - custo)) <= tol_custo, f"{k}: {delta[k]} (esperado {receita - custo})"
    for k in ("inicio_vendas_hoje", "mes_vendas", "relatorio_vendas"):
        assert delta[k] == vendas, f"{k}: {delta[k]} vendas (esperado {vendas})"
    assert q2(delta["relatorio_devolucoes"]) == q2(devolucoes)


async def _cliente_api(client, h, cid):
    c = (await client.get(f"/api/v1/customers/{cid}", headers=h)).json()
    return D(str(c["loyalty_points"])), D(str(c["total_spent"])), int(c["total_purchases"])


async def _pagamentos(db, sale_id):
    from app.models.sale import Payment
    rows = (await db.execute(select(Payment.amount, Payment.status).where(Payment.sale_id == sale_id))).all()
    return sum((D(str(a)) for a, s in rows if str(s) in ("confirmed", "PaymentStatus.CONFIRMED")), D("0"))


# ───────────────────────────────────────────────────────── cenário fechado, valores conferidos à mão
async def test_venda_devolucao_defeito_troca_e_cancelamento_batem_em_todas_as_telas(test_client, async_session, test_user):
    # A: 10 @ R$40 + ... (3 camadas); B: troca, preço R$120, custo R$30
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user, preco_a="100.00", preco_b="120.00")
    antes = await _numeros(test_client, h)
    cid = await _cliente(test_client, h, "Cliente Dinheiro")

    r = await _vende(test_client, h, [(p.id, va.id, 10, "100.00")], cliente=cid)
    assert r.status_code in (200, 201), r.text
    venda = r.json()
    item = venda["items"][0]["id"]
    assert await _pagamentos(async_session, venda["id"]) == D("1000.00")

    # devolve 3 (voltam ao estoque), 1 com defeito (não volta), troca 2 por B (R$ 240, paga R$ 40 de diferença)
    assert (await _devolver(test_client, h, venda["id"], [{"sale_item_id": item, "quantity": 3}])).status_code == 201
    assert (await _devolver(test_client, h, venda["id"], [{"sale_item_id": item, "quantity": 1, "restock": False}])).status_code == 201
    r = await _devolver(test_client, h, venda["id"], [{"sale_item_id": item, "quantity": 2, "replacement_variant_id": vb.id}],
                        settlement_method="pix")
    assert r.status_code == 201, r.text
    troca = r.json()
    assert D(str(troca["net_amount"])) == D("40.00")
    assert await _pagamentos(async_session, troca["exchange_sale_id"]) == D("40.00"), "a troca só recebe a diferença"

    # outra venda, cancelada: não entra em nada
    r = await _vende(test_client, h, [(p.id, va.id, 2, "100.00")])
    assert (await test_client.post(f"/api/v1/sales/{r.json()['id']}/cancel", headers=h, params={"reason": "Lançada errado"})).status_code == 200

    # venda que já teve devolução/troca não pode ser cancelada (apagaria o crédito que pagou a peça da troca)
    foto = [await _estoque(async_session, va.id), await _estoque(async_session, vb.id)]
    r = await test_client.post(f"/api/v1/sales/{venda['id']}/cancel", headers=h, params={"reason": "Tentando cancelar"})
    assert r.status_code == 400 and "Devolução" in r.json()["detail"], r.text
    assert [await _estoque(async_session, va.id), await _estoque(async_session, vb.id)] == foto

    # receita: 1000 + 240 (troca) - 300 - 100 - 200 = 640 (= o dinheiro que ficou: 1000 - 400 + 40)
    # custo: 10 de A da 1ª camada (400) + 2 de B (60) - 3 que voltaram (120) - 2 da troca que voltaram (80) = 260
    #        (a peça com defeito não voltou: os R$ 40 dela ficam como prejuízo)
    _confere(_delta(await _numeros(test_client, h), antes), receita=D("640"), custo=D("260"), vendas=1, devolucoes=D("600"))

    # cliente: pontos 100 - 30 - 10 - 20 + 24 (troca) = 64; total gasto líquido = 640; uma compra só
    pts, gasto, compras = await _cliente_api(test_client, h, cid)
    assert abs(pts - D("64")) <= C and gasto == D("640") and compras == 1, (pts, gasto, compras)
    await confere_conservacao(async_session, [va.id, vb.id])


async def test_troco_em_dinheiro_nao_vira_pagamento(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    # R$ 79,90 pago com uma nota de 100: o pagamento gravado é 79,90 (o troco não ficou na loja)
    r = await _vende(test_client, h, [(p.id, va.id, 1, "79.90")], pagamentos=[("cash", D("100.00"))])
    assert r.status_code in (200, 201), r.text
    assert await _pagamentos(async_session, r.json()["id"]) == D("79.90")
    # dinheiro + cartão: o troco sai do dinheiro
    r = await _vende(test_client, h, [(p.id, va.id, 1, "79.90")], pagamentos=[("credit_card", D("50.00")), ("cash", D("50.00"))])
    assert r.status_code in (200, 201), r.text
    assert await _pagamentos(async_session, r.json()["id"]) == D("79.90")
    # cartão ou PIX acima do total não tem troco: recusado, sem mexer no estoque
    antes = await _estoque(async_session, va.id)
    r = await _vende(test_client, h, [(p.id, va.id, 1, "79.90")], pagamentos=[("pix", D("100.00"))])
    assert r.status_code == 400 and "Troco só existe em dinheiro" in r.json()["detail"], r.text
    assert await _estoque(async_session, va.id) == antes


async def test_devolucao_abate_no_dia_em_que_aconteceu(test_client, async_session, test_user):
    from app.core.timezone import get_day_range_utc, today_brazil
    from app.models.sale import Sale
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    r = await _vende(test_client, h, [(p.id, va.id, 4, "100.00")])
    venda = r.json()
    ontem = today_brazil() - timedelta(days=1)
    meio_dia_ontem = get_day_range_utc(ontem)[0] + timedelta(hours=12)
    await async_session.execute(update(Sale).where(Sale.id == venda["id"]).values(created_at=meio_dia_ontem))
    await async_session.commit()
    from app.core.dashboard_cache import invalidate_dashboard_cache
    invalidate_dashboard_cache(t_id)

    dia = {d["date"]: D(str(d["total"])) for d in (await test_client.get("/api/v1/dashboard/sales/daily", headers=h, params={"days": 7})).json()["daily"]}
    assert dia[ontem.isoformat()] == D("400")
    assert (await _devolver(test_client, h, venda["id"], [{"sale_item_id": venda["items"][0]["id"], "quantity": 1}])).status_code == 201

    dia = {d["date"]: D(str(d["total"])) for d in (await test_client.get("/api/v1/dashboard/sales/daily", headers=h, params={"days": 7})).json()["daily"]}
    assert dia[ontem.isoformat()] == D("400"), "o dia da venda não muda depois de fechado"
    assert dia[today_brazil().isoformat()] == D("-100"), "a devolução abate no dia em que aconteceu"
    st = (await test_client.get("/api/v1/dashboard/stats", headers=h)).json()["sales"]
    assert D(str(st["total_today"])) == D("-100") and D(str(st["total_yesterday"])) == D("400")


async def test_desconto_da_venda_vale_na_devolucao_e_nos_relatorios(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    antes = await _numeros(test_client, h)
    r = await _vende(test_client, h, [(p.id, va.id, 10, "100.00")], desconto="100.00")   # 10% de desconto
    venda = r.json()
    r = await _devolver(test_client, h, venda["id"], [{"sale_item_id": venda["items"][0]["id"], "quantity": 4}])
    assert D(str(r.json()["total_refund"])) == D("360.00")
    # 900 - 360 = 540; custo 10x40 - 4x40 = 240
    _confere(_delta(await _numeros(test_client, h), antes), receita=D("540"), custo=D("240"), vendas=1, devolucoes=D("360"))


# ───────────────────────────────────────────────────────── aleatório com livro independente
@pytest.mark.parametrize("seed", SEEDS)
async def test_dinheiro_aleatorio_bate_com_o_livro(test_client, async_session, test_user, seed):
    rng = random.Random(seed)
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user, preco_a="100.00", preco_b="120.00", estoque_b=60)
    vc = await _variacao(async_session, p, t_id, "80.00", cor="Rosa", tam="P")
    from datetime import date
    await _lote(async_session, t_id, [(vc, p, 50, 35)], entry_date=date.today() - timedelta(days=5))
    await async_session.commit()
    preco = {va.id: D("100"), vb.id: D("120"), vc.id: D("80")}
    vids = list(preco)
    clientes = [await _cliente(test_client, h, f"Cliente Livro {seed}-{i}") for i in range(3)]

    antes = await _numeros(test_client, h)
    livro = {"bruto": D("0"), "devolvido": D("0"), "vendas": 0}
    cli = {c: {"pts": D("0"), "gasto": D("0"), "compras": 0} for c in clientes}
    base_cli = {c: await _cliente_api(test_client, h, c) for c in clientes}
    vendas = []   # {id, total, sub, desc, cliente, pts, itens:[{id, v, qtd, preco, devolvido}], teve_devolucao, ativa}
    hist = []

    def estoque_ok(v, q):
        return q > 0

    for passo in range(OPS):
        acao = rng.choices(["vender", "devolver", "defeito", "trocar", "cancelar"], weights=[40, 20, 8, 20, 12])[0]
        if acao == "vender":
            escolhidas = rng.sample(vids, k=rng.choice((1, 1, 2)))
            linhas = []
            for v in escolhidas:
                tem = await _estoque(async_session, v)
                if tem > 0:
                    linhas.append((p.id, v, rng.randint(1, min(4, tem)), str(preco[v])))
            if not linhas:
                continue
            sub = sum(D(pr) * q for _p, _v, q, pr in linhas)
            desc = q2(sub * D(rng.choice(("0", "0", "0.05", "0.1"))))
            cliente = rng.choice(clientes + [None])
            total = sub - desc
            pag = rng.choice(([("cash", total)], [("cash", total + D("20"))], [("pix", total)],
                              [("credit_card", q2(total / 2)), ("cash", total - q2(total / 2) + D("5"))]))
            r = await _vende(test_client, h, linhas, cliente=cliente, desconto=str(desc), pagamentos=pag)
            hist.append(f"{passo}: vender {linhas} desc {desc} cliente {cliente} pag {pag} -> {r.status_code}")
            assert r.status_code in (200, 201), f"[seed {seed}] {r.text}\n" + "\n".join(hist[-6:])
            corpo = r.json()
            assert await _pagamentos(async_session, corpo["id"]) == total, f"[seed {seed}] pagamentos != total (troco gravado?)"
            vendas.append({"id": corpo["id"], "total": total, "sub": sub, "desc": desc, "cliente": cliente,
                           "pts": total / 10, "ativa": True, "teve_devolucao": False,
                           "itens": [{"id": it["id"], "v": it["variant_id"], "qtd": it["quantity"], "preco": preco[it["variant_id"]], "devolvido": 0}
                                     for it in corpo["items"]]})
            livro["bruto"] += total
            livro["vendas"] += 1
            if cliente:
                cli[cliente]["pts"] += total / 10
                cli[cliente]["gasto"] += total
                cli[cliente]["compras"] += 1

        elif acao in ("devolver", "defeito", "trocar"):
            cand = [(s, it) for s in vendas if s["ativa"] for it in s["itens"] if it["qtd"] - it["devolvido"] > 0]
            if not cand:
                continue
            s, it = rng.choice(cand)
            qtd = rng.randint(1, it["qtd"] - it["devolvido"])
            linha = {"sale_item_id": it["id"], "quantity": qtd}
            destino = None
            if acao == "trocar":
                opcoes = [v for v in vids if v != it["v"] and await _estoque(async_session, v) >= qtd]
                if not opcoes:
                    continue
                destino = rng.choice(opcoes)
                linha["replacement_variant_id"] = destino
            elif acao == "defeito":
                linha["restock"] = False
            r = await _devolver(test_client, h, s["id"], [linha], motivo=f"livro {passo}", settlement_method="cash")
            hist.append(f"{passo}: {acao} venda {s['id']} {linha} -> {r.status_code}")
            assert r.status_code == 201, f"[seed {seed}] {r.text}\n" + "\n".join(hist[-6:])
            corpo = r.json()
            bruto_linha = it["preco"] * qtd
            pct = (s["desc"] / s["sub"] * 100) if s["desc"] > 0 else D("0")
            reembolso = bruto_linha - (bruto_linha * pct / 100).quantize(C) if pct > 0 else bruto_linha
            assert D(str(corpo["total_refund"])) == reembolso, f"[seed {seed}] reembolso {corpo['total_refund']} != {reembolso}"
            it["devolvido"] += qtd
            s["teve_devolucao"] = True
            livro["devolvido"] += reembolso
            if s["cliente"]:
                cli[s["cliente"]]["pts"] -= s["pts"] * reembolso / s["total"]
                cli[s["cliente"]]["gasto"] -= reembolso
            if destino is not None:
                novo = preco[destino] * qtd
                assert D(str(corpo["net_amount"])) == novo - reembolso
                assert await _pagamentos(async_session, corpo["exchange_sale_id"]) == max(D("0"), novo - reembolso)
                livro["bruto"] += novo
                if s["cliente"]:
                    cli[s["cliente"]]["pts"] += novo / 10
                    cli[s["cliente"]]["gasto"] += novo
                rv = (await test_client.get(f"/api/v1/sales/{corpo['exchange_sale_id']}", headers=h)).json()
                vendas.append({"id": rv["id"], "total": novo, "sub": novo, "desc": D("0"), "cliente": s["cliente"], "pts": novo / 10,
                               "ativa": True, "teve_devolucao": False, "troca": True,
                               "itens": [{"id": x["id"], "v": x["variant_id"], "qtd": x["quantity"], "preco": D(str(x["unit_price"])), "devolvido": 0} for x in rv["items"]]})

        elif acao == "cancelar":
            ativas = [s for s in vendas if s["ativa"]]
            if not ativas:
                continue
            s = rng.choice(ativas)
            r = await test_client.post(f"/api/v1/sales/{s['id']}/cancel", headers=h, params={"reason": f"livro cancelar {passo}"})
            hist.append(f"{passo}: cancelar {s['id']} (teve devolução: {s['teve_devolucao']}) -> {r.status_code}")
            if s["teve_devolucao"]:
                assert r.status_code == 400, f"[seed {seed}] cancelou venda com devolução\n" + "\n".join(hist[-6:])
                continue
            assert r.status_code == 200, f"[seed {seed}] {r.text}"
            s["ativa"] = False
            livro["bruto"] -= s["total"]
            if not s.get("troca"):
                livro["vendas"] -= 1
            if s["cliente"]:
                cli[s["cliente"]]["pts"] -= s["pts"]
                cli[s["cliente"]]["gasto"] -= s["total"]
                if not s.get("troca"):
                    cli[s["cliente"]]["compras"] -= 1

    # custo esperado pelas fontes FIFO (independente do que a devolução gravou): peças que ficaram vendidas
    from app.models.sale import Sale, SaleItem, SaleStatus
    async_session.expire_all()
    ids = [s["id"] for s in vendas if s["ativa"]]
    custo = D("0")
    n_linhas = 0
    if ids:
        for (fontes,) in (await async_session.execute(select(SaleItem.sale_sources).where(SaleItem.sale_id.in_(ids)))).all():
            for f in (fontes or {}).get("sources", []):
                custo += D(str(f["unit_cost"])) * (int(f["quantity_taken"]) - int(f.get("quantity_returned", 0)))
                n_linhas += 1
    # peça com defeito: a fonte NÃO marca a volta, então o custo dela já está acima (prejuízo)
    receita = livro["bruto"] - livro["devolvido"]
    tol = C * (n_linhas + len(hist))  # custo por peça é gravado em centavos (sale_items/return_items)
    _confere(_delta(await _numeros(test_client, h), antes), receita=receita, custo=custo, vendas=livro["vendas"],
             devolucoes=livro["devolvido"], tol_custo=tol)
    for c in clientes:
        pts, gasto, compras = await _cliente_api(test_client, h, c)
        b_pts, b_gasto, b_compras = base_cli[c]
        assert abs((pts - b_pts) - cli[c]["pts"]) <= D("0.05"), f"[seed {seed}] pontos cliente {c}: {pts - b_pts} vs {cli[c]['pts']}"
        assert abs((gasto - b_gasto) - cli[c]["gasto"]) <= C, f"[seed {seed}] total gasto cliente {c}: {gasto - b_gasto} vs {cli[c]['gasto']}"
        assert compras - b_compras == cli[c]["compras"], f"[seed {seed}] compras cliente {c}"
    await confere_conservacao(async_session, vids)


async def test_ranking_de_fornecedor_tira_a_devolucao_do_fornecedor_certo(test_client, async_session, test_user):
    """A peça devolvida volta para a ÚLTIMA camada (FIFO ao contrário): a devolução sai do fornecedor dessa camada."""
    from datetime import date
    from app.models.entry_item import EntryItem
    from app.models.supplier import Supplier
    from tests.test_lot_costs import _loja_api, _produto
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "Legging Fornecedores", "100.00")
    fa = Supplier(name="Fornecedor Antigo A", tenant_id=t_id)
    fb = Supplier(name="Fornecedor Novo B", tenant_id=t_id)
    async_session.add_all([fa, fb])
    await async_session.flush()
    ea = await _lote(async_session, t_id, [(v, p, 10, 40)], entry_date=date.today() - timedelta(days=20))
    eb = await _lote(async_session, t_id, [(v, p, 10, 50)], entry_date=date.today() - timedelta(days=10))
    await async_session.execute(update(EntryItem).where(EntryItem.entry_id == ea.id).values(supplier_id=fa.id))
    await async_session.execute(update(EntryItem).where(EntryItem.entry_id == eb.id).values(supplier_id=fb.id))
    ids = (p.id, v.id, fa.id, fb.id)
    await async_session.commit()
    pid, vid, a_id, b_id = ids

    r = await _vende(test_client, h, [(pid, vid, 15, "100.00")])          # 10 do A (R$40) + 5 do B (R$50)
    venda = r.json()
    assert (await _devolver(test_client, h, venda["id"], [{"sale_item_id": venda["items"][0]["id"], "quantity": 5}])).status_code == 201
    rk = {x["supplier_id"]: x for x in (await test_client.get("/api/v1/suppliers/ranking", headers=h, params={"days": 0})).json()["suppliers"]}
    # as 5 devolvidas voltaram para a camada do B: tudo que ficou vendido é do A
    assert rk[a_id]["revenue"] == 1000.0 and rk[a_id]["cogs"] == 400.0 and rk[a_id]["sold_qty"] == 10, rk[a_id]
    assert rk[b_id]["revenue"] == 0.0 and rk[b_id]["cogs"] == 0.0 and rk[b_id]["sold_qty"] == 0, rk[b_id]
