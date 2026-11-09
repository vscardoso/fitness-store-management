"""
Conta única de dinheiro das vendas (receita, custo e lucro) usada por TODAS as telas: início, relatório de vendas,
Resultado do Mês e PDF. Antes cada tela tinha a sua regra e os números não batiam (o relatório não descontava
devolução e contava a troca duas vezes; o total geral do início zerava vendas parcialmente devolvidas; o "este mês"
somava venda cancelada; o Resultado do Mês tirava inteira a venda que teve uma peça devolvida).

Regras (decisão do Victor, 28/10/2026):
- Receita LÍQUIDA: vendas do período - devoluções do período. A venda conta no dia em que foi feita e a devolução
  abate no dia em que aconteceu (o mês fechado não muda depois).
- Venda válida: concluída, parcialmente devolvida ou devolvida por inteiro (a devolução é que abate). Cancelada e
  pendente não contam, nem as devoluções de venda cancelada (cancelar desfaz tudo).
- Troca: a venda nova da troca soma o valor das peças novas e a devolução abate o valor das devolvidas, então o
  resultado é o que de fato entrou. Ela não conta como "venda" para quantidade e ticket médio.
- Custo: custo FIFO das peças vendidas - custo das peças que VOLTARAM ao estoque. Peça devolvida com defeito
  (não volta) continua como custo: é prejuízo.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import get_period_range_utc
from app.models.sale import Sale, SaleItem, SaleStatus
from app.models.sale_return import ReturnItem, SaleReturn

BR = ZoneInfo("America/Sao_Paulo")
VALID_STATUS = (SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED, SaleStatus.REFUNDED)
D0 = Decimal("0")


def _d(v) -> Decimal:
    return Decimal(str(v or 0))


def br_day(dt: datetime) -> date:
    """Dia no Brasil de um created_at gravado em UTC (sem fuso)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(BR).date()


@dataclass
class DayTotals:
    gross: Decimal = D0
    refunds: Decimal = D0
    sales: int = 0
    cost_sold: Decimal = D0
    cost_back: Decimal = D0

    @property
    def revenue(self) -> Decimal:
        return self.gross - self.refunds

    @property
    def cost(self) -> Decimal:
        return self.cost_sold - self.cost_back

    @property
    def profit(self) -> Decimal:
        return self.revenue - self.cost


@dataclass
class MoneyTotals:
    gross_sales: Decimal = D0          # valor das vendas válidas do período (inclui as de troca)
    refunds: Decimal = D0              # devoluções do período (de vendas não canceladas)
    sales_count: int = 0               # vendas válidas, sem as de troca
    exchange_sales_count: int = 0
    returns_count: int = 0
    cost_sold: Decimal = D0            # custo FIFO das peças vendidas no período
    cost_returned: Decimal = D0        # custo das peças que voltaram ao estoque no período
    pieces_sold: int = 0
    pieces_returned: int = 0
    discount_total: Decimal = D0
    gift_cost: Decimal = D0            # custo posto dos brindes dados no período, menos o que voltou (NÃO é custo de venda)
    gift_count: int = 0                # brindes dados no período (cancelados ficam de fora)
    gift_pieces: int = 0               # peças dadas de brinde no período, menos as devolvidas
    days: dict = field(default_factory=lambda: defaultdict(DayTotals))
    by_seller: dict = field(default_factory=lambda: defaultdict(lambda: {"gross": D0, "refunds": D0, "sales": 0}))
    by_payment: dict = field(default_factory=lambda: defaultdict(lambda: {"total": D0, "count": 0}))
    sale_ids: list = field(default_factory=list)

    @property
    def revenue(self) -> Decimal:
        return self.gross_sales - self.refunds

    @property
    def cost(self) -> Decimal:
        return self.cost_sold - self.cost_returned

    @property
    def profit(self) -> Decimal:
        return self.revenue - self.cost

    @property
    def margin_percent(self) -> float:
        return float(self.profit / self.revenue * 100) if self.revenue > 0 else 0.0

    @property
    def average_ticket(self) -> float:
        return float(self.revenue / self.sales_count) if self.sales_count else 0.0


