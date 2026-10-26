"""Monta os dados das etiquetas a partir das variações (por peça ou por entrada)."""
from typing import List, Optional, Sequence, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entry_item import EntryItem
from app.models.product_variant import ProductVariant
from app.models.stock_entry import StockEntry
from app.services.label_pdf_service import LabelData
from app.services.short_code_service import ensure_codes, format_short_code, qr_payload, format_variant_code, variant_qr_payload

MAX_LABELS = 600


class LabelRequestError(ValueError):
    pass


async def _variants(db: AsyncSession, tenant_id: int, ids: Sequence[int]) -> dict[int, ProductVariant]:
    rows = (await db.execute(
        select(ProductVariant)
        .options(selectinload(ProductVariant.product))
        .where(ProductVariant.id.in_(set(ids)), ProductVariant.tenant_id == tenant_id)
    )).scalars().all()
    return {v.id: v for v in rows}


async def _build(db: AsyncSession, tenant_id: int, wanted: List[Tuple[int, int]]) -> List[LabelData]:
    total = sum(q for _, q in wanted)
    if total == 0:
        raise LabelRequestError("Nenhuma etiqueta para imprimir.")
    if total > MAX_LABELS:
        raise LabelRequestError(f"No máximo {MAX_LABELS} etiquetas por vez.")
    variants = await _variants(db, tenant_id, [vid for vid, _ in wanted])
    missing = [vid for vid, _ in wanted if vid not in variants]
    if missing:
        raise LabelRequestError("Peça não encontrada nesta loja.")
    without_sku = [v for v in variants.values() if not v.sku]
    if without_sku:
        raise LabelRequestError("Peça de catálogo sem SKU não tem etiqueta: cadastre a peça antes.")
    await ensure_codes(db, variants.values())
    out: List[LabelData] = []
    for vid, qty in wanted:
        v = variants[vid]
        d = LabelData(name=v.product.name if v.product else "", color=v.color, size=v.size,
                      price=v.price,
                      code=format_variant_code(v.product_code, v.variant_number) or format_short_code(v.short_code),
                      qr=(variant_qr_payload(v.product_code, v.variant_number) if v.product_code and v.variant_number else qr_payload(v.short_code)))
        out.extend([d] * qty)
    return out


async def labels_for_variants(db: AsyncSession, tenant_id: int, items: List[Tuple[int, int]]) -> List[LabelData]:
    return await _build(db, tenant_id, items)


async def labels_for_entry(db: AsyncSession, tenant_id: int, entry_id: int) -> Tuple[List[LabelData], Optional[str]]:
    entry = (await db.execute(
        select(StockEntry).where(StockEntry.id == entry_id, StockEntry.tenant_id == tenant_id, StockEntry.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if entry is None:
        raise LabelRequestError("Entrada não encontrada nesta loja.")
    rows = (await db.execute(
        select(EntryItem.variant_id, EntryItem.quantity_received)
        .where(EntryItem.entry_id == entry_id, EntryItem.tenant_id == tenant_id,
               EntryItem.is_active == True, EntryItem.variant_id.is_not(None))  # noqa: E712
        .order_by(EntryItem.id)
    )).all()
    wanted: dict[int, int] = {}
    for vid, qty in rows:
        wanted[vid] = wanted.get(vid, 0) + int(qty or 0)
    return await _build(db, tenant_id, [(vid, q) for vid, q in wanted.items() if q > 0]), entry.entry_code
