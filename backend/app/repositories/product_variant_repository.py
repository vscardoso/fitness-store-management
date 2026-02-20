"""
Repositório para operações de banco de dados de variantes de produto.
"""
from typing import List, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product_variant import ProductVariant
from app.models.product import Product
from app.repositories.base import BaseRepository
from app.schemas.product_variant import ProductVariantCreate, ProductVariantUpdate


class ProductVariantRepository(BaseRepository[ProductVariant, ProductVariantCreate, ProductVariantUpdate]):
    """
    Repositório para operações de banco de dados de variantes de produto.
    
    Herda operações CRUD básicas de BaseRepository e adiciona
    operações específicas para variantes.
    """
    
    def __init__(self):
        super().__init__(ProductVariant)
    
    async def get_by_sku(
        self, 
        db: AsyncSession, 
        sku: str, 
        tenant_id: int
    ) -> Optional[ProductVariant]:
        """
        Busca variante por SKU.
        
        Args:
            db: Sessão do banco de dados
            sku: SKU da variante
            tenant_id: ID do tenant
            
        Returns:
            ProductVariant ou None se não encontrado
        """
        result = await db.execute(
            select(ProductVariant)
            .options(
                selectinload(ProductVariant.product),
                selectinload(ProductVariant.inventory),
            )
            .where(
                and_(
                    ProductVariant.sku == sku,
                    ProductVariant.tenant_id == tenant_id,
                    ProductVariant.is_active == True,
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def get_by_product(
        self,
        db: AsyncSession,
        product_id: int,
        tenant_id: int,
        active_only: bool = True
    ) -> List[ProductVariant]:
        """
        Busca todas as variantes de um produto.
        
        Args:
            db: Sessão do banco de dados
            product_id: ID do produto pai
            tenant_id: ID do tenant
            active_only: Se deve retornar apenas variantes ativas
            
        Returns:
            Lista de variantes
        """
        query = select(ProductVariant).where(
            ProductVariant.product_id == product_id,
            ProductVariant.tenant_id == tenant_id,
        )
        
        if active_only:
            query = query.where(ProductVariant.is_active == True)
        
        query = query.order_by(ProductVariant.color, ProductVariant.size)
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    async def get_by_size_color(
        self,
        db: AsyncSession,
        product_id: int,
        size: Optional[str],
        color: Optional[str],
        tenant_id: int
    ) -> Optional[ProductVariant]:
        """
        Busca variante específica por tamanho e cor.
        
        Args:
            db: Sessão do banco de dados
            product_id: ID do produto pai
            size: Tamanho (opcional)
            color: Cor (opcional)
            tenant_id: ID do tenant
            
        Returns:
            ProductVariant ou None se não encontrado
        """
        conditions = [
            ProductVariant.product_id == product_id,
            ProductVariant.tenant_id == tenant_id,
            ProductVariant.is_active == True,
        ]
        
        # Tratar NULL corretamente
        if size is None:
            conditions.append(ProductVariant.size.is_(None))
        else:
            conditions.append(ProductVariant.size == size)
        
        if color is None:
            conditions.append(ProductVariant.color.is_(None))
        else:
            conditions.append(ProductVariant.color == color)
        
        result = await db.execute(
            select(ProductVariant).where(and_(*conditions))
        )
        return result.scalar_one_or_none()
    
    async def search(
        self,
        db: AsyncSession,
        query: str,
        tenant_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[ProductVariant]:
        """
        Busca variantes por termo de pesquisa.
        
        Busca em: SKU, nome do produto, cor.
        
        Args:
            db: Sessão do banco de dados
            query: Termo de pesquisa
            tenant_id: ID do tenant
            skip: Registros para pular (paginação)
            limit: Máximo de registros
            
        Returns:
            Lista de variantes
        """
        search_pattern = f"%{query}%"
        
        result = await db.execute(
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .where(
                and_(
                    ProductVariant.tenant_id == tenant_id,
                    ProductVariant.is_active == True,
                    or_(
                        ProductVariant.sku.ilike(search_pattern),
                        ProductVariant.color.ilike(search_pattern),
                        # Buscar no nome do produto via join
                        ProductVariant.product.has(
                            Product.name.ilike(search_pattern)
                        ),
                    )
                )
            )
            .order_by(ProductVariant.sku)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def exists_by_sku(
        self,
        db: AsyncSession,
        sku: str,
        tenant_id: int,
        exclude_id: Optional[int] = None
    ) -> bool:
        """
        Verifica se já existe variante com o SKU.
        
        Args:
            db: Sessão do banco de dados
            sku: SKU a verificar
            tenant_id: ID do tenant
            exclude_id: ID a excluir da verificação (para updates)
            
        Returns:
            True se existe, False caso contrário
        """
        conditions = [
            ProductVariant.sku == sku,
            ProductVariant.tenant_id == tenant_id,
        ]
        
        if exclude_id:
            conditions.append(ProductVariant.id != exclude_id)
        
        result = await db.execute(
            select(ProductVariant.id).where(and_(*conditions))
        )
        return result.scalar_one_or_none() is not None
    
    async def get_with_stock(
        self,
        db: AsyncSession,
        variant_id: int,
        tenant_id: int
    ) -> Optional[ProductVariant]:
        """
        Busca variante com informações de estoque.
        
        Args:
            db: Sessão do banco de dados
            variant_id: ID da variante
            tenant_id: ID do tenant
            
        Returns:
            ProductVariant com estoque carregado
        """
        result = await db.execute(
            select(ProductVariant)
            .options(
                selectinload(ProductVariant.product),
                selectinload(ProductVariant.inventory),
                selectinload(ProductVariant.entry_items),
            )
            .where(
                and_(
                    ProductVariant.id == variant_id,
                    ProductVariant.tenant_id == tenant_id,
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def get_low_stock_variants(
        self,
        db: AsyncSession,
        tenant_id: int,
        threshold: Optional[int] = None
    ) -> List[ProductVariant]:
        """
        Busca variantes com estoque baixo.
        
        Args:
            db: Sessão do banco de dados
            tenant_id: ID do tenant
            threshold: Limite de estoque baixo (usa min_stock se não informado)
            
        Returns:
            Lista de variantes com estoque baixo
        """
        from app.models.inventory import Inventory
        
        # Subquery para estoque atual
        query = (
            select(ProductVariant)
            .options(
                selectinload(ProductVariant.product),
                selectinload(ProductVariant.inventory),
            )
            .join(Inventory, ProductVariant.id == Inventory.variant_id)
            .where(
                ProductVariant.tenant_id == tenant_id,
                ProductVariant.is_active == True,
                Inventory.is_active == True,
            )
        )
        
        if threshold is not None:
            query = query.where(Inventory.quantity <= threshold)
        else:
            query = query.where(Inventory.quantity <= Inventory.min_stock)
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    async def create_variant(
        self,
        db: AsyncSession,
        product_id: int,
        sku: str,
        price: float,
        tenant_id: int,
        size: Optional[str] = None,
        color: Optional[str] = None,
        cost_price: Optional[float] = None,
        image_url: Optional[str] = None,
    ) -> ProductVariant:
        """
        Cria uma nova variante.
        
        Args:
            db: Sessão do banco de dados
            product_id: ID do produto pai
            sku: SKU da variante
            price: Preço de venda
            tenant_id: ID do tenant
            size: Tamanho (opcional)
            color: Cor (opcional)
            cost_price: Preço de custo (opcional)
            image_url: URL da imagem (opcional)
            
        Returns:
            ProductVariant criada
        """
        from decimal import Decimal
        
        variant = ProductVariant(
            tenant_id=tenant_id,
            product_id=product_id,
            sku=sku,
            size=size,
            color=color,
            price=Decimal(str(price)),
            cost_price=Decimal(str(cost_price)) if cost_price else None,
            image_url=image_url,
            is_active=True,
        )
        
        db.add(variant)
        await db.flush()
        return variant
    
    async def update_variant(
        self,
        db: AsyncSession,
        variant_id: int,
        tenant_id: int,
        **kwargs
    ) -> Optional[ProductVariant]:
        """
        Atualiza uma variante.
        
        Args:
            db: Sessão do banco de dados
            variant_id: ID da variante
            tenant_id: ID do tenant
            **kwargs: Campos a atualizar
            
        Returns:
            ProductVariant atualizada ou None
        """
        variant = await self.get(db, variant_id, tenant_id=tenant_id)
        if not variant:
            return None
        
        for key, value in kwargs.items():
            if hasattr(variant, key):
                setattr(variant, key, value)
        
        await db.flush()
        return variant
    
    async def deactivate_variant(
        self,
        db: AsyncSession,
        variant_id: int,
        tenant_id: int
    ) -> bool:
        """
        Desativa uma variante (soft delete).
        
        Args:
            db: Sessão do banco de dados
            variant_id: ID da variante
            tenant_id: ID do tenant
            
        Returns:
            True se desativada, False se não encontrada
        """
        variant = await self.get(db, variant_id, tenant_id=tenant_id)
        if not variant:
            return False
        
        variant.is_active = False
        await db.flush()
        return True