async def period_totals(
    db: AsyncSession,
    tenant_id: Optional[int],
    start: Optional[date],
    end: Optional[date],
    *,
    seller_id: Optional[int] = None,
) -> MoneyTotals:
    """Totais do período [start, end] em dias do Brasil. start/end None = desde sempre / até agora."""
    t = MoneyTotals()
    s_utc = e_utc = None
    if start and end:
        s_utc, e_utc = get_period_range_utc(start, end)

    def in_range(col):
        conds = []
        if s_utc is not None:
            conds += [col >= s_utc, col <= e_utc]
        return conds

    def tenant(col):
        return [col == tenant_id] if tenant_id is not None else []   # None = todas as lojas (uso interno)

    exchange_ids = select(SaleReturn.exchange_sale_id).where(
        *tenant(SaleReturn.tenant_id), SaleReturn.exchange_sale_id.isnot(None), SaleReturn.is_active == True,  # noqa: E712
    )

    # 1. Vendas válidas feitas no período
    sale_filter = [
        *tenant(Sale.tenant_id), Sale.is_active == True, Sale.status.in_(VALID_STATUS), *in_range(Sale.created_at),  # noqa: E712
    ]
    if seller_id:
        sale_filter.append(Sale.seller_id == seller_id)
    sales = (await db.execute(
        select(Sale.id, Sale.created_at, Sale.total_amount, Sale.discount_amount, Sale.seller_id, Sale.payment_method,
               Sale.id.in_(exchange_ids).label("is_exchange"))
        .where(and_(*sale_filter)))).all()
    for sid, created, total, disc, seller, method, is_exchange in sales:
        day = t.days[br_day(created)]
        amount = _d(total)
        t.gross_sales += amount
        t.discount_total += _d(disc)
        day.gross += amount
        t.sale_ids.append(sid)
        if is_exchange:
            t.exchange_sales_count += 1
        else:
            t.sales_count += 1
            day.sales += 1
        if seller is not None:
            t.by_seller[seller]["gross"] += amount
            if not is_exchange:
                t.by_seller[seller]["sales"] += 1
        key = getattr(method, "value", method) or "outro"
        t.by_payment[key]["total"] += amount
        t.by_payment[key]["count"] += 0 if is_exchange else 1

    if sales:
        items = (await db.execute(
            select(SaleItem.quantity, SaleItem.unit_cost, Sale.created_at)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(and_(*sale_filter), SaleItem.is_active == True))).all()  # noqa: E712
        for qty, cost, created in items:
            c = _d(cost) * int(qty)
            t.cost_sold += c
            t.pieces_sold += int(qty)
            t.days[br_day(created)].cost_sold += c

    # 2. Devoluções feitas no período (de vendas não canceladas): abatem no dia da devolução
    ret_filter = [
        *tenant(SaleReturn.tenant_id), SaleReturn.is_active == True, SaleReturn.status == "completed",  # noqa: E712
        Sale.status != SaleStatus.CANCELLED, *in_range(SaleReturn.created_at),
    ]
    if seller_id:
        ret_filter.append(Sale.seller_id == seller_id)
    rets = (await db.execute(
        select(SaleReturn.id, SaleReturn.created_at, SaleReturn.total_refund, Sale.seller_id)
        .join(Sale, Sale.id == SaleReturn.sale_id).where(and_(*ret_filter)))).all()
    for _rid, created, refund, seller in rets:
        amount = _d(refund)
        t.refunds += amount
        t.returns_count += 1
        t.days[br_day(created)].refunds += amount
        if seller is not None:
            t.by_seller[seller]["refunds"] += amount
    if rets:
        ritems = (await db.execute(
            select(ReturnItem.quantity_returned, ReturnItem.unit_cost, ReturnItem.restock, SaleReturn.created_at)
            .join(SaleReturn, SaleReturn.id == ReturnItem.return_id)
            .join(Sale, Sale.id == SaleReturn.sale_id)
            .where(and_(*ret_filter), ReturnItem.is_active == True))).all()  # noqa: E712
        for qty, cost, restock, created in ritems:
            t.pieces_returned += int(qty)
            if restock:  # peça com defeito não volta: o custo dela fica (prejuízo)
                c = _d(cost) * int(qty)
                t.cost_returned += c
                t.days[br_day(created)].cost_back += c
    if seller_id is None:
        from app.models.gift import GIFT_CANCELLED, Gift, GiftItem, GiftReturn
        given = (await db.execute(
            select(Gift.id, Gift.total_cost, func.coalesce(func.sum(GiftItem.quantity), 0))
            .join(GiftItem, GiftItem.gift_id == Gift.id)
            .where(*tenant(Gift.tenant_id), Gift.is_active == True, Gift.status != GIFT_CANCELLED, *in_range(Gift.created_at))  # noqa: E712
            .group_by(Gift.id, Gift.total_cost))).all()
        for _gid, cost, pieces in given:
            t.gift_cost += _d(cost)
            t.gift_count += 1
            t.gift_pieces += int(pieces or 0)
        back = (await db.execute(
            select(GiftReturn.cost, GiftReturn.quantity).join(Gift, Gift.id == GiftReturn.gift_id)
            .where(*tenant(GiftReturn.tenant_id), Gift.status != GIFT_CANCELLED, *in_range(GiftReturn.created_at)))).all()  # noqa: E712
        for cost, qty in back:
            t.gift_cost -= _d(cost)
            t.gift_pieces -= int(qty or 0)
    return t


