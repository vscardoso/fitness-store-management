"""
Repositório para operações de produtos (Product).
"""
from typing import Any, Optional, Sequence
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.category import Category
from app.repositories.base import BaseRepository


class ProductRepository(BaseRepository[Product, Any, Any]):
    """Repositório para operações específicas de produtos."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(Product)
        self.db = db
    
    async def create(self, obj_in: dict) -> Product:
        """Wrapper para criar produto."""
        return await super().create(self.db, obj_in)
    
    async def get_by_sku(self, sku: str) -> Optional[Product]:
        """
        Busca um produto pelo SKU.
        
        Args:
            sku: SKU do produto
            
        Returns:
            Produto encontrado ou None
        """
        query = select(Product).where(Product.sku == sku)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_barcode(self, barcode: str) -> Optional[Product]:
        """
        Busca um produto pelo código de barras.
        
        Args:
            barcode: Código de barras do produto
            
        Returns:
            Produto encontrado ou None
        """
        query = select(Product).where(Product.barcode == barcode)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_category(
        self, 
        category_id: int,
        include_relationships: bool = True
    ) -> Sequence[Product]:
        """
        Busca produtos de uma categoria específica (apenas ativos).
        
        Args:
            category_id: ID da categoria
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de produtos da categoria
        """
        query = select(Product).where(
            and_(
                Product.category_id == category_id,
                Product.is_active == True
            )
        ).order_by(Product.name)
        
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
        include_relationships: bool = False
    ) -> Sequence[Product]:
        """
        Busca produtos por nome, descrição, marca ou SKU (apenas ativos).
        
        Args:
            query: Termo de busca
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de produtos encontrados
        """
        search_term = f"%{query.lower()}%"
        
        sql_query = select(Product).where(
            and_(
                or_(
                    Product.name.ilike(search_term),
                    Product.description.ilike(search_term),
                    Product.brand.ilike(search_term),
                    Product.sku.ilike(search_term)
                ),
                Product.is_active == True
            )
        ).order_by(Product.name)
        
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
        include_relationships: bool = False
    ) -> Sequence[Product]:
        """
        Busca produtos por marca (apenas ativos).
        
        Args:
            brand: Nome da marca
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de produtos da marca
        """
        query = select(Product).where(
            and_(
                Product.brand.ilike(f"%{brand}%"),
                Product.is_active == True
            )
        ).order_by(Product.name)
        
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
        include_relationships: bool = False
    ) -> Sequence[Product]:
        """
        Busca produtos por tamanho (apenas ativos).
        
        Args:
            size: Tamanho do produto (P, M, G, GG, etc.)
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de produtos do tamanho
        """
        query = select(Product).where(
            and_(
                Product.size == size,
                Product.is_active == True
            )
        ).order_by(Product.name)
        
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
        include_relationships: bool = False
    ) -> Sequence[Product]:
        """
        Busca produtos por cor (apenas ativos).
        
        Args:
            color: Cor do produto
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de produtos da cor
        """
        query = select(Product).where(
            and_(
                Product.color.ilike(f"%{color}%"),
                Product.is_active == True
            )
        ).order_by(Product.name)
        
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
        include_relationships: bool = False
    ) -> Sequence[Product]:
        """
        Busca produtos por gênero (apenas ativos).
        
        Args:
            gender: Gênero (Masculino, Feminino, Unissex)
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de produtos do gênero
        """
        query = select(Product).where(
            and_(
                Product.gender == gender,
                Product.is_active == True
            )
        ).order_by(Product.name)
        
        if include_relationships:
            query = query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_active_products(
        self, 
        include_relationships: bool = False
    ) -> Sequence[Product]:
        """
        Busca todos os produtos ativos.
        
        Args:
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de produtos ativos
        """
        query = select(Product).where(Product.is_active == True).order_by(Product.name)
        
        if include_relationships:
            query = query.options(
                selectinload(Product.category),
                selectinload(Product.inventory)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def exists_by_sku(self, sku: str, exclude_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um produto com o SKU especificado.
        
        Args:
            sku: SKU a verificar
            exclude_id: ID do produto a excluir da verificação (para updates)
            
        Returns:
            True se o SKU já existe
        """
        conditions = [Product.sku == sku]
        
        if exclude_id is not None:
            conditions.append(Product.id != exclude_id)
        
        query = select(Product.id).where(and_(*conditions))
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def get_with_inventory(self, product_id: int) -> Optional[Product]:
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
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def deactivate_product(self, product_id: int) -> bool:
        """
        Desativa um produto (soft delete).
        
        Args:
            product_id: ID do produto
            
        Returns:
            True se o produto foi desativado com sucesso
        """
        product = await self.get(product_id)
        if product:
            product.is_active = False
            await self.db.commit()
            return True
        return False
    
    async def activate_product(self, product_id: int) -> bool:
        """
        Ativa um produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            True se o produto foi ativado com sucesso
        """
        product = await self.get(product_id)
        if product:
            product.is_active = True
            await self.db.commit()
            return True
        return False
    
    async def get_low_stock(self, threshold: Optional[int] = None) -> Sequence[Product]:
        """
        Busca produtos com estoque abaixo do mínimo.
        
        Args:
            threshold: Threshold customizado (se None, usa min_stock de cada produto)
            
        Returns:
            Lista de produtos com estoque baixo (apenas produtos ativos)
        """
        from app.models.inventory import Inventory
        
        # Query base: produtos ATIVOS com inventário
        query = select(Product).join(Inventory).where(
            Product.is_active == True
        ).options(
            selectinload(Product.inventory)
        )
        
        if threshold is not None:
            # Usa threshold customizado
            query = query.where(Inventory.quantity <= threshold)
        else:
            # Usa min_stock de cada produto
            query = query.where(Inventory.quantity <= Inventory.min_stock)
        
        query = query.order_by(Product.name)
        
        result = await self.db.execute(query)
        return result.scalars().all()
