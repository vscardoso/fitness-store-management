"""
Relatórios de vendas por período e "Produtos mais vendidos" pela conta única (`money_ledger`):
venda válida = concluída, parcialmente devolvida ou devolvida; devolução abate no dia em que aconteceu;
cancelada fora; receita do item = valor pago (desconto da venda rateado).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.services import money_ledger


async def period_report(db: AsyncSession, tenant_id: int, start_date: date, end_date: date, sales: list) -> dict:
    """`sales` = vendas do período (todas as situações), só para contagens e quebra por status."""
    totals = await money_ledger.period_totals(db, tenant_id, start_date, end_date)
    by_product = await money_ledger.period_by_product(db, tenant_id, start_date, end_date)
    top = sorted((p for p in by_product if p["pieces_net"] > 0 or p["revenue"] > 0),
                 key=lambda p: (-p["revenue"], p["name"]))[:10]

    status_breakdown: dict = {}
    for s in sales:
        status_breakdown[s.status] = status_breakdown.get(s.status, 0) + 1
    cancelled = sum(1 for s in sales if getattr(s.status, "value", s.status) == "cancelled")
    days = (end_date - start_date).days + 1
    revenue = float(totals.revenue)
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "period_days": days,
        "total_sales": revenue,
        "sales_count": len(sales),
        "active_sales_count": totals.sales_count + totals.exchange_sales_count,
        "cancelled_sales_count": cancelled,
        "average_ticket": totals.average_ticket,
        "daily_average": revenue / days if days > 0 else 0.0,
        "status_breakdown": status_breakdown,
        "top_products": [
            {"product_id": p["product_id"], "product_name": p["name"],
             "quantity_sold": p["pieces_net"], "revenue": p["revenue"]}
            for p in top
        ],
    }


async def top_products_ranking(
    db: AsyncSession, tenant_id: int, start_date: Optional[date], end_date: Optional[date], limit: int,
) -> dict:
    """Ranking por produto+variação, líquido de devolução e com o valor pago. Devolve os mesmos campos da rota antiga."""
    rows = await money_ledger.period_by_variant(db, tenant_id, start_date, end_date)

    # SaleItem.product_id é legado: completa pelo produto da variação
    var_ids = {v for (_p, v) in rows if v is not None}
    var_product = {}
    if var_ids:
        var_product = dict((await db.execute(
            select(ProductVariant.id, ProductVariant.product_id).where(ProductVariant.id.in_(var_ids)))).all())
    merged: dict = {}
    for (pid, vid), r in rows.items():
        pid = pid if pid is not None else var_product.get(vid)
        merged[(pid, vid)] = r

    pids = {p for (p, _v) in merged if p is not None}
    prods = {}
    if pids:
        prods = {r.id: r for r in (await db.execute(
            select(Product.id, Product.name, Product.brand, Product.base_price, Category.name.label("cat"))
            .outerjoin(Category, Product.category_id == Category.id)
            .where(Product.id.in_(pids)))).all()}
    variants = {}
    if var_ids:
        variants = {r.id: r for r in (await db.execute(
            select(ProductVariant.id, ProductVariant.sku, ProductVariant.size, ProductVariant.color)
            .where(ProductVariant.id.in_(var_ids)))).all()}

    live = []
    for (pid, vid), r in merged.items():
        qty = r["sold"] - r["returned"]
        rev = float(r["revenue"])
        if qty <= 0 and rev <= 0:
            continue   # vendida e devolvida por inteiro: some do ranking
        if pid not in prods:
            continue
        live.append((pid, vid, qty, rev, float(r["cost"])))
    live.sort(key=lambda x: (-x[2], -x[3]))
    total_quantity = float(sum(x[2] for x in live))
    total_revenue = sum(x[3] for x in live)

    products = []
    max_q = max((x[2] for x in live[:limit]), default=0)
    for idx, (pid, vid, qty, rev, cost) in enumerate(live[:limit]):
        p, v = prods[pid], variants.get(vid)
        profit = rev - cost
        label = " • ".join(str(x) for x in ((v.color if v else None), (v.size if v else None)) if x) or None
        products.append({
            "ranking": idx + 1, "product_id": pid, "variant_id": vid, "product_name": p.name,
            "brand": p.brand or "", "sku": (v.sku if v else None) or "",
            "variant_size": v.size if v else None, "variant_color": v.color if v else None,
            "variant_label": label, "category": p.cat or "Sem categoria",
            "current_price": float(p.base_price or 0), "quantity_sold": qty,
            "total_revenue": rev, "total_cost": cost, "total_profit": profit,
            "profit_margin": round(profit / rev * 100, 1) if rev > 0 else 0,
            "share_quantity": round(qty / total_quantity * 100, 1) if total_quantity > 0 else 0,
            "share_revenue": round(rev / total_revenue * 100, 1) if total_revenue > 0 else 0,
            "progress": round(qty / max_q * 100, 1) if max_q > 0 else 0,
        })
    return {"total_products": len(products), "total_quantity_sold": int(total_quantity),
            "total_revenue": total_revenue, "products": products}