def day_range(days_back: int, today: date) -> tuple[date, date]:
    return today - timedelta(days=days_back - 1), today


async def period_by_product(
    db: AsyncSession,
    tenant_id: Optional[int],
    start: Optional[date],
    end: Optional[date],
) -> list[dict]:
    """Resultado do período por PRODUTO, pelas mesmas regras de `period_totals` (a soma bate com o total):
    - receita de cada item = parte do valor da venda proporcional ao subtotal do item (desconto da venda rateado);
    - devolução abate do produto devolvido, no período em que aconteceu (valor da devolução rateado pelos itens);
    - custo = FIFO das peças vendidas - custo das peças que voltaram ao estoque (defeito fica como custo).
    """
    from app.models.product import Product

    s_utc = e_utc = None
    if start and end:
        s_utc, e_utc = get_period_range_utc(start, end)

    def in_range(col):
        return [col >= s_utc, col <= e_utc] if s_utc is not None else []

    def tenant(col):
        return [col == tenant_id] if tenant_id is not None else []

    rows: dict = defaultdict(lambda: {"revenue": D0, "cost": D0, "sold": 0, "returned": 0, "gross": D0})

    sale_filter = [*tenant(Sale.tenant_id), Sale.is_active == True, Sale.status.in_(VALID_STATUS), *in_range(Sale.created_at)]  # noqa: E712
    items = (await db.execute(
        select(SaleItem.sale_id, SaleItem.product_id, SaleItem.quantity, SaleItem.unit_cost, SaleItem.subtotal,
               SaleItem.unit_price, Sale.total_amount)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(and_(*sale_filter), SaleItem.is_active == True))).all()  # noqa: E712
    sub_by_sale: dict = defaultdict(lambda: D0)
    for sid, _pid, qty, _c, sub, price, _t in items:
        sub_by_sale[sid] += _d(sub) if sub is not None else _d(price) * int(qty)
    for sid, pid, qty, cost, sub, price, total in items:
        item_sub = _d(sub) if sub is not None else _d(price) * int(qty)
        base = sub_by_sale[sid]
        share = (item_sub / base * _d(total)) if base > 0 else D0
        r = rows[pid]
        r["revenue"] += share
        r["gross"] += share
        r["cost"] += _d(cost) * int(qty)
        r["sold"] += int(qty)

    ret_filter = [
        *tenant(SaleReturn.tenant_id), SaleReturn.is_active == True, SaleReturn.status == "completed",  # noqa: E712
        Sale.status != SaleStatus.CANCELLED, *in_range(SaleReturn.created_at),
    ]
    ritems = (await db.execute(
        select(SaleReturn.id, SaleReturn.total_refund, ReturnItem.product_id, ReturnItem.quantity_returned,
               ReturnItem.unit_cost, ReturnItem.restock, ReturnItem.refund_amount, ReturnItem.unit_price)
        .join(SaleReturn, SaleReturn.id == ReturnItem.return_id)
        .join(Sale, Sale.id == SaleReturn.sale_id)
        .where(and_(*ret_filter), ReturnItem.is_active == True))).all()  # noqa: E712
    ref_by_ret: dict = defaultdict(lambda: D0)
    for rid, _tot, _pid, qty, _c, _rs, ref, price in ritems:
        ref_by_ret[rid] += _d(ref) if ref is not None else _d(price) * int(qty)
    for rid, tot, pid, qty, cost, restock, ref, price in ritems:
        item_ref = _d(ref) if ref is not None else _d(price) * int(qty)
        base = ref_by_ret[rid]
        share = (item_ref / base * _d(tot)) if base > 0 else D0
        r = rows[pid]
        r["revenue"] -= share
        r["returned"] += int(qty)
        if restock:
            r["cost"] -= _d(cost) * int(qty)

    names = {}
    ids = [p for p in rows if p is not None]
    if ids:
        names = dict((await db.execute(select(Product.id, Product.name).where(Product.id.in_(ids)))).all())
    out = []
    for pid, r in rows.items():
        pieces = r["sold"] - r["returned"]
        profit = r["revenue"] - r["cost"]
        out.append({
            "product_id": pid,
            "name": names.get(pid) or "Produto sem cadastro",
            "pieces_sold": r["sold"],
            "pieces_returned": r["returned"],
            "pieces_net": pieces,
            "revenue": round(float(r["revenue"]), 2),
            "cost": round(float(r["cost"]), 2),
            "profit": round(float(profit), 2),
            "average_price": round(float(r["gross"] / r["sold"]), 2) if r["sold"] else 0.0,
            "average_cost": round(float(r["cost"] / pieces), 2) if pieces > 0 else 0.0,
            "margin_percent": round(float(profit / r["revenue"] * 100), 1) if r["revenue"] > 0 else 0.0,
        })
    out.sort(key=lambda x: (-x["profit"], x["name"]))
    return out


