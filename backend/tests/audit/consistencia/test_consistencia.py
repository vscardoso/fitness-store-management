"""Auditoria de consistência entre telas: o mesmo período/lote tem que mostrar o MESMO dinheiro em todo lugar.

Cada cenário é aleatório com semente fixa, simulado num livro independente (mundo.py) e depois TODAS as telas são
conferidas contra ele. As divergências são coletadas por tela (`problemas`) e o teste falha mostrando todas de uma vez.

Rodar:  cd backend; TEST_DATABASE_URL=sqlite+aiosqlite:///./test_audit_cons.db SECRET_KEY=abcdefghijklmnopqrstuvwxyz0123456789 \
        DATABASE_URL=sqlite:///./test_audit_cons.db ENVIRONMENT=test ./venv/Scripts/python.exe -m pytest tests/audit/consistencia -q --no-cov
"""
import os
import random
from datetime import date

import pytest
from sqlalchemy import select

from app.services.stock_ledger import reconcile
from tests.audit.consistencia.mundo import C, D, Book, devolve, mundo, q2, vende
from tests.test_estresse_dinheiro import _numeros
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
API = "/api/v1"
OPS = int(os.environ.get("AUDIT_OPS", "45"))


def _limpa_caches(t_id):
    from app.core.dashboard_cache import _dashboard_cache, invalidate_dashboard_cache
    _dashboard_cache.clear()
    invalidate_dashboard_cache(t_id)


class Problemas(dict):
    def add(self, tela, msg):
        self.setdefault(tela, []).append(msg)

    def eq(self, tela, nome, got, esperado, tol=C):
        if abs(D(str(got)) - D(str(esperado))) > tol:
            self.add(tela, f"{nome}: tela={got} livro={esperado}")

    def fmt(self):
        return "\n".join(f"[{t}]\n  " + "\n  ".join(m) for t, m in self.items())


async def _roda(client, db, h, ids, book, rng, ops, *, defeito, desc_item):
    hist = []
    for passo in range(ops):
        acao = rng.choices(["vender", "devolver", "defeito", "trocar", "cancelar"],
                           weights=[40, 22, 8 if defeito else 0, 18, 12])[0]
        ativos = [s for s in book.sales if s.active]
        if acao == "vender":
            vs = rng.sample([ids.a, ids.b, ids.c], k=rng.choice((1, 1, 2)))
            spec = []
            for v in vs:
                tem = book.stock(v)
                if tem > 0:
                    q = rng.randint(1, min(6, tem))
                    spec.append((v, q, rng.choice(("0", "0", "5", "12.5")) if desc_item else "0"))
            if not spec:
                continue
            sub = sum(ids.price[v] * q - D(d) for v, q, d in spec)
            desc = q2(sub * D(rng.choice(("0", "0", "0.05", "0.1"))))
            r, s = await vende(client, h, ids, book, spec, desconto=str(desc))
            hist.append(f"{passo}: vender {spec} desc {desc} -> {r.status_code}")
            assert r.status_code in (200, 201), r.text + "\n" + "\n".join(hist[-5:])
        elif acao in ("devolver", "defeito", "trocar"):
            cand = [(s, ln) for s in ativos for ln in s.lines if ln.qty - ln.returned > 0]
            if not cand:
                continue
            s, ln = rng.choice(cand)
            qtd = rng.randint(1, ln.qty - ln.returned)
            destino = None
            if acao == "trocar":
                ops_ = [v for v in (ids.a, ids.b, ids.c) if v != ln.variant_id and book.stock(v) >= qtd]
                if not ops_:
                    continue
                destino = rng.choice(ops_)
            r = await devolve(client, h, book, s, ln, qtd, restock=(acao != "defeito"), troca_para=destino, ids=ids)
            hist.append(f"{passo}: {acao} venda {s.id} qtd {qtd} -> {r.status_code}")
            assert r.status_code == 201, r.text + "\n" + "\n".join(hist[-5:])
        elif acao == "cancelar":
            if not ativos:
                continue
            s = rng.choice(ativos)
            r = await client.post(f"{API}/sales/{s.id}/cancel", headers=h, params={"reason": f"auditoria {passo}"})
            if s.had_return or s.exchange:
                # troca já foi vinculada a uma devolução: o app recusa cancelar a venda com devolução; a venda da troca é livre?
                if s.had_return:
                    assert r.status_code == 400, r.text
                    continue
            assert r.status_code == 200, r.text
            book.cancel(s)
    return hist


