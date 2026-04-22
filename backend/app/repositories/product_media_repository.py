"""
Repositório para ProductMedia (galeria de fotos do produto).
"""
from typing import List, Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product_media import ProductMedia


class ProductMediaRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, media_id: int) -> Optional[ProductMedia]:
        result = await self.db.execute(
            select(ProductMedia).where(ProductMedia.id == media_id, ProductMedia.is_active == True)
        )
        return result.scalar_one_or_none()

    async def list_by_product(
        self,
        product_id: int,
        variant_id: Optional[int] = None,
        variant_id_filter: bool = False,
    ) -> List[ProductMedia]:
        """
        Lista mídia de um produto.
        - variant_id_filter=False → retorna tudo (produto + todas variações)
        - variant_id_filter=True, variant_id=None → só fotos do produto (sem variação)
        - variant_id_filter=True, variant_id=X → só fotos da variação X
        """
        stmt = select(ProductMedia).where(
            ProductMedia.product_id == product_id,
            ProductMedia.is_active == True,
        )
        if variant_id_filter:
            if variant_id is None:
                stmt = stmt.where(ProductMedia.variant_id == None)
            else:
                stmt = stmt.where(ProductMedia.variant_id == variant_id)
        stmt = stmt.order_by(ProductMedia.position, ProductMedia.id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(
        self,
        product_id: int,
        url: str,
        position: int = 0,
        is_cover: bool = False,
        media_type: str = "photo",
        variant_id: Optional[int] = None,
    ) -> ProductMedia:
        media = ProductMedia(
            product_id=product_id,
            variant_id=variant_id,
            url=url,
            position=position,
            is_cover=is_cover,
            media_type=media_type,
        )
        self.db.add(media)
        await self.db.flush()
        await self.db.refresh(media)
        return media

    async def unset_cover(self, product_id: int, variant_id: Optional[int] = None) -> None:
        """Remove is_cover de todas as mídias do escopo (produto ou variação)."""
        stmt = (
            update(ProductMedia)
            .where(
                ProductMedia.product_id == product_id,
                ProductMedia.is_active == True,
                ProductMedia.is_cover == True,
            )
        )
        if variant_id is None:
            stmt = stmt.where(ProductMedia.variant_id == None)
        else:
            stmt = stmt.where(ProductMedia.variant_id == variant_id)
        await self.db.execute(stmt.values(is_cover=False))

    async def set_cover(self, media_id: int) -> None:
        await self.db.execute(
            update(ProductMedia)
            .where(ProductMedia.id == media_id)
            .values(is_cover=True)
        )

    async def soft_delete(self, media_id: int) -> None:
        await self.db.execute(
            update(ProductMedia)
            .where(ProductMedia.id == media_id)
            .values(is_active=False)
        )

    async def reorder(self, items: List[dict]) -> None:
        """items = [{"id": 1, "position": 0}, ...]"""
        for item in items:
            await self.db.execute(
                update(ProductMedia)
                .where(ProductMedia.id == item["id"])
                .values(position=item["position"])
            )
