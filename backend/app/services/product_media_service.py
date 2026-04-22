"""
Serviço para gerenciamento da galeria de mídia de produtos.

Regras:
- Cada produto pode ter N fotos de nível produto (variant_id=null)
- Cada variação pode ter N fotos (variant_id=X)
- is_cover=true marca a foto principal → sincroniza com product.image_url / variant.image_url
- Ao deletar o cover, promove automaticamente a próxima foto como capa
"""
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product_media import ProductMedia
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.repositories.product_media_repository import ProductMediaRepository
from app.repositories.product_repository import ProductRepository


class ProductMediaService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ProductMediaRepository(db)
        self.product_repo = ProductRepository(db)

    async def list_product_media(
        self,
        product_id: int,
        tenant_id: int,
        variant_id: Optional[int] = None,
        variant_id_filter: bool = False,
    ) -> List[ProductMedia]:
        """Lista mídia do produto (ou de uma variação específica)."""
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")
        return await self.repo.list_by_product(product_id, variant_id, variant_id_filter)

    async def add_media(
        self,
        product_id: int,
        tenant_id: int,
        url: str,
        media_type: str = "photo",
        variant_id: Optional[int] = None,
    ) -> ProductMedia:
        """
        Adiciona nova mídia ao produto/variação.
        Se for a primeira foto no escopo, define automaticamente como capa.
        Sincroniza com image_url do produto/variação.
        """
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        existing = await self.repo.list_by_product(
            product_id, variant_id, variant_id_filter=True
        )
        is_first = len(existing) == 0

        # Posição = próximo após o último
        next_position = max((m.position for m in existing), default=-1) + 1

        media = await self.repo.create(
            product_id=product_id,
            url=url,
            position=next_position,
            is_cover=is_first,
            media_type=media_type,
            variant_id=variant_id,
        )

        if is_first:
            await self._sync_cover_url(product, variant_id, url)

        await self.db.commit()
        await self.db.refresh(media)
        return media

    async def set_cover(
        self,
        product_id: int,
        media_id: int,
        tenant_id: int,
    ) -> ProductMedia:
        """Define uma foto como capa e sincroniza com image_url."""
        media = await self.repo.get_by_id(media_id)
        if not media or media.product_id != product_id:
            raise ValueError("Mídia não encontrada")

        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        # Remove cover atual no mesmo escopo
        await self.repo.unset_cover(product_id, media.variant_id)
        await self.repo.set_cover(media_id)

        await self._sync_cover_url(product, media.variant_id, media.url)

        await self.db.commit()
        await self.db.refresh(media)
        return media

    async def delete_media(
        self,
        product_id: int,
        media_id: int,
        tenant_id: int,
    ) -> None:
        """Deleta uma mídia. Se era o cover, promove a próxima como capa."""
        media = await self.repo.get_by_id(media_id)
        if not media or media.product_id != product_id:
            raise ValueError("Mídia não encontrada")

        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        was_cover = media.is_cover
        variant_id = media.variant_id

        await self.repo.soft_delete(media_id)

        if was_cover:
            # Promover próxima foto como capa
            remaining = await self.repo.list_by_product(
                product_id, variant_id, variant_id_filter=True
            )
            # Filtra o item recém-deletado (pode ainda estar no resultado antes do commit)
            remaining = [m for m in remaining if m.id != media_id]
            if remaining:
                next_cover = remaining[0]
                await self.repo.set_cover(next_cover.id)
                await self._sync_cover_url(product, variant_id, next_cover.url)
            else:
                # Sem fotos restantes — limpa image_url
                await self._sync_cover_url(product, variant_id, None)

        await self.db.commit()

    async def reorder(
        self,
        product_id: int,
        tenant_id: int,
        items: List[dict],
    ) -> List[ProductMedia]:
        """Reordena fotos do produto."""
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")
        await self.repo.reorder(items)
        await self.db.commit()
        return await self.repo.list_by_product(product_id)

    # ── helpers ──────────────────────────────────────────────────────────────

    async def _sync_cover_url(
        self,
        product: Product,
        variant_id: Optional[int],
        url: Optional[str],
    ) -> None:
        """Sincroniza a URL da capa com product.image_url ou variant.image_url."""
        if variant_id is None:
            product.image_url = url
            self.db.add(product)
        else:
            result = await self.db.execute(
                select(ProductVariant).where(ProductVariant.id == variant_id)
            )
            variant = result.scalar_one_or_none()
            if variant:
                variant.image_url = url
                self.db.add(variant)
