"""Auditoria de consistência: mundo de teste + livro independente (FIFO em Python) para comparar todas as telas de dinheiro.

O livro NÃO lê nada do app além dos custos postos (landed) de cada lote, que é dado de entrada. Venda, devolução, troca,
cancelamento, baixa e exclusão são simulados aqui, e as telas são conferidas contra o livro.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from types import SimpleNamespace

from sqlalchemy import select

from tests.test_estresse_vendas_fifo import _variacao
from tests.test_lot_costs import _loja_api, _lote, _produto

D = Decimal
C = D("0.01")


def q2(x) -> Decimal:
    return D(str(x)).quantize(C, rounding=ROUND_HALF_UP)


@dataclass
class Layer:
    item_id: int
    entry_id: int
    variant_id: int
    received: int
    rem: int
    cost: Decimal


@dataclass
class Line:
    item_id: int | None
    variant_id: int
    product_id: int
    qty: int
    price: Decimal
    disc: Decimal = D("0")
    sources: list = field(default_factory=list)   # [[Layer, taken, returned]]
    returned: int = 0                             # total devolvido (volta ou defeito)
    defect: int = 0


@dataclass
class SaleRec:
    id: int
    lines: list
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    exchange: bool = False
    active: bool = True
    had_return: bool = False

    @property
    def pct(self) -> Decimal:
        return (self.discount / self.subtotal) if self.subtotal > 0 and self.discount > 0 else D("0")


class Book:
    def __init__(self):
        self.layers: dict[int, list[Layer]] = {}
        self.sales: list[SaleRec] = []
        self.refunds: list[dict] = []      # {sale, line, qty, amount, restock}
        self.removed: dict[int, int] = {}  # variant -> peças que saíram sem venda

    # ---- estoque
    def stock(self, vid: int) -> int:
        return sum(l.rem for l in self.layers.get(vid, []))

    def take(self, vid: int, qty: int) -> list:
        out, need = [], qty
        for l in self.layers[vid]:
            if need <= 0:
                break
            t = min(l.rem, need)
            if t > 0:
                l.rem -= t
                need -= t
                out.append([l, t, 0])
        assert need == 0, "livro: sem estoque"
        return out

    # ---- venda
    def sell(self, sale_id: int, items_resp: list, lines: list[Line], discount: Decimal, exchange=False) -> SaleRec:
        for ln, it in zip(lines, items_resp):
            ln.item_id = it["id"]
            ln.sources = self.take(ln.variant_id, ln.qty)
        sub = sum((ln.price * ln.qty - ln.disc for ln in lines), D("0"))
        s = SaleRec(sale_id, lines, q2(sub), q2(discount), q2(sub - discount), exchange)
        self.sales.append(s)
        return s

    def line_net(self, s: SaleRec, ln: Line) -> Decimal:
        """Quanto a loja ficou com a linha inteira (preço - desconto do item - parte do desconto da venda)."""
        return (ln.price * ln.qty - ln.disc) * (s.total / s.subtotal if s.subtotal > 0 else D(1))

    def ret(self, s: SaleRec, ln: Line, qty: int, restock: bool, refund: Decimal):
        s.had_return = True
        ln.returned += qty
        if restock:
            need = qty
            for src in reversed(ln.sources):
                free = src[1] - src[2]
                if free <= 0:
                    continue
                v = min(free, need)
                src[0].rem += v
                src[2] += v
                need -= v
                if need == 0:
                    break
        else:
            ln.defect += qty
        self.refunds.append({"sale": s, "line": ln, "qty": qty, "amount": refund, "restock": restock})

    def cancel(self, s: SaleRec):
        s.active = False
        for ln in s.lines:
            for src in ln.sources:
                src[0].rem += src[1] - src[2]

    def remove_fifo(self, vid: int, qty: int):
        need = qty
        for l in self.layers[vid]:
            if need <= 0:
                break
            t = min(l.rem, need)
            l.rem -= t
            need -= t
        assert need == 0
        self.removed[vid] = self.removed.get(vid, 0) + qty

    # ---- totais independentes
    def totals(self):
        active = [s for s in self.sales if s.active]
        gross = sum((s.total for s in active), D("0"))
        refunds = sum((r["amount"] for r in self.refunds if r["sale"].active), D("0"))
        cost_sold = D("0")
        cost_back = D("0")
        pieces_sold = pieces_back = 0
        for s in active:
            for ln in s.lines:
                for l, t, r in ln.sources:
                    cost_sold += l.cost * t
                    cost_back += l.cost * r
                pieces_sold += ln.qty
                pieces_back += sum(src[2] for src in ln.sources)
        return SimpleNamespace(
            gross=gross, refunds=refunds, revenue=gross - refunds, cost=cost_sold - cost_back,
            profit=gross - refunds - (cost_sold - cost_back), sales=sum(1 for s in active if not s.exchange),
            pieces_sold=pieces_sold, pieces_back=pieces_back,
            pieces_returned_all=sum(r["qty"] for r in self.refunds if r["sale"].active),
        )

    def by_entry(self):
        """Por entrada: peças líquidas (volta), custo e receita, atribuindo a devolução à camada que recebeu a peça."""
        out: dict[int, dict] = {}
        for s in self.sales:
            if not s.active:
                continue
            for ln in s.lines:
                unit = self.line_net(s, ln) / ln.qty
                for l, t, r in ln.sources:
                    e = out.setdefault(l.entry_id, {"qty": D("0"), "cost": D("0"), "revenue": D("0")})
                    net = t - r
                    e["qty"] += net
                    e["cost"] += l.cost * net
                    e["revenue"] += unit * net
        return out

    def by_product(self):
        out: dict[int, dict] = {}
        for s in self.sales:
            if not s.active:
                continue
            for ln in s.lines:
                e = out.setdefault(ln.product_id, {"revenue": D("0"), "cost": D("0")})
                e["revenue"] += self.line_net(s, ln)
                e["cost"] += sum((l.cost * t for l, t, r in ln.sources), D("0"))
        for rf in self.refunds:
            if not rf["sale"].active:
                continue
            e = out.setdefault(rf["line"].product_id, {"revenue": D("0"), "cost": D("0")})
            e["revenue"] -= rf["amount"]
        for s in self.sales:
            if not s.active:
                continue
            for ln in s.lines:
                for l, t, r in ln.sources:
                    out[ln.product_id]["cost"] -= l.cost * r
        return out


async def mundo(db, test_user, *, com_extras=True):
    """Loja 1 com 2 produtos, 3 variações e 5 lotes (A em 3 camadas, B com frete do lote, C com desconto do fornecedor).
    Devolve (t_id, headers, ctx) com ctx.ids, ctx.entries e o Book já com as camadas lidas do banco (custo posto)."""
    from app.models.entry_item import EntryItem
    from app.models.stock_entry import StockEntry
    from app.services import lot_cost_service as lcs

    t_id, token, cat = await _loja_api(db, test_user)
    p1, va = await _produto(db, t_id, cat, "Auditoria P1", "100.00")
    vb = await _variacao(db, p1, t_id, "120.00", cor="Verde", tam="G")
    p2, vc = await _produto(db, t_id, cat, "Auditoria P2", "80.00")
    hoje = date.today()
    frete = 300 if com_extras else 0
    e1 = await _lote(db, t_id, [(va, p1, 10, 40)], entry_date=hoje - timedelta(days=30))
    e2 = await _lote(db, t_id, [(va, p1, 15, 45)], entry_date=hoje - timedelta(days=20))
    e3 = await _lote(db, t_id, [(va, p1, 20, 50)], entry_date=hoje - timedelta(days=10))
    e4 = await _lote(db, t_id, [(vb, p1, 60, 30)], frete=frete, entry_date=hoje - timedelta(days=15))
    e5 = await _lote(db, t_id, [(vc, p2, 50, 35)], entry_date=hoje - timedelta(days=5))
    if com_extras:
        e2.discount_amount = D("75.00")   # desconto do fornecedor na entrada
    entries = [e1, e2, e3, e4, e5]
    await lcs.recompute_entries(db, [e.id for e in entries], tenant_id=t_id)
    ids = SimpleNamespace(p1=p1.id, p2=p2.id, a=va.id, b=vb.id, c=vc.id, entries=[e.id for e in entries], cat=cat,
                          prod={va.id: p1.id, vb.id: p1.id, vc.id: p2.id}, price={va.id: D("100"), vb.id: D("120"), vc.id: D("80")})
    await db.commit()
    book = Book()
    rows = (await db.execute(
        select(EntryItem, StockEntry.entry_date).join(StockEntry, StockEntry.id == EntryItem.entry_id)
        .where(EntryItem.tenant_id == t_id, EntryItem.is_active == True)  # noqa: E712
        .order_by(EntryItem.variant_id, StockEntry.entry_date, EntryItem.id))).all()
    for it, _dt in rows:
        book.layers.setdefault(it.variant_id, []).append(
            Layer(it.id, it.entry_id, it.variant_id, it.quantity_received, it.quantity_remaining, D(str(it.landed_unit_cost))))
    return t_id, {"Authorization": f"Bearer {token}"}, ids, book


async def vende(client, h, ids, book, lines_spec, *, desconto="0", cliente=None, pagamento=None):
    """lines_spec = [(variant_id, qty, item_disc)]. Devolve (resp, SaleRec|None)."""
    lines = [Line(None, v, ids.prod[v], q, ids.price[v], D(str(d))) for v, q, d in lines_spec]
    sub = sum((ln.price * ln.qty - ln.disc for ln in lines), D("0"))
    total = sub - D(desconto)
    r = await client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash", "customer_id": cliente, "discount_amount": str(desconto),
        "items": [{"product_id": ln.product_id, "variant_id": ln.variant_id, "quantity": ln.qty, "unit_price": str(ln.price),
                   "discount_amount": str(ln.disc)} for ln in lines],
        "payments": [{"amount": str(pagamento or total), "payment_method": "cash"}]})
    if r.status_code not in (200, 201):
        return r, None
    body = r.json()
    s = book.sell(body["id"], body["items"], lines, D(str(desconto)))
    return r, s


async def devolve(client, h, book, s: SaleRec, ln: Line, qty: int, *, restock=True, troca_para=None, ids=None):
    linha = {"sale_item_id": ln.item_id, "quantity": qty}
    if not restock:
        linha["restock"] = False
    if troca_para:
        linha["replacement_variant_id"] = troca_para
    r = await client.post(f"/api/v1/returns/{s.id}", headers=h, json={
        "reason": "auditoria", "settlement_method": "cash", "items": [linha]})
    if r.status_code != 201:
        return r
    body = r.json()
    book.ret(s, ln, qty, restock, D(str(body["total_refund"])))
    if troca_para:
        rv = (await client.get(f"/api/v1/sales/{body['exchange_sale_id']}", headers=h)).json()
        nl = Line(None, troca_para, ids.prod[troca_para], qty, ids.price[troca_para])
        s2 = book.sell(rv["id"], rv["items"], [nl], D("0"), exchange=True)
        assert q2(rv["total_amount"]) == s2.total
    return r
