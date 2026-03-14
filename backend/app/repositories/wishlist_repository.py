"""Repository para Wishlist."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime

from app.models.wishlist import Wishlist
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.schemas.wishlist import WishlistCreate, DemandItem


class WishlistRepository:

    async def get(self, db: AsyncSession, wishlist_id: int) -> Optional[Wishlist]:
        stmt = select(Wishlist).where(Wishlist.id == wishlist_id, Wishlist.is_active == True)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_customer(
        self, db: AsyncSession, customer_id: int, tenant_id: int
    ) -> List[Wishlist]:
        stmt = (
            select(Wishlist)
            .where(
                Wishlist.customer_id == customer_id,
                Wishlist.tenant_id == tenant_id,
                Wishlist.is_active == True,
            )
            .options(selectinload(Wishlist.product))
            .options(selectinload(Wishlist.variant))
            .order_by(Wishlist.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def list_pending_by_product(
        self, db: AsyncSession, product_id: int, variant_id: Optional[int] = None
    ) -> List[Wishlist]:
        """Todos os wishlists não notificados para um produto/variante."""
        stmt = select(Wishlist).where(
            Wishlist.product_id == product_id,
            Wishlist.notified == False,
            Wishlist.is_active == True,
        )
        if variant_id:
            stmt = stmt.where(Wishlist.variant_id == variant_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, tenant_id: int, data: WishlistCreate) -> Wishlist:
        # Evitar duplicatas
        existing = await self.find_existing(
            db, data.customer_id, data.product_id, data.variant_id
        )
        if existing:
            return existing

        item = Wishlist(
            tenant_id=tenant_id,
            customer_id=data.customer_id,
            product_id=data.product_id,
            variant_id=data.variant_id,
            look_id=data.look_id,
            notes=data.notes,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    async def find_existing(
        self,
        db: AsyncSession,
        customer_id: int,
        product_id: int,
        variant_id: Optional[int],
    ) -> Optional[Wishlist]:
        stmt = select(Wishlist).where(
            Wishlist.customer_id == customer_id,
            Wishlist.product_id == product_id,
            Wishlist.is_active == True,
        )
        if variant_id:
            stmt = stmt.where(Wishlist.variant_id == variant_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_notified(self, db: AsyncSession, wishlist: Wishlist) -> None:
        wishlist.notified = True
        wishlist.notified_at = datetime.utcnow()
        await db.commit()

    async def soft_delete(self, db: AsyncSession, wishlist: Wishlist) -> None:
        wishlist.is_active = False
        await db.commit()

    async def get_demand_report(
        self, db: AsyncSession, tenant_id: int, limit: int = 20
    ) -> List[DemandItem]:
        """Produtos mais desejados (agregado por produto+variante)."""
        stmt = (
            select(
                Wishlist.product_id,
                Wishlist.variant_id,
                func.count(Wishlist.id).label("waiting_count"),
            )
            .where(
                Wishlist.tenant_id == tenant_id,
                Wishlist.notified == False,
                Wishlist.is_active == True,
            )
            .group_by(Wishlist.product_id, Wishlist.variant_id)
            .order_by(func.count(Wishlist.id).desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = result.all()

        demand_items: List[DemandItem] = []
        for row in rows:
            product = await db.get(Product, row.product_id)
            if not product:
                continue
            variant = await db.get(ProductVariant, row.variant_id) if row.variant_id else None
            price = float(variant.price if variant else product.base_price or 0)
            variant_desc = None
            if variant:
                parts = [v for v in [variant.size, variant.color] if v]
                variant_desc = " / ".join(parts) if parts else None

            demand_items.append(
                DemandItem(
                    product_id=row.product_id,
                    product_name=product.name,
                    variant_id=row.variant_id,
                    variant_description=variant_desc,
                    waiting_count=row.waiting_count,
                    potential_revenue=price * row.waiting_count,
                    product_image_url=product.image_url,
                )
            )
        return demand_items
