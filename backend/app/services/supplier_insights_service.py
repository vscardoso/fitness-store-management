"""
Análises de fornecedores (Fase 2): ranking por giro e margem, comparação de custo e lista de reposição.

Tudo é calculado a partir de dados que já existem:
  - entry_items: quantidade comprada/restante, custo e fornecedor de cada compra;
  - sale_items.sale_sources: de qual item de entrada (portanto de qual fornecedor) saiu cada unidade
    vendida, com o custo FIFO;
  - supplier_products: último custo por fornecedor x produto.

Consultas por COLUNAS (sem relacionamentos ORM) para não cair em carregamento preguiçoso no async.
"""
from __future__ import annotations

import math
import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import today_brazil
from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sale import Sale, SaleItem, SaleStatus
from app.models.sale_return import ReturnItem
from app.models.stock_entry import StockEntry
from app.models.supplier import Supplier
from app.models.supplier_product import SupplierProduct

# Vendas que contam para giro/margem (as estornadas por completo ficam de fora)
_COUNTED_STATUSES = (SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED)

# Peso do score: giro (sell-through) e margem. Documentado no endpoint.
SCORE_WEIGHT_SELL_THROUGH = 0.6
SCORE_WEIGHT_MARGIN = 0.4
# Abaixo disso o fornecedor ainda não tem dado suficiente para ser julgado
MIN_UNITS_FOR_SCORE = 5


def _f(value: Any) -> float:
    return float(value) if value is not None else 0.0


def _round2(value: float) -> float:
    return round(value + 0.0, 2)


def compute_score(sell_through_pct: float, margin_pct: Optional[float]) -> Optional[int]:
    """Score 0..100 = 60% giro + 40% margem (margem limitada a 0..100).
    Sem margem (ainda não vendeu) não há score."""
    if margin_pct is None:
        return None
    st = max(0.0, min(100.0, sell_through_pct))
    mg = max(0.0, min(100.0, margin_pct))
    return int(round(SCORE_WEIGHT_SELL_THROUGH * st + SCORE_WEIGHT_MARGIN * mg))


def rating_for(score: Optional[int], low_data: bool) -> str:
    if score is None or low_data:
        return "sem_dados"
    if score >= 70:
        return "otimo"
    if score >= 45:
        return "bom"
    return "atencao"


def _norm(text: str) -> str:
    t = unicodedata.normalize("NFD", text or "")
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", t).strip().casefold()


def whatsapp_message(supplier_name: str, lines: List[Dict[str, Any]]) -> str:
    """Texto pronto para enviar ao fornecedor (pt-BR, sem preço: o lojista negocia)."""
    parts = [f"Olá, {supplier_name}! Segue minha lista de reposição:", ""]
    for ln in lines:
        variant = " · ".join(p for p in (ln.get("size"), ln.get("color")) if p)
        label = f"{ln['product_name']} ({variant})" if variant else ln["product_name"]
        parts.append(f"- {label}: {ln['suggested_qty']} un")
    parts += ["", "Pode me passar disponibilidade e preço? Obrigado!"]
    return "\n".join(parts)


class SupplierInsightsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _discount_units(self, tenant_id: int, only_entries: Optional[set] = None) -> Dict[int, float]:
        """{item da entrada: desconto por peça} só das entradas que têm algum desconto (geral ou de fornecedor).
        É a mesma conta do rateio do custo, calculada sem gravar: relatórios de fornecedor mostram o preço PAGO.
        `only_entries`: calcula só destas entradas (consulta de um produto não precisa recalcular a loja inteira)."""
        if only_entries is not None and not only_entries:
            return {}
        from app.models.entry_supplier_discount import EntrySupplierDiscount
        from app.services import lot_cost_service
        q1 = select(StockEntry.id).where(
            StockEntry.tenant_id == tenant_id, StockEntry.is_active == True, StockEntry.discount_amount > 0  # noqa: E712
        )
        q2 = select(EntrySupplierDiscount.entry_id).where(
            EntrySupplierDiscount.tenant_id == tenant_id, EntrySupplierDiscount.is_active == True,  # noqa: E712
            EntrySupplierDiscount.amount > 0,
        )
        if only_entries is not None:
            q1 = q1.where(StockEntry.id.in_(only_entries))
            q2 = q2.where(EntrySupplierDiscount.entry_id.in_(only_entries))
        ids = set((await self.db.execute(q1)).scalars().all())
        ids |= set((await self.db.execute(q2)).scalars().all())
        if not ids:
            return {}
        calc = await lot_cost_service.recompute_entries(self.db, ids, tenant_id=tenant_id, dry_run=True)
        out: Dict[int, float] = {}
        for data in calc.values():
            for item_id, (_freight, disc) in data.get("items", {}).items():
                if disc:
                    out[item_id] = float(disc)
        return out

    async def paid_cost_history(self, tenant_id: int, product_id: Optional[int] = None) -> Dict[tuple, List[tuple]]:
        """(fornecedor, produto) -> [(data, preço pago médio por peça)], já com os descontos. `product_id` limita a um produto."""
        return await self._cost_history(tenant_id, product_id)

    # ------------------------------------------------------------------ ranking
    async def ranking(self, tenant_id: int, days: int = 180) -> Dict[str, Any]:
        """Ranking de fornecedores pelas compras feitas nos últimos `days` dias (0 = todas)."""
        since = today_brazil() - timedelta(days=days) if days and days > 0 else None

        stmt = (
            select(
                EntryItem.id,
                EntryItem.supplier_id,
                EntryItem.product_id,
                EntryItem.entry_id,
                EntryItem.quantity_received,
                EntryItem.quantity_remaining,
                EntryItem.unit_cost,
                StockEntry.entry_date,
            )
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(
                EntryItem.tenant_id == tenant_id,
                EntryItem.is_active == True,  # noqa: E712
                StockEntry.is_active == True,  # noqa: E712
                EntryItem.supplier_id.is_not(None),
            )
        )
        if since:
            stmt = stmt.where(StockEntry.entry_date >= since)
        rows = (await self.db.execute(stmt)).all()
        disc_units = await self._discount_units(tenant_id)

        agg: Dict[int, Dict[str, Any]] = {}
        item_to_supplier: Dict[int, int] = {}
        for item_id, sup_id, prod_id, entry_id, recv, remaining, cost, entry_date in rows:
            item_to_supplier[item_id] = sup_id
            a = agg.setdefault(sup_id, {
                "purchased_qty": 0, "purchased_cost": 0.0, "remaining_qty": 0, "remaining_cost": 0.0,
                "products": set(), "entries": set(), "last_purchase": None,
                "revenue": 0.0, "cogs": 0.0, "units_sold_fifo": 0,
            })
            c = max(_f(cost) - disc_units.get(item_id, 0.0), 0.0)   # preço pago: tabela da compra menos o desconto
            a["purchased_qty"] += recv
            a["purchased_cost"] += recv * c
            a["remaining_qty"] += remaining
            a["remaining_cost"] += remaining * c
            if prod_id:
                a["products"].add(prod_id)
            a["entries"].add(entry_id)
            if a["last_purchase"] is None or entry_date > a["last_purchase"]:
                a["last_purchase"] = entry_date

        await self._attribute_sales(tenant_id, item_to_supplier, agg)

        names = await self._supplier_names(tenant_id, list(agg.keys()))
        result: List[Dict[str, Any]] = []
        for sup_id, a in agg.items():
            sold_qty = max(0, a["purchased_qty"] - a["remaining_qty"])
            sell_through = (sold_qty / a["purchased_qty"] * 100) if a["purchased_qty"] else 0.0
            revenue, cogs = a["revenue"], a["cogs"]
            profit = revenue - cogs
            margin = (profit / revenue * 100) if revenue > 0 else None
            low_data = a["purchased_qty"] < MIN_UNITS_FOR_SCORE
            score = compute_score(sell_through, margin)
            result.append({
                "supplier_id": sup_id,
                "supplier_name": names.get(sup_id, f"Fornecedor {sup_id}"),
                "entries": len(a["entries"]),
                "products": len(a["products"]),
                "purchased_qty": a["purchased_qty"],
                "purchased_cost": _round2(a["purchased_cost"]),
                "sold_qty": sold_qty,
                "sell_through_pct": _round2(sell_through),
                "revenue": _round2(revenue),
                "cogs": _round2(cogs),
                "profit": _round2(profit),
                "margin_pct": _round2(margin) if margin is not None else None,
                "stock_qty": a["remaining_qty"],
                "stock_cost": _round2(a["remaining_cost"]),
                "last_purchase_date": a["last_purchase"].isoformat() if a["last_purchase"] else None,
                "score": score,
                "rating": rating_for(score, low_data),
                "low_data": low_data,
            })
        # Com score primeiro (maior->menor), depois quem ainda não tem dado
        result.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0), -r["purchased_cost"]))
        for pos, r in enumerate(result, start=1):
            r["position"] = pos
        return {
            "days": days,
            "since": since.isoformat() if since else None,
            "score_formula": "60% giro (vendido / comprado) + 40% margem (lucro / receita), de 0 a 100",
            "suppliers": result,
        }

    async def _attribute_sales(self, tenant_id: int, item_to_supplier: Dict[int, int],
                               agg: Dict[int, Dict[str, Any]]) -> None:
        """Soma receita e custo FIFO das vendas aos fornecedores donos dos itens de entrada."""
        if not item_to_supplier:
            return
        stmt = (
            select(SaleItem.id, SaleItem.quantity, SaleItem.unit_price, SaleItem.discount_amount,
                   SaleItem.sale_sources, Sale.status)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(
                SaleItem.tenant_id == tenant_id,
                SaleItem.is_active == True,  # noqa: E712
                Sale.status.in_(_COUNTED_STATUSES),
            )
        )
        sale_rows = (await self.db.execute(stmt)).all()

        # Devoluções por item de venda (venda parcialmente estornada)
        returned: Dict[int, int] = defaultdict(int)
        ret_rows = (await self.db.execute(
            select(ReturnItem.sale_item_id, ReturnItem.quantity_returned).where(ReturnItem.tenant_id == tenant_id)
        )).all()
        for sale_item_id, qty in ret_rows:
            returned[sale_item_id] += qty or 0

        for sale_item_id, qty, unit_price, discount, sources, _status in sale_rows:
            if not sources or "sources" not in sources or not qty:
                continue
            kept_factor = max(0, qty - returned.get(sale_item_id, 0)) / qty
            net_unit = (_f(unit_price) * qty - _f(discount)) / qty
            for src in sources["sources"]:
                sup_id = item_to_supplier.get(src.get("entry_item_id"))
                if sup_id is None:
                    continue
                taken = (src.get("quantity_taken") or 0) * kept_factor
                a = agg[sup_id]
                a["revenue"] += net_unit * taken
                src_cost = src.get("total_cost")
                unit_cost = _f(src.get("unit_cost"))
                full_qty = src.get("quantity_taken") or 0
                cost_total = _f(src_cost) if src_cost is not None else unit_cost * full_qty
                a["cogs"] += cost_total * kept_factor
                a["units_sold_fifo"] += taken

    async def _supplier_names(self, tenant_id: int, ids: List[int]) -> Dict[int, str]:
        if not ids:
            return {}
        rows = (await self.db.execute(
            select(Supplier.id, Supplier.name).where(Supplier.tenant_id == tenant_id, Supplier.id.in_(ids))
        )).all()
        return {i: n for i, n in rows}

    # --------------------------------------------------------- comparação de custo
    async def cost_comparison(self, tenant_id: int, only_multi: bool = True) -> Dict[str, Any]:
        """Produtos comprados de mais de um fornecedor, com diferença de custo e tendência."""
        sp_rows = (await self.db.execute(
            select(SupplierProduct.supplier_id, SupplierProduct.product_id, SupplierProduct.last_unit_cost,
                   SupplierProduct.purchase_count, SupplierProduct.last_purchase_date,
                   Supplier.name, Product.name, Product.is_active)
            .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
            .join(Product, Product.id == SupplierProduct.product_id)
            .where(SupplierProduct.tenant_id == tenant_id, SupplierProduct.is_active == True)  # noqa: E712
        )).all()

        history = await self._cost_history(tenant_id)  # (supplier, product) -> [(data, custo medio)]

        by_product: Dict[int, Dict[str, Any]] = {}
        for sup_id, prod_id, last_cost, count, last_date, sup_name, prod_name, prod_active in sp_rows:
            if not prod_active:
                continue
            p = by_product.setdefault(prod_id, {"product_id": prod_id, "product_name": prod_name, "suppliers": []})
            hist = history.get((sup_id, prod_id), [])
            previous = hist[-2][1] if len(hist) >= 2 else None
            current = hist[-1][1] if hist else _f(last_cost)   # preço pago na última compra, já com desconto
            change = ((current - previous) / previous * 100) if previous else None
            p["suppliers"].append({
                "supplier_id": sup_id,
                "supplier_name": sup_name,
                "last_unit_cost": _round2(current),
                "purchase_count": count,
                "last_purchase_date": last_date.isoformat() if last_date else None,
                "previous_unit_cost": _round2(previous) if previous is not None else None,
                "change_pct": _round2(change) if change is not None else None,
                "is_cheapest": False,
            })

        products: List[Dict[str, Any]] = []
        increases: List[Dict[str, Any]] = []
        for p in by_product.values():
            sups = p["suppliers"]
            costs = [s["last_unit_cost"] for s in sups]
            lo, hi = min(costs), max(costs)
            for s in sups:
                s["is_cheapest"] = len(sups) > 1 and lo < hi and s["last_unit_cost"] == lo
                if s["change_pct"] is not None and s["change_pct"] >= 10:
                    increases.append({
                        "product_id": p["product_id"], "product_name": p["product_name"],
                        "supplier_id": s["supplier_id"], "supplier_name": s["supplier_name"],
                        "previous_unit_cost": s["previous_unit_cost"], "last_unit_cost": s["last_unit_cost"],
                        "change_pct": s["change_pct"],
                    })
            sups.sort(key=lambda s: s["last_unit_cost"])
            cheapest = sups[0]
            p.update({
                "min_cost": lo,
                "max_cost": hi,
                "savings_per_unit": _round2(hi - lo),
                "savings_pct": _round2((hi - lo) / hi * 100) if hi else 0.0,
                "cheapest_supplier_id": cheapest["supplier_id"] if lo < hi else None,
                "cheapest_supplier_name": cheapest["supplier_name"] if lo < hi else None,
                "supplier_count": len(sups),
            })
            if len(sups) > 1 or not only_multi:
                products.append(p)

        products.sort(key=lambda p: (-p["savings_pct"], p["product_name"].casefold()))
        increases.sort(key=lambda r: -r["change_pct"])
        return {"products": products, "price_increases": increases}

    async def _cost_history(self, tenant_id: int, product_id: Optional[int] = None) -> Dict[tuple, List[tuple]]:
        """(fornecedor, produto) -> [(data, custo médio ponderado da compra)] em ordem cronológica."""
        stmt = (
            select(EntryItem.supplier_id, EntryItem.product_id, EntryItem.entry_id, StockEntry.entry_date,
                   EntryItem.quantity_received, EntryItem.unit_cost, EntryItem.id)
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(
                EntryItem.tenant_id == tenant_id,
                EntryItem.is_active == True,  # noqa: E712
                StockEntry.is_active == True,  # noqa: E712
                EntryItem.supplier_id.is_not(None),
                EntryItem.product_id.is_not(None),
            )
        )
        if product_id is not None:
            stmt = stmt.where(EntryItem.product_id == product_id)
        rows = (await self.db.execute(stmt)).all()
        disc_units = await self._discount_units(
            tenant_id, {r[2] for r in rows} if product_id is not None else None)
        per_entry: Dict[tuple, Dict[int, list]] = defaultdict(dict)
        for sup_id, prod_id, entry_id, entry_date, qty, cost, item_id in rows:
            slot = per_entry[(sup_id, prod_id)].setdefault(entry_id, [entry_date, 0, 0.0])
            slot[1] += qty
            slot[2] += qty * max(_f(cost) - disc_units.get(item_id, 0.0), 0.0)
        out: Dict[tuple, List[tuple]] = {}
        for key, entries in per_entry.items():
            seq = sorted(((d, (t / q) if q else 0.0, eid) for eid, (d, q, t) in entries.items()),
                         key=lambda x: (x[0], x[2]))
            out[key] = [(d, c) for d, c, _ in seq]
        return out

    # --------------------------------------------------------- lista de reposição
    async def restock_list(self, tenant_id: int, cover_days: int = 30, low_threshold: int = 2,
                           lookback_days: int = 90) -> Dict[str, Any]:
        """Variações com estoque baixo e demanda recente, agrupadas pelo melhor fornecedor.

        Quantidade sugerida = vendas de `cover_days` dias (pelo ritmo dos últimos `lookback_days`)
        menos o estoque atual, no mínimo 1.
        Fornecedor sugerido = o de menor último custo para o produto (empate: mais compras).
        """
        today = today_brazil()
        since_dt = datetime.combine(today - timedelta(days=lookback_days), datetime.min.time())

        # Estoque atual por variação (FIFO)
        stock_rows = (await self.db.execute(
            select(EntryItem.variant_id, EntryItem.quantity_remaining)
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(EntryItem.tenant_id == tenant_id, EntryItem.is_active == True,  # noqa: E712
                   StockEntry.is_active == True, EntryItem.variant_id.is_not(None))  # noqa: E712
        )).all()
        stock: Dict[int, int] = defaultdict(int)
        for vid, rem in stock_rows:
            stock[vid] += rem or 0

        # Vendas recentes por variação
        sold_rows = (await self.db.execute(
            select(SaleItem.variant_id, SaleItem.quantity)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(SaleItem.tenant_id == tenant_id, SaleItem.is_active == True,  # noqa: E712
                   Sale.status.in_(_COUNTED_STATUSES), SaleItem.variant_id.is_not(None),
                   Sale.created_at >= since_dt)
        )).all()
        sold: Dict[int, int] = defaultdict(int)
        for vid, qty in sold_rows:
            sold[vid] += qty or 0

        variants = (await self.db.execute(
            select(ProductVariant.id, ProductVariant.product_id, ProductVariant.size, ProductVariant.color,
                   ProductVariant.sku, Product.name)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True,  # noqa: E712
                   Product.is_active == True, Product.is_catalog == False)  # noqa: E712
        )).all()

        # Fornecedores por produto
        sp_rows = (await self.db.execute(
            select(SupplierProduct.product_id, SupplierProduct.supplier_id, SupplierProduct.last_unit_cost,
                   SupplierProduct.purchase_count, Supplier.name, Supplier.phone)
            .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
            .where(SupplierProduct.tenant_id == tenant_id, SupplierProduct.is_active == True,  # noqa: E712
                   Supplier.is_active == True)  # noqa: E712
        )).all()
        best: Dict[int, Dict[str, Any]] = {}
        paid_history = await self._cost_history(tenant_id)
        for prod_id, sup_id, cost, count, sup_name, phone in sp_rows:
            _h = paid_history.get((sup_id, prod_id))
            cand = {"supplier_id": sup_id, "supplier_name": sup_name, "phone": phone,
                    "last_unit_cost": _h[-1][1] if _h else _f(cost), "purchase_count": count}
            cur = best.get(prod_id)
            if cur is None or (cand["last_unit_cost"], -cand["purchase_count"]) < (cur["last_unit_cost"], -cur["purchase_count"]):
                best[prod_id] = cand

        groups: Dict[Any, Dict[str, Any]] = {}
        scale = lookback_days / 30 if lookback_days else 1
        for vid, prod_id, size, color, sku, prod_name in variants:
            cur_stock = stock.get(vid, 0)
            sold_n = sold.get(vid, 0)
            if cur_stock > low_threshold or sold_n <= 0:
                continue
            per_30 = sold_n / scale
            target = math.ceil(per_30 * cover_days / 30)
            suggested = max(target - cur_stock, 1)
            sup = best.get(prod_id)
            key = sup["supplier_id"] if sup else None
            g = groups.setdefault(key, {
                "supplier_id": key,
                "supplier_name": sup["supplier_name"] if sup else "Sem fornecedor definido",
                "phone": sup["phone"] if sup else None,
                "items": [], "total_qty": 0, "estimated_total": 0.0,
            })
            unit_cost = sup["last_unit_cost"] if sup else None
            est = _round2(suggested * unit_cost) if unit_cost is not None else None
            g["items"].append({
                "product_id": prod_id, "product_name": prod_name, "variant_id": vid,
                "size": size, "color": color, "sku": sku,
                "stock": cur_stock, "sold_recent": sold_n, "sold_per_30_days": _round2(per_30),
                "suggested_qty": suggested, "last_unit_cost": unit_cost, "estimated_cost": est,
            })
            g["total_qty"] += suggested
            if est is not None:
                g["estimated_total"] += est

        out_groups = list(groups.values())
        for g in out_groups:
            g["estimated_total"] = _round2(g["estimated_total"])
            g["items"].sort(key=lambda i: (i["stock"], -i["sold_recent"], i["product_name"].casefold()))
            g["whatsapp_text"] = (
                whatsapp_message(g["supplier_name"], g["items"]) if g["supplier_id"] is not None else None
            )
        # Fornecedores com mais itens primeiro; "sem fornecedor" por último
        out_groups.sort(key=lambda g: (g["supplier_id"] is None, -g["total_qty"]))
        return {
            "cover_days": cover_days,
            "low_threshold": low_threshold,
            "lookback_days": lookback_days,
            "rule": (f"Variações com estoque até {low_threshold} un e venda nos últimos {lookback_days} dias; "
                     f"sugere repor para cobrir {cover_days} dias de vendas."),
            "total_items": sum(len(g["items"]) for g in out_groups),
            "total_qty": sum(g["total_qty"] for g in out_groups),
            "estimated_total": _round2(sum(g["estimated_total"] for g in out_groups)),
            "groups": out_groups,
        }
