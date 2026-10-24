"""
Devolução ao fornecedor (peça com defeito ou comprada em condicional) e a resposta dele.

Tudo-ou-nada: cada operação faz um único commit no fim e desfaz tudo em qualquer erro.
Dinheiro e estoque:
- enviar uma peça que ESTÁ no estoque tira ela do estoque (from_stock); uma peça com defeito vinda de cliente
  já está fora do estoque (não volta ao devolver ao cliente);
- fornecedor TROCA: entra uma peça nova pelo mesmo custo da mercadoria (entrada do tipo "devolução");
- fornecedor CREDITA em dinheiro: o valor vira desconto DAQUELE fornecedor na entrada de origem (abate só o custo das peças dele);
- fornecedor RECUSA: se a peça estava no estoque ela volta; se era defeito, o prejuízo fica com a loja.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entry_item import EntryItem
from app.models.sale import SaleItem
from app.models.sale_return import ReturnItem
from app.models.stock_entry import EntryType, StockEntry
from app.models.supplier_return import SupplierReturn
from app.models.product_variant import ProductVariant
from app.services import lot_cost_service
from app.services.inventory_service import InventoryService


class SupplierReturnService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self, *, tenant_id: int, user_id: int, reason: str, quantity: int,
        entry_item_id: Optional[int] = None, return_item_id: Optional[int] = None,
    ) -> SupplierReturn:
        """
        Envia peças ao fornecedor. Informe `return_item_id` (peça com defeito devolvida por cliente) OU
        `entry_item_id` (peça que está no estoque, por exemplo de uma compra em condicional).
        """
        try:
            if bool(entry_item_id) == bool(return_item_id):
                raise ValueError("Informe a peça com defeito devolvida pelo cliente OU a peça do estoque, não os dois.")
            if quantity <= 0:
                raise ValueError("A quantidade tem que ser maior que zero.")
            from_stock = return_item_id is None

            if return_item_id:
                ri = (await self.db.execute(select(ReturnItem).where(
                    ReturnItem.id == return_item_id, ReturnItem.tenant_id == tenant_id))).scalar_one_or_none()
                if not ri:
                    raise ValueError("Devolução de cliente não encontrada.")
                if ri.restock:
                    raise ValueError("Esta peça voltou ao estoque; só peças com defeito (que não voltaram) vão ao fornecedor.")
                already = (await self.db.execute(select(SupplierReturn).where(
                    SupplierReturn.return_item_id == ri.id, SupplierReturn.status != "rejected"))).scalars().all()
                sent = sum(r.quantity for r in already)
                if quantity > ri.quantity_returned - sent:
                    raise ValueError(f"Só restam {ri.quantity_returned - sent} peça(s) desta devolução para enviar ao fornecedor.")
                sale_item = (await self.db.execute(select(SaleItem).where(SaleItem.id == ri.sale_item_id))).scalar_one()
                sources = (sale_item.sale_sources or {}).get("sources") or []
                if not sources:
                    raise ValueError("Não foi possível saber de qual entrada esta peça veio.")
                src = sources[0]
                if quantity > src["quantity_taken"]:
                    raise ValueError("Esta peça veio de mais de uma entrada; envie em duas partes.")
                entry_item_id = int(src["entry_item_id"])

            item = (await self.db.execute(select(EntryItem).where(
                EntryItem.id == entry_item_id, EntryItem.tenant_id == tenant_id))).scalar_one_or_none()
            if not item:
                raise ValueError("Peça da entrada não encontrada.")
            if from_stock and quantity > item.quantity_remaining:
                raise ValueError(f"Só há {item.quantity_remaining} peça(s) em estoque nesta entrada.")
            entry = (await self.db.execute(select(StockEntry).where(StockEntry.id == item.entry_id))).scalar_one()

            if from_stock:
                item.quantity_remaining -= quantity   # sai do estoque até o fornecedor responder

            sr = SupplierReturn(
                supplier_id=item.supplier_id or entry.supplier_id, entry_id=entry.id, entry_item_id=item.id,
                variant_id=item.variant_id, product_id=item.product_id, return_item_id=return_item_id,
                quantity=quantity, unit_cost=item.unit_cost, from_stock=from_stock, reason=reason.strip(),
                status="sent", created_by_id=user_id, tenant_id=tenant_id, is_active=True,
            )
            self.db.add(sr)
            await self.db.flush()
            await self.db.commit()
            await self._sync(item.product_id, tenant_id)
            return await self.get(sr.id, tenant_id=tenant_id)
        except Exception:
            await self.db.rollback()
            raise

    async def resolve(
        self, supplier_return_id: int, *, tenant_id: int, outcome: str, note: Optional[str] = None,
        replacement_variant_id: Optional[int] = None, credit_amount: Optional[Decimal] = None,
    ) -> SupplierReturn:
        try:
            sr = await self.get(supplier_return_id, tenant_id=tenant_id)
            if sr.status != "sent":
                raise ValueError("Esta devolução ao fornecedor já foi resolvida.")
            item = (await self.db.execute(select(EntryItem).where(EntryItem.id == sr.entry_item_id))).scalar_one()
            entry = (await self.db.execute(select(StockEntry).where(StockEntry.id == sr.entry_id))).scalar_one()
            product_ids = {sr.product_id}

            if outcome == "exchanged":
                variant_id = replacement_variant_id or sr.variant_id
                v = (await self.db.execute(select(ProductVariant).where(
                    ProductVariant.id == variant_id, ProductVariant.tenant_id == tenant_id))).scalar_one_or_none()
                if not v:
                    raise ValueError("Peça enviada pelo fornecedor não encontrada no cadastro.")
                code = f"FORN-{sr.id}-{int(datetime.now(timezone.utc).timestamp())}"
                new_entry = StockEntry(
                    entry_code=code, entry_date=date.today(), entry_type=EntryType.RETURN,
                    supplier_id=entry.supplier_id, supplier_name=entry.supplier_name,
                    notes=f"Troca com o fornecedor (devolução ao fornecedor nº {sr.id})",
                    total_cost=sr.unit_cost * sr.quantity, tenant_id=tenant_id, is_active=True,
                )
                self.db.add(new_entry)
                await self.db.flush()
                new_item = EntryItem(
                    entry_id=new_entry.id, variant_id=v.id, product_id=v.product_id, quantity_received=sr.quantity,
                    quantity_remaining=sr.quantity, unit_cost=sr.unit_cost, supplier_id=sr.supplier_id,
                    tenant_id=tenant_id, is_active=True,
                )
                self.db.add(new_item)
                await self.db.flush()
                sr.replacement_entry_item_id = new_item.id
                product_ids.add(v.product_id)
            elif outcome == "credited":
                amount = Decimal(str(credit_amount or 0))
                if amount <= 0:
                    raise ValueError("Informe o valor que o fornecedor creditou.")
                sr.credit_amount = amount
                if sr.supplier_id:
                    from app.models.entry_supplier_discount import EntrySupplierDiscount
                    row = (await self.db.execute(select(EntrySupplierDiscount).where(
                        EntrySupplierDiscount.entry_id == entry.id,
                        EntrySupplierDiscount.supplier_id == sr.supplier_id))).scalar_one_or_none()
                    if row:
                        row.amount = Decimal(str(row.amount or 0)) + amount
                        row.is_active = True
                    else:
                        self.db.add(EntrySupplierDiscount(entry_id=entry.id, supplier_id=sr.supplier_id, amount=amount,
                                                           tenant_id=tenant_id, is_active=True))
                else:
                    entry.discount_amount = Decimal(str(entry.discount_amount or 0)) + amount
                await self.db.flush()
                await lot_cost_service.recompute_entries(self.db, [entry.id], tenant_id=tenant_id)
            elif outcome == "rejected":
                if sr.from_stock:
                    item.quantity_remaining += sr.quantity   # fornecedor recusou: a peça volta ao estoque
            else:
                raise ValueError("Resultado inválido: use exchanged, credited ou rejected.")

            sr.status = outcome
            sr.resolved_at = datetime.now(timezone.utc)
            sr.resolution_note = (note or "").strip() or None
            await self.db.commit()
            for pid in {p for p in product_ids if p}:
                await self._sync(pid, tenant_id)
            return await self.get(sr.id, tenant_id=tenant_id)
        except Exception:
            await self.db.rollback()
            raise

    async def get(self, supplier_return_id: int, *, tenant_id: int) -> SupplierReturn:
        sr = (await self.db.execute(select(SupplierReturn).where(
            SupplierReturn.id == supplier_return_id, SupplierReturn.tenant_id == tenant_id))).scalar_one_or_none()
        if not sr:
            raise ValueError("Devolução ao fornecedor não encontrada.")
        return sr

    async def list(self, *, tenant_id: int, status: Optional[str] = None) -> List[SupplierReturn]:
        q = select(SupplierReturn).where(SupplierReturn.tenant_id == tenant_id, SupplierReturn.is_active == True)  # noqa: E712
        if status:
            q = q.where(SupplierReturn.status == status)
        return list((await self.db.execute(q.order_by(SupplierReturn.id.desc()))).scalars().all())

    async def defective_pending(self, *, tenant_id: int) -> List[dict]:
        """Peças com defeito devolvidas por clientes que ainda não foram enviadas ao fornecedor."""
        items = (await self.db.execute(select(ReturnItem).where(
            ReturnItem.tenant_id == tenant_id, ReturnItem.restock == False, ReturnItem.is_active == True  # noqa: E712
        ).order_by(ReturnItem.id.desc()))).scalars().all()
        out = []
        for ri in items:
            sent = sum(r.quantity for r in (await self.db.execute(select(SupplierReturn).where(
                SupplierReturn.return_item_id == ri.id, SupplierReturn.status != "rejected"))).scalars().all())
            left = ri.quantity_returned - sent
            if left > 0:
                out.append({"return_item_id": ri.id, "product_id": ri.product_id, "variant_id": ri.variant_id,
                            "quantity_pending": left, "unit_cost": float(ri.unit_cost)})
        return out

    async def _sync(self, product_id: Optional[int], tenant_id: int) -> None:
        if not product_id:
            return
        try:
            await InventoryService(self.db).rebuild_product_from_fifo(product_id, tenant_id=tenant_id)
        except Exception as e:  # sincronização do saldo não derruba a operação
            print(f"[Inventory Sync] Falha ao sincronizar produto {product_id}: {e}")
