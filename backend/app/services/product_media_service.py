"""
Serviço para gerenciamento da galeria de mídia de produtos.

Regras:
- Cada produto pode ter N fotos de nível produto (variant_id=null)
- Cada variação pode ter N fotos (variant_id=X)
- is_cover=true marca a foto principal do escopo (produto ou cor) → sincroniza com variant.image_url
- Ao deletar o cover, promove automaticamente a próxima foto como capa

Capa do PRODUTO (product.image_url: lista de produtos, catálogo da Meta, vitrine) = a foto de UMA das cores
(decisão do Victor, 2026-11-03). A primeira cor que ganha foto vira a capa; depois só muda quando alguém escolhe
"Usar como capa" (`set_product_cover_variant`). Antes a capa mudava sozinha para a última cor que recebeu foto.
Foto antiga sem cor (variant_id nulo) pode ser passada para a cor certa (`assign_to_variant`).
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
        if variant_id is not None:
            v_ok = (await self.db.execute(
                select(ProductVariant.id).where(
                    ProductVariant.id == variant_id,
                    ProductVariant.product_id == product_id,
                    ProductVariant.tenant_id == tenant_id,
                )
            )).scalar_one_or_none()
            if v_ok is None:
                raise ValueError(f"Variação {variant_id} não encontrada")

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
            tenant_id=product.tenant_id,
        )

        if is_first:
            await self._sync_cover_url(product, variant_id, url)
            # primeira foto de uma cor só vira a capa do produto se o produto ainda não tem capa
            if variant_id is not None and not product.image_url:
                product.image_url = url
                self.db.add(product)

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

        # a cor que é a capa do produto continua capa, agora com a foto nova escolhida dela
        old_scope_cover = await self._scope_cover_url(product_id, media.variant_id)
        was_product_cover = media.variant_id is not None and old_scope_cover is not None and product.image_url == old_scope_cover

        # Remove cover atual no mesmo escopo
        await self.repo.unset_cover(product_id, media.variant_id)
        await self.repo.set_cover(media_id)

        await self._sync_cover_url(product, media.variant_id, media.url)
        if was_product_cover:
            product.image_url = media.url
            self.db.add(product)

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
        was_product_cover = media.url == product.image_url

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

        # a foto apagada era a capa do produto: passa para a próxima da mesma cor, senão outra cor, senão nenhuma
        if was_product_cover:
            product.image_url = await self._next_product_cover(product_id, variant_id, media_id)
            self.db.add(product)

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
        await self.repo.reorder(product_id, items)
        await self.db.commit()
        return await self.repo.list_by_product(product_id)

    async def set_product_cover_variant(self, product_id: int, variant_id: int, tenant_id: int) -> Product:
        """"Usar como capa": a foto da cor escolhida vira a capa do produto."""
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")
        url = await self._scope_cover_url(product_id, variant_id)
        if not url:
            raise LookupError("Esta cor ainda não tem foto.")
        product.image_url = url
        self.db.add(product)
        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def assign_main_photo_to_variant(self, product_id: int, variant_id: int, tenant_id: int) -> ProductMedia:
        """A foto principal antiga (sem cor) passa para a cor certa e vira a foto dela, sem enviar de novo.

        Produtos antigos têm a foto principal só em product.image_url (sem registro na galeria) ou como foto da galeria
        sem cor; nos dois casos a foto vira a capa da cor e continua sendo a capa do produto.
        """
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")
        if not product.image_url:
            raise LookupError("O produto não tem foto principal.")
        everything = await self.repo.list_by_product(product_id)
        if any(m.variant_id is not None and m.url == product.image_url for m in everything):
            raise LookupError("A foto principal já é de uma cor.")
        media = next((m for m in everything if m.variant_id is None and m.url == product.image_url), None)
        v_ok = (await self.db.execute(
            select(ProductVariant.id).where(
                ProductVariant.id == variant_id, ProductVariant.product_id == product_id,
                ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if v_ok is None:
            raise ValueError(f"Variação {variant_id} não encontrada")
        await self.repo.unset_cover(product_id, variant_id)
        if media is None:
            # só havia o endereço no produto: cria o registro da foto na galeria, já na cor
            media = await self.repo.create(product_id=product_id, url=product.image_url, position=0, is_cover=True,
                                           media_type="photo", variant_id=variant_id, tenant_id=product.tenant_id)
        else:
            media.variant_id = variant_id
            media.is_cover = True
            self.db.add(media)
        await self._sync_cover_url(product, variant_id, media.url)
        await self.db.commit()
        await self.db.refresh(media)
        return media

    # ── helpers ──────────────────────────────────────────────────────────────

    async def _scope_cover_url(self, product_id: int, variant_id: Optional[int]) -> Optional[str]:
        """URL da foto capa de um escopo (cor ou produto), ou a primeira dele."""
        items = await self.repo.list_by_product(product_id, variant_id, variant_id_filter=True)
        items = [m for m in items if m.is_active]
        if not items:
            return None
        cover = next((m for m in items if m.is_cover), items[0])
        return cover.url

    async def _next_product_cover(self, product_id: int, variant_id: Optional[int], deleted_id: int) -> Optional[str]:
        """Nova capa do produto depois de apagar a capa: mesma cor, outra cor, foto sem cor, ou nenhuma."""
        everything = [m for m in await self.repo.list_by_product(product_id) if m.is_active and m.id != deleted_id]
        same = [m for m in everything if m.variant_id == variant_id]
        others = [m for m in everything if m.variant_id is not None and m.variant_id != variant_id]
        loose = [m for m in everything if m.variant_id is None]
        for group in (same, others, loose):
            if group:
                return next((m for m in group if m.is_cover), group[0]).url
        return None

    async def _sync_cover_url(
        self,
        product: Product,
        variant_id: Optional[int],
        url: Optional[str],
    ) -> None:
        """Sincroniza a URL da capa com product.image_url e variant.image_url.

        Quando uma variação define capa (url != None), também atualiza
        product.image_url para que a lista de produtos mostre a foto correta.
        """
        if variant_id is None:
            product.image_url = url
            self.db.add(product)
        else:
            result = await self.db.execute(
                select(ProductVariant).where(
                    ProductVariant.id == variant_id, ProductVariant.product_id == product.id
                )
            )
            variant = result.scalar_one_or_none()
            if variant:
                variant.image_url = url
                self.db.add(variant)
            # a capa do PRODUTO não acompanha mais a última cor mexida (ver regra no topo do arquivo)
