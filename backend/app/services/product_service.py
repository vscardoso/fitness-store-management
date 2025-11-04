"""
Serviço de gerenciamento de produtos.
"""
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.schemas.product import ProductCreate, ProductUpdate


class ProductService:
    """Serviço para operações de negócio com produtos."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de produtos.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.product_repo = ProductRepository(db)
        self.inventory_repo = InventoryRepository(db)
    
    async def create_product(
        self, 
        product_data: ProductCreate,
        initial_quantity: int = 0,
        min_stock: int = 5
    ) -> Product:
        """
        Cria um novo produto com registro de estoque inicial.
        
        Args:
            product_data: Dados do produto a ser criado
            initial_quantity: Quantidade inicial em estoque (padrão: 0)
            min_stock: Estoque mínimo (padrão: 5)
            
        Returns:
            Product: Produto criado com estoque
            
        Raises:
            ValueError: Se SKU já existe ou dados inválidos
        """
        # Verificar SKU único
        existing = await self.product_repo.get_by_sku(product_data.sku)
        if existing:
            raise ValueError(f"SKU {product_data.sku} já existe")
        
        # Verificar barcode único se fornecido
        if product_data.barcode:
            existing_barcode = await self.product_repo.get_by_barcode(product_data.barcode)
            if existing_barcode:
                raise ValueError(f"Código de barras {product_data.barcode} já existe")
        
        # Criar produto - excluir campos que não pertencem ao modelo Product
        import logging
        logger = logging.getLogger(__name__)
        
        # Usar exclude (sem exclude_unset) para garantir que todos os campos sejam incluídos
        product_dict = product_data.model_dump(exclude={'initial_stock', 'min_stock'})
        logger.info(f"🔍 product_dict ANTES de adicionar initial_quantity: {product_dict}")
        
        # Adicionar initial_quantity que é obrigatório no modelo
        product_dict['initial_quantity'] = initial_quantity
        logger.info(f"🔍 product_dict DEPOIS de adicionar initial_quantity: {product_dict}")
        logger.info(f"🔍 Valor de initial_quantity sendo passado: {initial_quantity} (tipo: {type(initial_quantity)})")
        
        product = await self.product_repo.create(product_dict)
        logger.info(f"✅ Produto criado no repository - ID: {product.id}")
        
        # Criar registro de estoque inicial
        inventory_data = {
            'product_id': product.id,
            'quantity': initial_quantity,
            'min_stock': min_stock,
            'is_active': True
        }
        await self.inventory_repo.create(self.db, inventory_data)
        
        return product
    
    async def update_product(
        self, 
        product_id: int, 
        product_data: ProductUpdate
    ) -> Product:
        """
        Atualiza um produto existente.
        
        Args:
            product_id: ID do produto
            product_data: Dados para atualização
            
        Returns:
            Product: Produto atualizado
            
        Raises:
            ValueError: Se produto não encontrado ou SKU duplicado
        """
        product = await self.product_repo.get(self.db, product_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        # Verificar SKU único se estiver sendo alterado
        if product_data.sku and product_data.sku != product.sku:
            existing = await self.product_repo.get_by_sku(product_data.sku)
            if existing:
                raise ValueError(f"SKU {product_data.sku} já existe")
        
        # Verificar barcode único se estiver sendo alterado
        if product_data.barcode and product_data.barcode != product.barcode:
            existing_barcode = await self.product_repo.get_by_barcode(product_data.barcode)
            if existing_barcode:
                raise ValueError(f"Código de barras {product_data.barcode} já existe")
        
        update_dict = product_data.model_dump(exclude_unset=True)
        updated_product = await self.product_repo.update(self.db, id=product_id, obj_in=update_dict)
        return updated_product
    
    async def delete_product(self, product_id: int) -> bool:
        """
        Deleta um produto (soft delete).
        
        Args:
            product_id: ID do produto
            
        Returns:
            bool: True se deletado com sucesso
            
        Raises:
            ValueError: Se produto não encontrado ou possui estoque
        """
        product = await self.product_repo.get(self.db, product_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        # Verificar se há estoque
        inventory = await self.inventory_repo.get_by_product(product_id)
        if inventory and inventory.quantity > 0:
            raise ValueError(
                f"Não é possível deletar produto com estoque "
                f"(quantidade atual: {inventory.quantity})"
            )
        
        # Soft delete
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': False})
        return True
    
    async def get_product(self, product_id: int) -> Optional[Product]:
        """
        Busca um produto por ID.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get(self.db, product_id)
    
    async def get_product_by_sku(self, sku: str) -> Optional[Product]:
        """
        Busca um produto por SKU.
        
        Args:
            sku: SKU do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get_by_sku(sku)
    
    async def get_product_by_barcode(self, barcode: str) -> Optional[Product]:
        """
        Busca um produto por código de barras.
        
        Args:
            barcode: Código de barras do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get_by_barcode(barcode)
    
    async def search_products(
        self, 
        query: str, 
        skip: int = 0, 
        limit: int = 100
    ) -> List[Product]:
        """
        Busca produtos por termo de pesquisa.
        
        Busca em: nome, descrição, marca e SKU.
        
        Args:
            query: Termo de pesquisa
            skip: Número de registros para pular (paginação)
            limit: Número máximo de registros
            
        Returns:
            List[Product]: Lista de produtos encontrados
        """
        return await self.product_repo.search(query)
    
    async def get_products_by_category(
        self, 
        category_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Product]:
        """
        Lista produtos de uma categoria.
        
        Args:
            category_id: ID da categoria
            skip: Número de registros para pular
            limit: Número máximo de registros
            
        Returns:
            List[Product]: Lista de produtos da categoria
        """
        return await self.product_repo.get_by_category(category_id)
    
    async def get_products_by_brand(
        self, 
        brand: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[Product]:
        """
        Lista produtos de uma marca.
        
        Args:
            brand: Nome da marca
            skip: Número de registros para pular
            limit: Número máximo de registros
            
        Returns:
            List[Product]: Lista de produtos da marca
        """
        return await self.product_repo.get_by_brand(brand)
    
    async def list_products(
        self, 
        skip: int = 0, 
        limit: int = 100,
        active_only: bool = True
    ) -> List[Product]:
        """
        Lista produtos com paginação.
        
        Args:
            skip: Número de registros para pular
            limit: Número máximo de registros
            active_only: Se deve retornar apenas produtos ativos
            
        Returns:
            List[Product]: Lista de produtos
        """
        products = await self.product_repo.get_multi(self.db, skip=skip, limit=limit)
        
        if active_only:
            products = [p for p in products if p.is_active]
        
        return products
    
    async def get_product_with_inventory(self, product_id: int) -> Optional[Product]:
        """
        Busca produto com informações de estoque carregadas.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Optional[Product]: Produto com estoque ou None
        """
        return await self.product_repo.get_with_inventory(product_id)
    
    async def get_low_stock_products(self, threshold: int = None) -> List[Product]:
        """
        Lista produtos com estoque baixo.
        
        Args:
            threshold: Limite de estoque (usa min_stock se não fornecido)
            
        Returns:
            List[Product]: Lista de produtos com estoque baixo
        """
        low_stock_inventory = await self.inventory_repo.get_low_stock_products(threshold)
        
        # Buscar produtos correspondentes
        product_ids = [inv.product_id for inv in low_stock_inventory]
        products = []
        
        for product_id in product_ids:
            product = await self.product_repo.get(self.db, product_id)
            if product and product.is_active:
                products.append(product)
        
        return products
    
    async def activate_product(self, product_id: int) -> bool:
        """
        Ativa um produto desativado.
        
        Args:
            product_id: ID do produto
            
        Returns:
            bool: True se ativado com sucesso
            
        Raises:
            ValueError: Se produto não encontrado
        """
        product = await self.product_repo.get(self.db, product_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': True})
        return True
    
    async def update_product_price(
        self, 
        product_id: int, 
        new_price: float,
        new_cost_price: float = None
    ) -> Product:
        """
        Atualiza preço de um produto.
        
        Args:
            product_id: ID do produto
            new_price: Novo preço de venda
            new_cost_price: Novo preço de custo (opcional)
            
        Returns:
            Product: Produto atualizado
            
        Raises:
            ValueError: Se produto não encontrado ou preço inválido
        """
        if new_price <= 0:
            raise ValueError("Preço deve ser maior que zero")
        
        product = await self.product_repo.get(self.db, product_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        update_data = {'price': new_price}
        if new_cost_price is not None:
            if new_cost_price < 0:
                raise ValueError("Preço de custo não pode ser negativo")
            update_data['cost_price'] = new_cost_price
        
        for key, value in update_data.items():
            setattr(product, key, value)
        
        await self.db.commit()
        await self.db.refresh(product)
        return product
