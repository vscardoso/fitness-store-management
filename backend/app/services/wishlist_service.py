"""Service de Wishlist — regras de negócio e alertas."""
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.models.wishlist import Wishlist
from app.repositories.wishlist_repository import WishlistRepository
from app.schemas.wishlist import WishlistCreate, WishlistResponse, DemandItem


def _build_response(w: Wishlist) -> WishlistResponse:
    variant_desc = None
    if w.variant:
        parts = [v for v in [w.variant.size, w.variant.color] if v]
        variant_desc = " / ".join(parts) if parts else None

    return WishlistResponse(
        id=w.id,
        customer_id=w.customer_id,
        product_id=w.product_id,
        variant_id=w.variant_id,
        look_id=w.look_id,
        notified=w.notified,
        notified_at=w.notified_at,
        notes=w.notes,
        product_name=w.product.name if w.product else None,
        variant_description=variant_desc,
        customer_name=w.customer.full_name if w.customer else None,
        product_image_url=w.product.image_url if w.product else None,
        in_stock=False,  # Calculado separadamente se necessário
        created_at=w.created_at,
    )


class WishlistService:
    def __init__(self):
        self.repo = WishlistRepository()

    async def add(
        self, db: AsyncSession, tenant_id: int, data: WishlistCreate
    ) -> WishlistResponse:
        item = await self.repo.create(db, tenant_id, data)
        # Recarregar com relacionamentos
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        stmt = (
            select(Wishlist)
            .where(Wishlist.id == item.id)
            .options(selectinload(Wishlist.product))
            .options(selectinload(Wishlist.variant))
            .options(selectinload(Wishlist.customer))
        )
        result = await db.execute(stmt)
        item = result.scalar_one_or_none() or item
        return _build_response(item)

    async def list_by_customer(
        self, db: AsyncSession, customer_id: int, tenant_id: int
    ) -> List[WishlistResponse]:
        items = await self.repo.list_by_customer(db, customer_id, tenant_id)
        return [_build_response(i) for i in items]

    async def remove(self, db: AsyncSession, wishlist_id: int, tenant_id: int) -> bool:
        item = await self.repo.get(db, wishlist_id)
        if not item or item.tenant_id != tenant_id:
            return False
        await self.repo.soft_delete(db, item)
        return True

    async def get_demand_report(
        self, db: AsyncSession, tenant_id: int
    ) -> List[DemandItem]:
        return await self.repo.get_demand_report(db, tenant_id)

    async def notify_available(
        self, db: AsyncSession, product_id: int, variant_id: Optional[int] = None
    ) -> int:
        """
        Marca wishlists como notificadas quando produto volta ao estoque.
        Retorna quantas notificações foram geradas.
        """
        pending = await self.repo.list_pending_by_product(db, product_id, variant_id)
        for item in pending:
            await self.repo.mark_notified(db, item)
        return len(pending)
