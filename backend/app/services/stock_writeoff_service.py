"""
Baixa de estoque feita pela Conferência de Estoque (peça perdida, avariada, furtada, erro de contagem).

Tudo ou nada: se qualquer item falhar, nada é gravado. Desconta das entradas (FIFO, mais antigas primeiro) da
variação, registra um movimento de estoque por produto com o motivo e atualiza o saldo do produto. Só o que está
em `quantity_remaining` pode ser baixado: não deixa o saldo negativo.
"""
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory, InventoryMovement, MovementType
from app.models.product_variant import ProductVariant
from app.models.store import Store
from app.repositories.entry_item_repository import EntryItemRepository

REASONS = {"perda": MovementType.DAMAGE, "avaria": MovementType.DAMAGE, "furto": MovementType.DAMAGE, "ajuste": MovementType.ADJUSTMENT}


class WriteoffDisabled(PermissionError):
    pass


class WriteoffError(ValueError):
    pass


class StockWriteoffService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.items = EntryItemRepository()

    async def enabled(self, tenant_id: int) -> bool:
        store = (await self.db.execute(select(Store).where(Store.id == tenant_id, Store.is_active == True))).scalars().first()  # noqa: E712
        return bool(store and store.allow_stock_writeoff)

    async def apply(self, *, tenant_id: int, user_id: int | None, reason: str, note: str | None, lines: List[Dict[str, int]]) -> Dict[str, Any]:
        if not await self.enabled(tenant_id):
            raise WriteoffDisabled("A baixa de estoque pela conferência está desligada. O admin liga em Configurações.")
        if reason not in REASONS:
            raise WriteoffError("Motivo inválido. Use perda, avaria, furto ou ajuste.")
        if not lines:
            raise WriteoffError("Nenhuma peça informada.")
        merged: Dict[int, int] = {}
        for ln in lines:
            q = int(ln["quantity"])
            if q <= 0:
                raise WriteoffError("A quantidade da baixa deve ser maior que zero.")
            merged[int(ln["variant_id"])] = merged.get(int(ln["variant_id"]), 0) + q

        moves: Dict[int, int] = {}  # product_id -> total baixado
        done: List[Dict[str, Any]] = []
        try:
            for variant_id, qty in merged.items():
                variant = (await self.db.execute(
                    select(ProductVariant).where(ProductVariant.id == variant_id, ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True)  # noqa: E712
                )).scalars().first()
                if not variant:
                    raise WriteoffError(f"Variação {variant_id} não encontrada.")
                available = await self.items.get_available_for_variant(self.db, variant_id, tenant_id=tenant_id)
                total = sum(i.quantity_remaining for i in available)
                if total < qty:
                    raise WriteoffError(f"Variação {variant_id}: só há {total} em estoque para baixar (pedido: {qty}).")
                left = qty
                for item in available:
                    if left <= 0:
                        break
                    take = min(item.quantity_remaining, left)
                    if not await self.items.decrease_quantity(self.db, item.id, take):
                        raise WriteoffError(f"Variação {variant_id}: não foi possível baixar o lote {item.id}.")
                    left -= take
                moves[variant.product_id] = moves.get(variant.product_id, 0) + qty
                done.append({"variant_id": variant_id, "quantity": qty})

            text = f"Baixa pela conferência ({reason})" + (f": {note.strip()}" if note and note.strip() else "")
            for product_id, qty in moves.items():
                inv = (await self.db.execute(
                    select(Inventory).where(Inventory.product_id == product_id, Inventory.tenant_id == tenant_id)
                )).scalars().first()
                if inv is None:
                    continue
                before = inv.quantity
                after = max(0, before - qty)
                inv.quantity = after
                mv = InventoryMovement(
                    movement_type=REASONS[reason], quantity_before=before, quantity_change=after - before,
                    quantity_after=after, reference_id=f"conferencia:{user_id}" if user_id else "conferencia", notes=text, inventory_id=inv.id,
                )
                mv.tenant_id = tenant_id
                self.db.add(mv)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return {"ok": True, "items": done, "total_pecas": sum(d["quantity"] for d in done)}
