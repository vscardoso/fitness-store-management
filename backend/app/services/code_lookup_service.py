"""
Resolvedor único de código lido (QR do adesivo ou SKU): uma chamada devolve a peça, o preço,
o estoque e as outras variações do produto. Usado pela conferência, pela venda e pela consulta.

Ordem: código da etiqueta com prefixo (PV#101-1, #101-1, 101-1) > SKU exato > número simples
do código antigo (123 / 0123). O número simples vem por último porque um SKU numérico não pode ser confundido
com o código curto de outra peça. O cadastro não tem código de barras de fábrica (não existe essa coluna). Nunca devolve custo.
"""
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_entry import StockEntry
from app.utils.variant_code import format_variant_code, parse_variant_code
from app.utils.variant_grid import size_sort_key

_PREFIXED = ("PV#", "#")


class CodeLookupService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _variant_row(self, where, tenant_id: int):
        return (await self.db.execute(
            select(ProductVariant, Product, Category.name)
            .join(Product, Product.id == ProductVariant.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True,  # noqa: E712
                   Product.is_active == True, where)  # noqa: E712
            .limit(1)
        )).first()

    async def _stock_by_variant(self, tenant_id: int, variant_ids: List[int]) -> Dict[int, int]:
        if not variant_ids:
            return {}
        rows = (await self.db.execute(
            select(EntryItem.variant_id, func.coalesce(func.sum(EntryItem.quantity_remaining), 0))
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(EntryItem.tenant_id == tenant_id, EntryItem.is_active == True,  # noqa: E712
                   StockEntry.is_active == True, EntryItem.variant_id.in_(variant_ids))  # noqa: E712
            .group_by(EntryItem.variant_id)
        )).all()
        return {vid: int(q) for vid, q in rows}

    async def lookup(self, code: str, tenant_id: int) -> Optional[Dict[str, Any]]:
        text = (code or "").strip()
        if not text or len(text) > 120:
            return None
        found = None
        match = None

        pair = parse_variant_code(text)
        if pair is not None:
            found = await self._variant_row(
                (ProductVariant.product_code == pair[0]) & (ProductVariant.variant_number == pair[1]), tenant_id)
            match = "label"
        if found is None:
            found = await self._variant_row(func.upper(ProductVariant.sku) == text.upper(), tenant_id)   # leitor e digitação variam a caixa
            match = "sku" if found else match
        if found is None:
            # código antigo: PV#0123, #0123 ou só o número (por último, ver o aviso no topo)
            body = text.upper()
            for prefix in _PREFIXED:
                if body.startswith(prefix):
                    body = body[len(prefix):]
                    break
            if body.isdigit() and len(body) <= 9 and int(body) > 0:
                found = await self._variant_row(ProductVariant.short_code == int(body), tenant_id)
                match = "label" if found else match
        if found is None:
            return None

        variant, product, category_name = found
        siblings = list((await self.db.execute(
            select(ProductVariant).where(
                ProductVariant.product_id == product.id, ProductVariant.tenant_id == tenant_id,
                ProductVariant.is_active == True)  # noqa: E712
        )).scalars().all())
        siblings.sort(key=lambda v: ((v.color or "").casefold(), size_sort_key(v.size)))
        stock = await self._stock_by_variant(tenant_id, [v.id for v in siblings])

        def row(v: ProductVariant) -> Dict[str, Any]:
            return {
                "id": v.id, "sku": v.sku, "size": v.size, "color": v.color,
                "price": float(v.price if v.price is not None else product.base_price or 0),
                "current_stock": stock.get(v.id, 0),
                "short_code": v.short_code, "display_code": format_variant_code(v.product_code, v.variant_number),
            }

        return {
            "match": match,
            "variant": row(variant),
            "product": {
                "id": product.id, "name": product.name, "brand": product.brand, "image_url": product.image_url,
                "category_id": product.category_id, "category_name": category_name,
                "base_price": float(product.base_price or 0),
            },
            "siblings": [row(v) for v in siblings],
            "product_stock": sum(stock.get(v.id, 0) for v in siblings),
        }
