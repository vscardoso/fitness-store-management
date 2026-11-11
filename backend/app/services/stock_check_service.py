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
from app.utils.variant_code import format_variant_code
from app.utils.variant_grid import size_sort_key


def _row(vid, pid, color, size, sku, short_code, product_code, variant_number, pname, pcat, cname, qty, sold=frozenset()) -> Dict[str, Any]:
    return {
        "variant_id": vid,
        "product_id": pid,
        "product_name": pname,
        "category_id": pcat,
        "category_name": cname or "Sem categoria",
        "color": color,
        "size": size,
        "label": " · ".join(x for x in (color, size) if x) or "Único",
        "sku": sku,
        "short_code": short_code,   # número antigo por variação (#0123)
        "display_code": format_variant_code(product_code, variant_number),   # código da etiqueta (#101-1), quando já numerada
        "system_quantity": qty,
        "ever_sold": vid in sold,
    }


_VARIANT_COLS = (
    ProductVariant.id, ProductVariant.product_id, ProductVariant.color, ProductVariant.size, ProductVariant.sku,
    ProductVariant.short_code, ProductVariant.product_code, ProductVariant.variant_number,
    Product.name, Product.category_id, Category.name,
)


class StockCheckService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def entry_report(self, *, tenant_id: int, entry_id: int) -> Dict[str, Any]:
        """As peças de UMA entrada (Conferir recebimento): o "sistema" de cada linha é o que a nota trouxe
        (`quantity_received`, somado por variação). Item sem variação não entra (não dá para bipar). Mesmo formato do `report`."""
        got = {vid: int(q) for vid, q in (await self.db.execute(
            select(EntryItem.variant_id, func.coalesce(func.sum(EntryItem.quantity_received), 0))
            .where(EntryItem.entry_id == entry_id, EntryItem.tenant_id == tenant_id, EntryItem.is_active == True,  # noqa: E712
                   EntryItem.variant_id.isnot(None))
            .group_by(EntryItem.variant_id)
        )).all()}
        out: List[Dict[str, Any]] = []
        if got:
            rows = (await self.db.execute(
                select(*_VARIANT_COLS).join(Product, Product.id == ProductVariant.product_id)
                .outerjoin(Category, Category.id == Product.category_id)
                .where(ProductVariant.id.in_(list(got)), ProductVariant.tenant_id == tenant_id)
            )).all()
            out = [_row(*r, got[r[0]]) for r in rows]
        out.sort(key=lambda r: (r["product_name"].casefold(), (r["color"] or "").casefold(), size_sort_key(r["size"])))
        return {"rows": out, "total_variants": len(out), "total_pieces": sum(r["system_quantity"] for r in out)}

    async def variant_rows(self, *, tenant_id: int, variant_ids) -> Dict[int, Dict[str, Any]]:
        """Linhas (com quantidade 0) de variações soltas da loja: a peça lida que NÃO é da entrada ("fora da entrada")."""
        ids = {int(v) for v in variant_ids if v}
        if not ids:
            return {}
        rows = (await self.db.execute(
            select(*_VARIANT_COLS).join(Product, Product.id == ProductVariant.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(ProductVariant.id.in_(ids), ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True)  # noqa: E712
        )).all()
        return {r[0]: _row(*r, 0) for r in rows}

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

        # só as colunas usadas (carregar a entidade inteira de 29 mil variações custava a maior parte do tempo)
        stmt = (
            select(
                ProductVariant.id, ProductVariant.product_id, ProductVariant.color, ProductVariant.size, ProductVariant.sku,
                ProductVariant.short_code, ProductVariant.product_code, ProductVariant.variant_number,
                Product.name, Product.category_id, Category.name,
            )
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
        for r in rows:
            vid, pid = r[0], r[1]
            if pid not in first_variant or vid < first_variant[pid]:
                first_variant[pid] = vid

        from app.services.stock_rules import sold_variant_ids
        sold = await sold_variant_ids(self.db, tenant_id)   # variação que já vendeu: a baixa não oferece excluir
        out: List[Dict[str, Any]] = []
        for vid, pid, color, size, sku, short_code, product_code, variant_number, pname, pcat, cname in rows:
            qty = by_variant.get(vid, 0)
            if first_variant.get(pid) == vid:
                qty += legacy_by_product.get(pid, 0)
            if only_in_stock and qty <= 0:
                continue
            out.append(_row(vid, pid, color, size, sku, short_code, product_code, variant_number, pname, pcat, cname, qty, sold))
        out.sort(key=lambda r: (
            r["category_name"].casefold(), r["product_name"].casefold(), (r["color"] or "").casefold(), size_sort_key(r["size"]),
        ))
        return {
            "rows": out,
            "total_variants": len(out),
            "total_pieces": sum(r["system_quantity"] for r in out),
        }

    async def quantities(self, *, tenant_id: int, variant_ids) -> Dict[int, int]:
        """Estoque de agora de algumas variações, pela mesma regra do `report` (item antigo sem variação soma na
        primeira variação ativa do produto). Usado pela conferência em andamento para acompanhar vendas e entradas."""
        ids = {int(v) for v in variant_ids if v}
        if not ids:
            return {}
        vrows = (await self.db.execute(
            select(ProductVariant.id, ProductVariant.product_id).where(ProductVariant.id.in_(ids), ProductVariant.tenant_id == tenant_id)
        )).all()
        pids = {pid for _, pid in vrows}
        first = dict((await self.db.execute(
            select(ProductVariant.product_id, func.min(ProductVariant.id))
            .join(Product, Product.id == ProductVariant.product_id)
            .where(ProductVariant.product_id.in_(pids), ProductVariant.tenant_id == tenant_id,
                   ProductVariant.is_active == True, Product.is_active == True)  # noqa: E712
            .group_by(ProductVariant.product_id)
        )).all()) if pids else {}
        live = (EntryItem.tenant_id == tenant_id, EntryItem.is_active == True, StockEntry.is_active == True)  # noqa: E712
        by_variant = dict((await self.db.execute(
            select(EntryItem.variant_id, func.coalesce(func.sum(EntryItem.quantity_remaining), 0))
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(*live, EntryItem.variant_id.in_(ids)).group_by(EntryItem.variant_id)
        )).all())
        legacy = dict((await self.db.execute(
            select(EntryItem.product_id, func.coalesce(func.sum(EntryItem.quantity_remaining), 0))
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(*live, EntryItem.variant_id.is_(None), EntryItem.product_id.in_(pids)).group_by(EntryItem.product_id)
        )).all()) if pids else {}
        out: Dict[int, int] = {}
        for vid, pid in vrows:
            q = int(by_variant.get(vid, 0))
            if first.get(pid) == vid:
                q += int(legacy.get(pid, 0))
            out[vid] = q
        return out
