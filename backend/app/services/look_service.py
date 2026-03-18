"""Service de Looks — regras de negócio."""
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.models.look import Look, LookItem
from app.repositories.look_repository import LookRepository
from app.schemas.look import LookCreate, LookUpdate, LookResponse, LookListResponse, LookItemResponse


def _build_item_response(item: LookItem) -> LookItemResponse:
    price = None
    if item.variant and item.variant.price:
        price = float(item.variant.price)
    elif item.product and item.product.base_price:
        price = float(item.product.base_price)

    variant_desc = None
    if item.variant:
        parts = [v for v in [item.variant.size, item.variant.color] if v]
        variant_desc = " / ".join(parts) if parts else None

    return LookItemResponse(
        id=item.id,
        look_id=item.look_id,
        product_id=item.product_id,
        variant_id=item.variant_id,
        position=item.position,
        product_name=item.product.name if item.product else None,
        variant_description=variant_desc,
        product_image_url=item.product.image_url if item.product else None,
        unit_price=price,
        created_at=item.created_at,
    )


def _build_response(look: Look) -> LookResponse:
    items = [_build_item_response(i) for i in look.items if i.is_active]
    total = sum(i.unit_price or 0 for i in items)
    discount = look.discount_percentage or 0
    if discount > 0 and len(items) >= 3:
        total = total * (1 - discount / 100)

    return LookResponse(
        id=look.id,
        tenant_id=look.tenant_id,
        name=look.name,
        description=look.description,
        customer_id=look.customer_id,
        is_public=look.is_public,
        discount_percentage=look.discount_percentage,
        items=items,
        total_price=round(total, 2),
        items_count=len(items),
        created_at=look.created_at,
        updated_at=look.updated_at,
    )


def _build_list_response(look: Look) -> LookListResponse:
    items = [i for i in look.items if i.is_active]
    return LookListResponse(
        id=look.id,
        name=look.name,
        description=look.description,
        customer_id=look.customer_id,
        is_public=look.is_public,
        discount_percentage=look.discount_percentage,
        items_count=len(items),
        total_price=0.0,
        created_at=look.created_at,
    )


class LookService:
    def __init__(self):
        self.repo = LookRepository()

    async def create(self, db: AsyncSession, tenant_id: int, data: LookCreate) -> LookResponse:
        # Regra: desconto de 10% automático para 3+ peças
        if len(data.items) >= 3 and data.discount_percentage == 0:
            data.discount_percentage = 10.0
        look = await self.repo.create(db, tenant_id, data)
        # Recarregar com relacionamentos
        look = await self.repo.get(db, look.id, tenant_id)
        return _build_response(look)

    async def list(
        self,
        db: AsyncSession,
        tenant_id: int,
        customer_id: Optional[int] = None,
        is_public: Optional[bool] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[LookListResponse]:
        looks = await self.repo.list(db, tenant_id, customer_id, is_public, skip, limit)
        return [_build_list_response(l) for l in looks]

    async def get(self, db: AsyncSession, look_id: int, tenant_id: int) -> Optional[LookResponse]:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return None
        return _build_response(look)

    async def update(
        self, db: AsyncSession, look_id: int, tenant_id: int, data: LookUpdate
    ) -> Optional[LookResponse]:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return None
        look = await self.repo.update(db, look, data)
        look = await self.repo.get(db, look.id, tenant_id)
        return _build_response(look)

    async def delete(self, db: AsyncSession, look_id: int, tenant_id: int) -> bool:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return False
        await self.repo.soft_delete(db, look)
        return True

    async def add_item(
        self,
        db: AsyncSession,
        look_id: int,
        tenant_id: int,
        product_id: int,
        variant_id: Optional[int],
        position: int = 0,
    ) -> Optional[LookResponse]:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return None
        await self.repo.add_item(db, tenant_id, look_id, product_id, variant_id, position)
        # Expirar do identity map para forçar re-query com os novos itens
        await db.refresh(look)
        look = await self.repo.get(db, look_id, tenant_id)
        return _build_response(look)

    async def remove_item(
        self, db: AsyncSession, look_id: int, item_id: int, tenant_id: int
    ) -> bool:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return False
        return await self.repo.remove_item(db, item_id, look_id)