async def period_by_variant(
    db: AsyncSession,
    tenant_id: Optional[int],
    start: Optional[date],
    end: Optional[date],
) -> dict:
    """Igual a `period_by_product`, mas por (product_id, variant_id). Devolve
    {(product_id, variant_id): {"revenue", "cost", "sold", "returned"}} (Decimal/int), mesma conta única:
    valor pago rateado pelo subtotal do item, devolução abate no período em que aconteceu, custo das
    peças que voltaram abate, defeito fica como custo."""
    s_utc = e_utc = None
    if start and end:
        s_utc, e_utc = get_period_range_utc(start, end)

    def in_range(col):
        return [col >= s_utc, col <= e_utc] if s_utc is not None else []

    def tenant(col):
        return [col == tenant_id] if tenant_id is not None else []

    rows: dict = defaultdict(lambda: {"revenue": D0, "cost": D0, "sold": 0, "returned": 0})

    sale_filter = [*tenant(Sale.tenant_id), Sale.is_active == True, Sale.status.in_(VALID_STATUS), *in_range(Sale.created_at)]  # noqa: E712
    items = (await db.execute(
        select(SaleItem.sale_id, SaleItem.product_id, SaleItem.variant_id, SaleItem.quantity, SaleItem.unit_cost,
               SaleItem.subtotal, SaleItem.unit_price, Sale.total_amount)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(and_(*sale_filter), SaleItem.is_active == True))).all()  # noqa: E712
    sub_by_sale: dict = defaultdict(lambda: D0)
    for sid, _p, _v, qty, _c, sub, price, _t in items:
        sub_by_sale[sid] += _d(sub) if sub is not None else _d(price) * int(qty)
    for sid, pid, vid, qty, cost, sub, price, total in items:
        item_sub = _d(sub) if sub is not None else _d(price) * int(qty)
        base = sub_by_sale[sid]
        r = rows[(pid, vid)]
        r["revenue"] += (item_sub / base * _d(total)) if base > 0 else D0
        r["cost"] += _d(cost) * int(qty)
        r["sold"] += int(qty)

    ret_filter = [
        *tenant(SaleReturn.tenant_id), SaleReturn.is_active == True, SaleReturn.status == "completed",  # noqa: E712
        Sale.status != SaleStatus.CANCELLED, *in_range(SaleReturn.created_at),
    ]
    ritems = (await db.execute(
        select(SaleReturn.id, SaleReturn.total_refund, ReturnItem.product_id, ReturnItem.variant_id,
               ReturnItem.quantity_returned, ReturnItem.unit_cost, ReturnItem.restock, ReturnItem.refund_amount,
               ReturnItem.unit_price)
        .join(SaleReturn, SaleReturn.id == ReturnItem.return_id)
        .join(Sale, Sale.id == SaleReturn.sale_id)
        .where(and_(*ret_filter), ReturnItem.is_active == True))).all()  # noqa: E712
    ref_by_ret: dict = defaultdict(lambda: D0)
    for rid, _t, _p, _v, qty, _c, _rs, ref, price in ritems:
        ref_by_ret[rid] += _d(ref) if ref is not None else _d(price) * int(qty)
    for rid, tot, pid, vid, qty, cost, restock, ref, price in ritems:
        item_ref = _d(ref) if ref is not None else _d(price) * int(qty)
        base = ref_by_ret[rid]
        r = rows[(pid, vid)]
        r["revenue"] -= (item_ref / base * _d(tot)) if base > 0 else D0
        r["returned"] += int(qty)
        if restock:
            r["cost"] -= _d(cost) * int(qty)
    return dict(rows)
