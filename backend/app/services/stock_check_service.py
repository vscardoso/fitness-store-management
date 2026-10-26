"""
Relatório de conferência de estoque: lista cada variação (cor/tamanho) com a quantidade que o SISTEMA diz ter.

A quantidade vem das entradas (FIFO): soma de `quantity_remaining` dos itens ativos de entradas ativas, que é a mesma
base do estoque do app. Não mostra custo nem preço (a lista circula na contagem). A contagem física é digitada no app e
fica no aparelho; este serviço só entrega a base para comparar.
"""
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_entry import StockEntry
from app.utils.variant_grid import size_sort_key


class StockCheckService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def report(
        self, *, tenant_id: int, category_id: Optional[int] = None, only_in_stock: bool = False,
    ) -> Dict[str, Any]:
        # quantidade do sistema por variação (e por produto, para itens antigos sem variação)
        qty_rows = (await self.db.execute(
            select(EntryItem.variant_id, EntryItem.product_id, func.coalesce(func.sum(EntryItem.quantity_remaining), 0))
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(
                EntryItem.tenant_id == tenant_id,
                EntryItem.is_active == True,  # noqa: E712
                StockEntry.is_active == True,  # noqa: E712
            )
            .group_by(EntryItem.variant_id, EntryItem.product_id)
        )).all()
        by_variant: Dict[int, int] = {}
        legacy_by_product: Dict[int, int] = {}
        for variant_id, product_id, qty in qty_rows:
            if variant_id:
                by_variant[variant_id] = by_variant.get(variant_id, 0) + int(qty)
            elif product_id:
                legacy_by_product[product_id] = legacy_by_product.get(product_id, 0) + int(qty)

        stmt = (
            select(ProductVariant, Product, Category.name)
            .join(Product, Product.id == ProductVariant.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(
                ProductVariant.tenant_id == tenant_id,
                ProductVariant.is_active == True,  # noqa: E712
                Product.is_active == True,  # noqa: E712
            )
        )
        if category_id:
            stmt = stmt.where(Product.category_id == category_id)
        rows = (await self.db.execute(stmt)).all()

        # item antigo sem variação soma na primeira variação ativa do produto (mesma regra de quando o estoque entra sem variação)
        first_variant: Dict[int, int] = {}
        for v, p, _c in sorted(rows, key=lambda r: r[0].id):
            first_variant.setdefault(p.id, v.id)

        out: List[Dict[str, Any]] = []
        for v, p, cat_name in rows:
            qty = by_variant.get(v.id, 0)
            if first_variant.get(p.id) == v.id:
                qty += legacy_by_product.get(p.id, 0)
            if only_in_stock and qty <= 0:
                continue
            out.append({
                "variant_id": v.id,
                "product_id": p.id,
                "product_name": p.name,
                "category_id": p.category_id,
                "category_name": cat_name or "Sem categoria",
                "color": v.color,
                "size": v.size,
                "sku": v.sku,
                "short_code": v.short_code,   # número curto da etiqueta (#0123), quando a variação já foi numerada
                "system_quantity": qty,
            })
        out.sort(key=lambda r: (
            r["category_name"].casefold(), r["product_name"].casefold(), (r["color"] or "").casefold(), size_sort_key(r["size"]),
        ))
        return {
            "rows": out,
            "total_variants": len(out),
            "total_pieces": sum(r["system_quantity"] for r in out),
        }
