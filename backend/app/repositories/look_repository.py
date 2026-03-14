"""Repository para Look e LookItem."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.models.look import Look, LookItem
from app.schemas.look import LookCreate, LookUpdate


class LookRepository:

    async def get(self, db: AsyncSession, look_id: int, tenant_id: int) -> Optional[Look]:
        stmt = (
            select(Look)
            .where(Look.id == look_id, Look.tenant_id == tenant_id, Look.is_active == True)
            .options(selectinload(Look.items).selectinload(LookItem.product))
            .options(selectinload(Look.items).selectinload(LookItem.variant))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list(
        self,
        db: AsyncSession,
        tenant_id: int,
        customer_id: Optional[int] = None,
        is_public: Optional[bool] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Look]:
        stmt = (
            select(Look)
            .where(Look.tenant_id == tenant_id, Look.is_active == True)
            .options(selectinload(Look.items).selectinload(LookItem.product))
            .options(selectinload(Look.items).selectinload(LookItem.variant))
            .order_by(Look.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        if customer_id is not None:
            stmt = stmt.where(Look.customer_id == customer_id)
        if is_public is not None:
            stmt = stmt.where(Look.is_public == is_public)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, tenant_id: int, data: LookCreate) -> Look:
        look = Look(
            tenant_id=tenant_id,
            name=data.name,
            description=data.description,
            customer_id=data.customer_id,
            is_public=data.is_public,
            discount_percentage=data.discount_percentage,
        )
        db.add(look)
        await db.flush()

        for item_data in data.items:
            item = LookItem(
                tenant_id=tenant_id,
                look_id=look.id,
                product_id=item_data.product_id,
                variant_id=item_data.variant_id,
                position=item_data.position,
            )
            db.add(item)

        await db.commit()
        await db.refresh(look)
        return look

    async def update(self, db: AsyncSession, look: Look, data: LookUpdate) -> Look:
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(look, field, value)
        await db.commit()
        await db.refresh(look)
        return look

    async def soft_delete(self, db: AsyncSession, look: Look) -> None:
        look.is_active = False
        await db.commit()

    async def add_item(
        self,
        db: AsyncSession,
        tenant_id: int,
        look_id: int,
        product_id: int,
        variant_id: Optional[int],
        position: int = 0,
    ) -> LookItem:
        item = LookItem(
            tenant_id=tenant_id,
            look_id=look_id,
            product_id=product_id,
            variant_id=variant_id,
            position=position,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    async def remove_item(self, db: AsyncSession, item_id: int, look_id: int) -> bool:
        stmt = select(LookItem).where(LookItem.id == item_id, LookItem.look_id == look_id)
        result = await db.execute(stmt)
        item = result.scalar_one_or_none()
        if not item:
            return False
        item.is_active = False
        await db.commit()
        return True