async def _confere_tudo(client, db, t_id, h, ids, book, antes, *, defeito, desc_item) -> Problemas:
    P = Problemas()
    _limpa_caches(t_id)
    db.expire_all()
    T = book.totals()
    # ---- camadas: o estoque do livro tem que ser o do banco (FIFO igual)
    from app.models.entry_item import EntryItem
    for vid, layers in book.layers.items():
        for l in layers:
            rem = (await db.execute(select(EntryItem.quantity_remaining).where(EntryItem.id == l.item_id))).scalar()
            if rem != l.rem:
                P.add("camadas FIFO", f"item {l.item_id} (entrada {l.entry_id}): banco={rem} livro={l.rem}")

    # ---- 1. telas que usam a conta única
    n = {k: v - antes[k] for k, v in (await _numeros(client, h)).items()}
    for k in ("inicio_hoje", "inicio_total", "mes", "grafico_7d", "relatorio", "relatorio_dias", "relatorio_vendedores", "resultado"):
        P.eq("receita (telas do início/relatório/resultado)", k, n[k], T.revenue)
    for k in ("inicio_custo_total", "relatorio_custo", "resultado_custo"):
        P.eq("custo", k, n[k], T.cost, tol=C * 40)
    for k in ("inicio_lucro_hoje", "inicio_lucro_total", "mes_lucro", "relatorio_lucro"):
        P.eq("lucro", k, n[k], T.profit, tol=C * 40)
    for k in ("inicio_vendas_hoje", "mes_vendas", "relatorio_vendas"):
        if n[k] != T.sales:
            P.add("quantidade de vendas", f"{k}: tela={n[k]} livro={T.sales}")
    P.eq("devoluções", "relatorio_devolucoes", n["relatorio_devolucoes"], T.refunds)

    # ---- 2. relatório mensal
    m = (await client.get(f"{API}/reports/monthly", headers=h)).json()
    cur = m["result"]["current"]
    P.eq("relatório mensal", "receita", cur["revenue"], T.revenue)
    P.eq("relatório mensal", "custo", cur["cost"], T.cost, tol=C * 40)
    P.eq("relatório mensal", "lucro bruto", cur["gross_profit"], T.profit, tol=C * 40)
    if cur["sales_count"] != T.sales:
        P.add("relatório mensal", f"vendas: tela={cur['sales_count']} livro={T.sales}")
    if cur["units_sold"] != T.pieces_sold - T.pieces_returned_all:
        P.add("relatório mensal", f"peças líquidas: tela={cur['units_sold']} livro={T.pieces_sold - T.pieces_returned_all}")
    P.eq("relatório mensal", "devoluções", m["sales"]["returns_total"], T.refunds)
    rev_top = {}
    for tp in m["sales"]["top_products"]:
        rev_top[tp["product_id"]] = rev_top.get(tp["product_id"], D("0")) + D(str(tp["revenue"]))
    bp = book.by_product()
    for pid, e in bp.items():
        if pid in rev_top:
            P.eq("relatório mensal (mais vendidos)", f"produto {pid} receita", rev_top[pid], e["revenue"], tol=C * 5)
        else:
            P.add("relatório mensal (mais vendidos)", f"produto {pid} sumiu (livro receita {q2(e['revenue'])})")

    # ---- 3. Resultado do mês por produto
    rp = {x["product_id"]: x for x in (await client.get(f"{API}/expenses/resultado-mes/produtos", headers=h)).json()}
    for pid, e in bp.items():
        x = rp.get(pid)
        if not x:
            P.add("resultado do mês por produto", f"produto {pid} ausente")
            continue
        P.eq("resultado do mês por produto", f"p{pid} receita", x["revenue"], e["revenue"], tol=C * 5)
        P.eq("resultado do mês por produto", f"p{pid} custo", x["cost"], e["cost"], tol=C * 40)
    P.eq("resultado do mês por produto", "soma receita = resultado do mês", sum(D(str(x["revenue"])) for x in rp.values()), T.revenue, tol=C * 5)

    # ---- 4. Produtos mais vendidos (relatório de vendas)
    tpj = (await client.get(f"{API}/sales/reports/top-products", headers=h, params={"period": "this_month", "limit": 50})).json()
    tp_rev: dict = {}
    for x in tpj["products"]:
        tp_rev[x["product_id"]] = tp_rev.get(x["product_id"], D("0")) + D(str(x["total_revenue"]))
    for pid, e in bp.items():
        P.eq("produtos mais vendidos", f"p{pid} receita", tp_rev.get(pid, 0), e["revenue"], tol=C * 5)

    # ---- 5. por entrada (lucro por lote, rastreio, lista de entradas)
    be = book.by_entry()
    lista = {e["id"]: e for e in (await client.get(f"{API}/stock-entries/", headers=h, params={"limit": 100})).json()}
    soma_rev = soma_cost = D("0")
    soma_sold_track = 0
    for eid in ids.entries:
        e = be.get(eid, {"qty": D(0), "cost": D(0), "revenue": D(0)})
        a = (await client.get(f"{API}/stock-entries/{eid}/analytics", headers=h))
        if a.status_code != 200:
            P.add("lucro por lote", f"entrada {eid}: HTTP {a.status_code} {a.text[:200]}")
            continue
        a = a.json()
        soma_rev += D(str(a["real_revenue"]))
        soma_cost += D(str(a["cost_of_sold"]))
        if not defeito:     # com defeito a atribuição da receita devolvida à camada é ambígua: só a soma é conferida
            P.eq("lucro por lote", f"e{eid} receita", a["real_revenue"], e["revenue"], tol=C * 5)
            P.eq("lucro por lote", f"e{eid} custo", a["cost_of_sold"], e["cost"], tol=C * 5)
            if abs(D(str(a["total_quantity_sold"])) - e["qty"]) > 0:
                P.add("lucro por lote", f"e{eid} peças vendidas: tela={a['total_quantity_sold']} livro={e['qty']}")
        tr = (await client.get(f"{API}/stock-entries/{eid}/tracking", headers=h)).json()["totals"]
        soma_sold_track += tr["sold"]
        if not tr["closed"]:
            P.add("rastreio do lote", f"e{eid} conta não fecha: {tr}")
        if D(tr["sold"]) != e["qty"]:
            P.add("rastreio do lote", f"e{eid} vendidas: tela={tr['sold']} livro={e['qty']}")
        if tr["removed"] != 0 or tr["with_customer"] != 0:
            P.add("rastreio do lote", f"e{eid} saiu sem venda/com a cliente sem ninguém ter feito isso: {tr}")
        li = lista.get(eid)
        if li and li["items_sold"] != tr["sold"]:
            P.add("lista de entradas", f"e{eid} items_sold: lista={li['items_sold']} rastreio={tr['sold']}")
    P.eq("lucro por lote (soma)", "receita das entradas = receita da loja", soma_rev, T.revenue, tol=C * 10)
    P.eq("lucro por lote (soma)", "custo das entradas = custo da loja", soma_cost, T.cost, tol=C * 40)

    # ---- 6. Saúde do estoque
    f = (await client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()
    st = f["sell_through"]
    # regra do dono (B-25): peça devolvida com DEFEITO não volta ao estoque e CONTA como vendida
    defeito = sum(r["qty"] for r in book.refunds if not r["restock"] and r["sale"].active)
    esperado_vendidas = T.pieces_sold - (T.pieces_returned_all - defeito)
    if st["total_sold"] != esperado_vendidas:
        P.add("saúde do estoque", f"vendidas: tela={st['total_sold']} livro={esperado_vendidas}")
    if st["total_sold"] != soma_sold_track:
        P.add("saúde do estoque x rastreio", f"vendidas: saúde={st['total_sold']} rastreio das entradas={soma_sold_track}")
    if st["other_out"] != 0:
        P.add("saúde do estoque", f"other_out={st['other_out']} mas nenhuma peça saiu sem venda (defeito conta como saída sem venda? livro defeito={sum(r['qty'] for r in book.refunds if not r['restock'])})")
    if T.revenue > 0:
        margem = round(float(T.profit / T.revenue * 100), 1)
        if abs(f["roi"]["avg_margin"] - margem) > 0.2:
            P.add("saúde do estoque", f"margem: saúde={f['roi']['avg_margin']} livro/início={margem}")

    # ---- 7. livro do estoque
    rec = await reconcile(db, t_id)
    if not rec["ok"] or rec["untracked"]:
        P.add("livro do estoque (reconcile)", f"{rec['untracked']} sem_motivo={rec['by_reason'].get('sem_motivo')}")
    return P


SEEDS = [
    pytest.param(11, False, False, id="limpo"),
    pytest.param(23, False, True, id="desconto_no_item"),
    pytest.param(37, True, False, id="com_defeito"),
]


@pytest.mark.parametrize("seed,defeito,desc_item", SEEDS)
async def test_aleatorio_todas_as_telas_batem_com_o_livro(test_client, async_session, test_user, seed, defeito, desc_item):
    rng = random.Random(seed)
    t_id, h, ids, book = await mundo(async_session, test_user)
    _limpa_caches(t_id)
    antes = await _numeros(test_client, h)
    hist = await _roda(test_client, async_session, h, ids, book, rng, OPS, defeito=defeito, desc_item=desc_item)
    P = await _confere_tudo(test_client, async_session, t_id, h, ids, book, antes, defeito=defeito, desc_item=desc_item)
    assert not P, f"seed {seed} (defeito={defeito}, desc_item={desc_item}): {len(book.sales)} vendas, {len(book.refunds)} devoluções\n" + P.fmt()
