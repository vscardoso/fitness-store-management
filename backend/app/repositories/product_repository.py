"""
Repositório para operações de produtos (Product).
"""
from typing import Any, Optional, Sequence
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.category import Category
from app.repositories.base import BaseRepository


class ProductRepository(BaseRepository[Product, Any, Any]):
    """Repositório para operações específicas de produtos."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(Product)
        self.db = db
    
    async def create(self, obj_in: dict, *, tenant_id: int | None = None) -> Product:
        """Wrapper para criar produto."""
        return await super().create(self.db, obj_in, tenant_id=tenant_id)
    
    async def get(self, db: AsyncSession, id: int, *, tenant_id: int | None = None) -> Optional[Product]:
        """
        Busca um produto por ID com variantes carregadas.
        
        Args:
            id: ID do produto
            tenant_id: ID do tenant (opcional)
            
        Returns:
            Produto encontrado ou None
        """
        query = select(Product).where(Product.id == id).options(
            selectinload(Product.variants),
            selectinload(Product.category),
            selectinload(Product.inventory)
        )
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_sku(self, sku: str, *, tenant_id: int | None = None) -> Optional[Product]:
        """
        Busca um produto pelo SKU (busca em variantes).
        
        Args:
            sku: SKU da variante
            
        Returns:
            Produto encontrado ou None
        """
        # SKU agora está em ProductVariant, não em Product
        query = select(Product).join(ProductVariant).where(
            ProductVariant.sku == sku
        ).options(selectinload(Product.variants))
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_barcode(self, barcode: str, *, tenant_id: int | None = None) -> Optional[Product]:
        """
        Busca um produto pelo código de barras (busca em variantes).
        
        Args:
            barcode: Código de barras da variante
            
        Returns:
            Produto encontrado ou None
        """
        # Barcode agora está em ProductVariant
        query = select(Product).join(ProductVariant).where(
            ProductVariant.barcode == barcode
        ).options(selectinload(Product.variants))
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_category(
        self,
        category_id: int,
        include_relationships: bool = True,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[Product]:
        """
        Busca produtos de uma categoria específica (apenas ativos, não catálogo).

        Args:
            category_id: ID da categoria
            include_relationships: Se deve incluir relacionamentos

        Returns:
            Lista de produtos da categoria
        """
        query = select(Product).where(
            and_(
                Product.category_id == category_id,
                Product.is_active == True,
                Product.is_catalog == False
            )
        ).order_by(Product.name)
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        if include_relationships:
            query = query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def search(
        self,
        query: str,
        include_relationships: bool = False,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[Product]:
        """
        Busca produtos por nome, descrição, marca ou SKU (apenas ativos, não catálogo).

        Args:
            query: Termo de busca
            include_relationships: Se deve incluir relacionamentos

        Returns:
            Lista de produtos encontrados
        """
        search_term = f"%{query.lower()}%"

        # SKU agora está em ProductVariant - usar join para buscar
        from sqlalchemy import any_
        
        sql_query = select(Product).join(ProductVariant, isouter=True).where(
            and_(
                or_(
                    Product.name.ilike(search_term),
                    Product.description.ilike(search_term),
                    Product.brand.ilike(search_term),
                    ProductVariant.sku.ilike(search_term)
                ),
                Product.is_active == True,
                Product.is_catalog == False
            )
        ).options(selectinload(Product.variants)).order_by(Product.name).distinct()
        if tenant_id is not None:
            sql_query = sql_query.where(Product.tenant_id == tenant_id)
        
        if include_relationships:
            sql_query = sql_query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(sql_query)
        return result.scalars().all()
    
    async def get_by_brand(
        self,
        brand: str,
        include_relationships: bool = False,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[Product]:
        """
        Busca produtos por marca (apenas ativos, não catálogo).

        Args:
            brand: Nome da marca
            include_relationships: Se deve incluir relacionamentos

        Returns:
            Lista de produtos da marca
        """
        query = select(Product).where(
            and_(
                Product.brand.ilike(f"%{brand}%"),
                Product.is_active == True,
                Product.is_catalog == False
            )
        ).order_by(Product.name)
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        if include_relationships:
            query = query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_by_size(
        self,
        size: str,
        include_relationships: bool = False,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[Product]:
        """
        Busca produtos por tamanho (apenas ativos, não catálogo).

        Args:
            size: Tamanho do produto (P, M, G, GG, etc.)
            include_relationships: Se deve incluir relacionamentos

        Returns:
            Lista de produtos do tamanho
        """
        query = select(Product).where(
            and_(
                Product.size == size,
                Product.is_active == True,
                Product.is_catalog == False
            )
        ).order_by(Product.name)
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        if include_relationships:
            query = query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_by_color(
        self,
        color: str,
        include_relationships: bool = False,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[Product]:
        """
        Busca produtos por cor (apenas ativos, não catálogo).

        Args:
            color: Cor do produto
            include_relationships: Se deve incluir relacionamentos

        Returns:
            Lista de produtos da cor
        """
        query = select(Product).where(
            and_(
                Product.color.ilike(f"%{color}%"),
                Product.is_active == True,
                Product.is_catalog == False
            )
        ).order_by(Product.name)
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        if include_relationships:
            query = query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_by_gender(
        self,
        gender: str,
        include_relationships: bool = False,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[Product]:
        """
        Busca produtos por gênero (apenas ativos, não catálogo).

        Args:
            gender: Gênero (Masculino, Feminino, Unissex)
            include_relationships: Se deve incluir relacionamentos

        Returns:
            Lista de produtos do gênero
        """
        query = select(Product).where(
            and_(
                Product.gender == gender,
                Product.is_active == True,
                Product.is_catalog == False
            )
        ).order_by(Product.name)
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        if include_relationships:
            query = query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_active_products(
        self,
        include_relationships: bool = False,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[Product]:
        """
        Busca todos os produtos ativos (não catálogo).

        Args:
            include_relationships: Se deve incluir relacionamentos

        Returns:
            Lista de produtos ativos
        """
        query = select(Product).where(
            and_(
                Product.is_active == True,
                Product.is_catalog == False
            )
        ).order_by(Product.name)
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        if include_relationships:
            query = query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def exists_by_sku(self, sku: str, exclude_id: Optional[int] = None, *, tenant_id: int | None = None) -> bool:
        """
        Verifica se existe um produto com o SKU especificado (busca em variantes).
        
        Args:
            sku: SKU a verificar
            exclude_id: ID do produto a excluir da verificação (para updates)
            
        Returns:
            True se o SKU já existe
        """
        # SKU agora está em ProductVariant
        conditions = [ProductVariant.sku == sku]
        if tenant_id is not None:
            conditions.append(ProductVariant.tenant_id == tenant_id)
        
        if exclude_id is not None:
            conditions.append(ProductVariant.product_id != exclude_id)
        
        query = select(ProductVariant.id).where(and_(*conditions))
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def get_with_inventory(self, product_id: int, *, tenant_id: int | None = None) -> Optional[Product]:
        """
        Busca um produto específico com informações de inventário carregadas.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Produto com inventário ou None se não encontrado
        """
        query = select(Product).where(Product.id == product_id).options(
            selectinload(Product.category),
            selectinload(Product.inventory)
        )
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def deactivate_product(self, product_id: int, *, tenant_id: int | None = None) -> bool:
        """
        Desativa um produto (soft delete).
        
        Args:
            product_id: ID do produto
            
        Returns:
            True se o produto foi desativado com sucesso
        """
        product = await self.get(self.db, product_id, tenant_id=tenant_id)
        if product:
            product.is_active = False
            await self.db.commit()
            return True
        return False
    
    async def activate_product(self, product_id: int, *, tenant_id: int | None = None) -> bool:
        """
        Ativa um produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            True se o produto foi ativado com sucesso
        """
        product = await self.get(self.db, product_id, tenant_id=tenant_id)
        if product:
            product.is_active = True
            await self.db.commit()
            return True
        return False
    
    async def get_low_stock(self, threshold: Optional[int] = None, *, tenant_id: int | None = None) -> Sequence[Product]:
        """
        Busca produtos com estoque abaixo do mínimo.

        Args:
            threshold: Threshold customizado (se None, usa min_stock de cada produto)

        Returns:
            Lista de produtos com estoque baixo (apenas produtos ativos, não catálogo)
        """
        from app.models.inventory import Inventory

        # Query base: produtos ATIVOS (não catálogo) com inventário
        query = select(Product).join(Inventory).where(
            and_(
                Product.is_active == True,
                Product.is_catalog == False
            )
        ).options(
            selectinload(Product.inventory)
        )
        if tenant_id is not None:
            query = query.where(Product.tenant_id == tenant_id)
        
        if threshold is not None:
            # Usa threshold customizado
            query = query.where(Inventory.quantity <= threshold)
        else:
            # Usa min_stock de cada produto
            query = query.where(Inventory.quantity <= Inventory.min_stock)
        
        query = query.order_by(Product.name)
        
        result = await self.db.execute(query)
        return result.scalars().all()
