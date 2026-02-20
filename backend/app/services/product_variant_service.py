"""
Serviço de gerenciamento de variantes de produto.
"""
from typing import List, Optional
from decimal import Decimal
import logging
import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.repositories.product_variant_repository import ProductVariantRepository
from app.repositories.product_repository import ProductRepository
from app.schemas.product_variant import (
    ProductVariantCreate,
    ProductVariantUpdate,
    ProductWithVariantsCreate,
    BulkVariantCreate,
)

logger = logging.getLogger(__name__)


class ProductVariantService:
    """
    Serviço para operações de negócio com variantes de produto.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.variant_repo = ProductVariantRepository()
        self.product_repo = ProductRepository(db)
    
    async def create_variant(
        self,
        product_id: int,
        variant_data: ProductVariantCreate,
        tenant_id: int
    ) -> ProductVariant:
        """
        Cria uma nova variante para um produto existente.
        
        Args:
            product_id: ID do produto pai
            variant_data: Dados da variante
            tenant_id: ID do tenant
            
        Returns:
            ProductVariant criada
            
        Raises:
            ValueError: Se produto não encontrado ou SKU duplicado
        """
        # Verificar se produto existe
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")
        
        # Verificar SKU único
        if await self.variant_repo.exists_by_sku(self.db, variant_data.sku, tenant_id):
            raise ValueError(f"SKU {variant_data.sku} já existe")
        
        # Verificar se já existe variante com mesmo tamanho/cor
        existing = await self.variant_repo.get_by_size_color(
            self.db, product_id, variant_data.size, variant_data.color, tenant_id
        )
        if existing:
            raise ValueError(
                f"Já existe variante com tamanho={variant_data.size} e cor={variant_data.color}"
            )
        
        # Criar variante
        variant = await self.variant_repo.create_variant(
            self.db,
            product_id=product_id,
            sku=variant_data.sku,
            price=float(variant_data.price),
            tenant_id=tenant_id,
            size=variant_data.size,
            color=variant_data.color,
            cost_price=float(variant_data.cost_price) if variant_data.cost_price else None,
            image_url=variant_data.image_url,
        )
        
        await self.db.commit()
        await self.db.refresh(variant)
        
        logger.info(f"Variante criada: {variant.sku} (produto {product_id})")
        return variant
    
    async def create_product_with_variants(
        self,
        data: ProductWithVariantsCreate,
        tenant_id: int,
        user_id: int
    ) -> Product:
        """
        Cria um produto com múltiplas variantes de uma vez.
        
        Args:
            data: Dados do produto e variantes
            tenant_id: ID do tenant
            user_id: ID do usuário
            
        Returns:
            Product criado com variantes
        """
        # Criar produto pai
        product_dict = data.model_dump(exclude={'variants'})
        
        # Usar preço da primeira variante como base_price se não informado
        if not product_dict.get('base_price') and data.variants:
            product_dict['base_price'] = data.variants[0].price
        
        product = await self.product_repo.create(product_dict, tenant_id=tenant_id)
        logger.info(f"Produto pai criado: {product.name} (ID: {product.id})")
        
        # Criar variantes
        for variant_data in data.variants:
            # Verificar SKU único
            if await self.variant_repo.exists_by_sku(self.db, variant_data.sku, tenant_id):
                # Gerar SKU único
                variant_data.sku = await self._generate_unique_sku(
                    product, variant_data.size, variant_data.color, tenant_id
                )
            
            variant = await self.variant_repo.create_variant(
                self.db,
                product_id=product.id,
                sku=variant_data.sku,
                price=float(variant_data.price),
                tenant_id=tenant_id,
                size=variant_data.size,
                color=variant_data.color,
                cost_price=float(variant_data.cost_price) if variant_data.cost_price else None,
                image_url=variant_data.image_url,
            )
            logger.info(f"Variante criada: {variant.sku}")
        
        await self.db.commit()
        await self.db.refresh(product)
        
        return product
    
    async def create_bulk_variants(
        self,
        data: BulkVariantCreate,
        tenant_id: int
    ) -> List[ProductVariant]:
        """
        Cria múltiplas variantes a partir de listas de tamanhos e cores.
        
        Gera uma variante para cada combinação de tamanho × cor.
        
        Args:
            data: Dados para criação em massa
            tenant_id: ID do tenant
            
        Returns:
            Lista de variantes criadas
        """
        # Verificar se produto existe
        product = await self.product_repo.get(self.db, data.product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {data.product_id} não encontrado")
        
        variants = []
        
        for color in data.colors:
            for size in data.sizes:
                # Verificar se já existe
                existing = await self.variant_repo.get_by_size_color(
                    self.db, data.product_id, size, color, tenant_id
                )
                if existing:
                    logger.warning(f"Variante já existe: {size}/{color}, pulando...")
                    continue
                
                # Gerar SKU
                sku = await self._generate_unique_sku(product, size, color, tenant_id, data.sku_prefix)
                
                # Calcular preço com ajustes
                price = data.base_price
                if data.price_adjustments:
                    if size in data.price_adjustments:
                        price += data.price_adjustments[size]
                    if color in data.price_adjustments:
                        price += data.price_adjustments[color]
                
                # Criar variante
                variant = await self.variant_repo.create_variant(
                    self.db,
                    product_id=data.product_id,
                    sku=sku,
                    price=float(price),
                    tenant_id=tenant_id,
                    size=size,
                    color=color,
                )
                variants.append(variant)
                logger.info(f"Variante criada: {sku} ({color} · {size})")
        
        await self.db.commit()
        return variants
    
    async def update_variant(
        self,
        variant_id: int,
        variant_data: ProductVariantUpdate,
        tenant_id: int
    ) -> ProductVariant:
        """
        Atualiza uma variante existente.
        
        Args:
            variant_id: ID da variante
            variant_data: Dados para atualização
            tenant_id: ID do tenant
            
        Returns:
            ProductVariant atualizada
        """
        variant = await self.variant_repo.get(self.db, variant_id, tenant_id=tenant_id)
        if not variant:
            raise ValueError(f"Variante {variant_id} não encontrada")
        
        # Verificar SKU único se estiver sendo alterado
        if variant_data.sku and variant_data.sku != variant.sku:
            if await self.variant_repo.exists_by_sku(
                self.db, variant_data.sku, tenant_id, exclude_id=variant_id
            ):
                raise ValueError(f"SKU {variant_data.sku} já existe")
        
        # Verificar tamanho/cor únicos se estiver sendo alterado
        new_size = variant_data.size if variant_data.size is not None else variant.size
        new_color = variant_data.color if variant_data.color is not None else variant.color
        
        if new_size != variant.size or new_color != variant.color:
            existing = await self.variant_repo.get_by_size_color(
                self.db, variant.product_id, new_size, new_color, tenant_id
            )
            if existing and existing.id != variant_id:
                raise ValueError(
                    f"Já existe variante com tamanho={new_size} e cor={new_color}"
                )
        
        # Atualizar
        update_dict = variant_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(variant, key, value)
        
        await self.db.commit()
        await self.db.refresh(variant)
        
        logger.info(f"Variante atualizada: {variant.sku}")
        return variant
    
    async def get_variant(
        self,
        variant_id: int,
        tenant_id: int
    ) -> Optional[ProductVariant]:
        """Busca uma variante por ID."""
        return await self.variant_repo.get_with_stock(self.db, variant_id, tenant_id)
    
    async def get_variant_by_sku(
        self,
        sku: str,
        tenant_id: int
    ) -> Optional[ProductVariant]:
        """Busca uma variante por SKU."""
        return await self.variant_repo.get_by_sku(self.db, sku, tenant_id)
    
    async def get_product_variants(
        self,
        product_id: int,
        tenant_id: int
    ) -> List[ProductVariant]:
        """Busca todas as variantes de um produto."""
        return await self.variant_repo.get_by_product(self.db, product_id, tenant_id)
    
    async def search_variants(
        self,
        query: str,
        tenant_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[ProductVariant]:
        """Busca variantes por termo."""
        return await self.variant_repo.search(self.db, query, tenant_id, skip, limit)
    
    async def delete_variant(
        self,
        variant_id: int,
        tenant_id: int
    ) -> bool:
        """
        Desativa uma variante (soft delete).
        
        Não permite deletar se houver estoque.
        """
        variant = await self.variant_repo.get_with_stock(self.db, variant_id, tenant_id)
        if not variant:
            raise ValueError(f"Variante {variant_id} não encontrada")
        
        # Verificar estoque
        current_stock = variant.get_current_stock()
        if current_stock > 0:
            raise ValueError(
                f"Não é possível desativar variante com estoque "
                f"(quantidade atual: {current_stock})"
            )
        
        await self.variant_repo.deactivate_variant(self.db, variant_id, tenant_id)
        await self.db.commit()
        
        logger.info(f"Variante desativada: {variant.sku}")
        return True
    
    async def _generate_unique_sku(
        self,
        product: Product,
        size: Optional[str],
        color: Optional[str],
        tenant_id: int,
        prefix: Optional[str] = None
    ) -> str:
        """Gera um SKU único para a variante."""
        # Usar prefixo fornecido ou gerar a partir do produto
        if prefix:
            base = prefix.upper()
        elif product.brand:
            brand_prefix = ''.join(re.findall(r'[A-Z]', product.brand.upper()[:3])) or 'PRO'
            name_prefix = ''.join(re.findall(r'[A-Z]', product.name.upper()[:3])) or 'ITEM'
            base = f"{brand_prefix}-{name_prefix}"
        else:
            name_prefix = ''.join(re.findall(r'[A-Z]', product.name.upper()[:6])) or 'ITEM'
            base = name_prefix
        
        # Adicionar sufixos de cor e tamanho
        color_suffix = color[:3].upper() if color else ''
        size_suffix = size[:2].upper() if size else ''
        
        sku_base = f"{base}-{color_suffix}{size_suffix}"
        
        # Verificar unicidade e adicionar contador se necessário
        counter = 1
        sku = sku_base
        
        while await self.variant_repo.exists_by_sku(self.db, sku, tenant_id):
            counter += 1
            sku = f"{sku_base}-{counter:03d}"
        
        return sku