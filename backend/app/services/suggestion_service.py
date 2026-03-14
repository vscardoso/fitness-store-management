"""
SuggestionService — sugere produtos que combinam com um dado produto.

Algoritmo:
1. Busca tags do produto de referência
2. Encontra outros produtos com tags compatíveis (ex: mesma cor, mesmo estilo)
3. Ranqueia por score (quantas tags batem) e retorna os mais relevantes

Compatibilidade de tags:
- 'color': preto combina com rosa, branco, cinza (complementares definidos)
- 'style': mesma tag bate (athleisure + athleisure)
- 'occasion': mesma tag bate (treino + treino)
- 'season': mesma tag bate (verao + verao)
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.models.product_tag import ProductTag
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.entry_item import EntryItem
from app.schemas.product_tag import SuggestionResponse, ProductTagCreate, ProductTagResponse

# Cores que combinam entre si
COLOR_PAIRS = {
    "preto": ["branco", "rosa", "cinza", "vermelho", "azul", "verde"],
    "branco": ["preto", "rosa", "azul", "verde", "vermelho"],
    "rosa": ["preto", "branco", "cinza", "roxo"],
    "cinza": ["preto", "branco", "rosa", "azul"],
    "azul": ["branco", "cinza", "preto"],
    "roxo": ["rosa", "preto", "cinza"],
    "vermelho": ["preto", "branco", "cinza"],
    "verde": ["preto", "branco"],
    "laranja": ["preto", "branco", "cinza"],
}


def get_compatible_colors(color: str) -> List[str]:
    return COLOR_PAIRS.get(color.lower(), [color])


class SuggestionService:

    async def get_tags(
        self, db: AsyncSession, product_id: int
    ) -> List[ProductTagResponse]:
        stmt = select(ProductTag).where(
            ProductTag.product_id == product_id, ProductTag.is_active == True
        )
        result = await db.execute(stmt)
        tags = result.scalars().all()
        return [ProductTagResponse.model_validate(t) for t in tags]

    async def add_tag(
        self, db: AsyncSession, tenant_id: int, data: ProductTagCreate
    ) -> ProductTagResponse:
        tag = ProductTag(
            tenant_id=tenant_id,
            product_id=data.product_id,
            tag_type=data.tag_type,
            tag_value=data.tag_value.lower().strip(),
        )
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        return ProductTagResponse.model_validate(tag)

    async def delete_tag(self, db: AsyncSession, tag_id: int) -> bool:
        stmt = select(ProductTag).where(ProductTag.id == tag_id, ProductTag.is_active == True)
        result = await db.execute(stmt)
        tag = result.scalar_one_or_none()
        if not tag:
            return False
        tag.is_active = False
        await db.commit()
        return True

    async def suggest(
        self,
        db: AsyncSession,
        product_id: int,
        tenant_id: int,
        limit: int = 6,
    ) -> List[SuggestionResponse]:
        """
        Retorna até `limit` produtos que combinam com o produto de referência.
        """
        # 1. Buscar tags do produto de referência
        stmt = select(ProductTag).where(
            ProductTag.product_id == product_id,
            ProductTag.is_active == True,
        )
        result = await db.execute(stmt)
        ref_tags = result.scalars().all()

        if not ref_tags:
            return await self._fallback_same_category(db, product_id, tenant_id, limit)

        # 2. Construir conjunto de valores compatíveis por tipo
        compatible: dict[str, set] = {}
        for tag in ref_tags:
            if tag.tag_type == "color":
                compatible.setdefault("color", set())
                compatible["color"].update(get_compatible_colors(tag.tag_value))
                compatible["color"].discard(tag.tag_value)  # não sugerir mesma cor
            else:
                compatible.setdefault(tag.tag_type, set())
                compatible[tag.tag_type].add(tag.tag_value)

        if not compatible:
            return []

        # 3. Buscar todos os produtos com alguma tag compatível (exceto o próprio)
        all_products: dict[int, dict] = {}  # product_id → {score, matching_tags}

        for tag_type, values in compatible.items():
            for value in values:
                stmt = (
                    select(ProductTag)
                    .where(
                        ProductTag.tag_type == tag_type,
                        ProductTag.tag_value == value,
                        ProductTag.product_id != product_id,
                        ProductTag.is_active == True,
                    )
                )
                result = await db.execute(stmt)
                matches = result.scalars().all()
                for m in matches:
                    if m.product_id not in all_products:
                        all_products[m.product_id] = {"score": 0, "matching_tags": []}
                    all_products[m.product_id]["score"] += 1
                    all_products[m.product_id]["matching_tags"].append(
                        f"{tag_type}:{value}"
                    )

        if not all_products:
            return await self._fallback_same_category(db, product_id, tenant_id, limit)

        # 4. Ordenar por score e pegar top N
        sorted_ids = sorted(all_products, key=lambda k: all_products[k]["score"], reverse=True)[
            :limit
        ]

        # 5. Buscar dados dos produtos
        suggestions = []
        for pid in sorted_ids:
            stmt = (
                select(Product)
                .where(Product.id == pid, Product.is_active == True)
                .options(selectinload(Product.variants).selectinload(ProductVariant.entry_items))
            )
            result = await db.execute(stmt)
            product = result.scalar_one_or_none()
            if not product:
                continue

            active_variants = [v for v in product.variants if v.is_active]
            prices = [float(v.price) for v in active_variants if v.price]
            total_stock = sum(v.get_current_stock() for v in active_variants)

            suggestions.append(
                SuggestionResponse(
                    product_id=product.id,
                    product_name=product.name,
                    product_image_url=product.image_url,
                    min_price=min(prices) if prices else 0,
                    max_price=max(prices) if prices else 0,
                    total_stock=total_stock,
                    matching_tags=all_products[pid]["matching_tags"],
                    score=all_products[pid]["score"],
                )
            )

        return suggestions

    async def _fallback_same_category(
        self, db: AsyncSession, product_id: int, tenant_id: int, limit: int
    ) -> List[SuggestionResponse]:
        """Fallback: produtos da mesma categoria quando não há tags."""
        stmt = select(Product).where(Product.id == product_id, Product.is_active == True)
        result = await db.execute(stmt)
        ref = result.scalar_one_or_none()
        if not ref or not ref.category_id:
            return []

        stmt = (
            select(Product)
            .where(
                Product.category_id == ref.category_id,
                Product.id != product_id,
                Product.is_active == True,
            )
            .options(selectinload(Product.variants).selectinload(ProductVariant.entry_items))
            .limit(limit)
        )
        result = await db.execute(stmt)
        products = result.scalars().all()

        suggestions = []
        for p in products:
            active_variants = [v for v in p.variants if v.is_active]
            prices = [float(v.price) for v in active_variants if v.price]
            total_stock = sum(v.get_current_stock() for v in active_variants)
            suggestions.append(
                SuggestionResponse(
                    product_id=p.id,
                    product_name=p.name,
                    product_image_url=p.image_url,
                    min_price=min(prices) if prices else 0,
                    max_price=max(prices) if prices else 0,
                    total_stock=total_stock,
                    matching_tags=[],
                    score=0,
                )
            )
        return suggestions
