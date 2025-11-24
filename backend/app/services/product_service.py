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
        min_stock: int = 5,
        *,
        tenant_id: int,
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
        existing = await self.product_repo.get_by_sku(product_data.sku, tenant_id=tenant_id)
        if existing:
            raise ValueError(f"SKU {product_data.sku} já existe")
        
        # Verificar barcode único se fornecido
        if product_data.barcode:
            existing_barcode = await self.product_repo.get_by_barcode(product_data.barcode, tenant_id=tenant_id)
            if existing_barcode:
                raise ValueError(f"Código de barras {product_data.barcode} já existe")
        
        # Criar produto - excluir campos que não pertencem ao modelo Product
        import logging
        logger = logging.getLogger(__name__)

        # Remover campos específicos de estoque e alias sale_price do payload do produto
        product_dict = product_data.model_dump(exclude={"initial_stock", "min_stock", "sale_price"})

        # Criar produto no repositório
        product = await self.product_repo.create(product_dict, tenant_id=tenant_id)
        logger.info(f"✅ Produto criado no repository - ID: {product.id}")

        # Criar/atualizar registro de estoque inicial usando o repositório de inventário
        try:
            from app.models.inventory import MovementType
            await self.inventory_repo.update_stock(
                product_id=product.id,
                quantity=initial_quantity,
                movement_type=MovementType.PURCHASE,
                notes="Estoque inicial na criação do produto",
                reference_id=f"product:{product.id}",
                tenant_id=tenant_id,
            )
            # Ajustar min_stock se necessário
            inventory = await self.inventory_repo.get_by_product(product.id)
            if inventory and min_stock is not None:
                inventory.min_stock = min_stock
                await self.db.commit()
        except Exception as inv_err:
            logger.error(f"Erro ao registrar estoque inicial para o produto {product.id}: {inv_err}")
            # Não falhar a criação do produto por causa do estoque inicial
        
        return product
    
    async def update_product(
        self, 
        product_id: int, 
        product_data: ProductUpdate,
        *,
        tenant_id: int,
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
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        # Verificar SKU único se estiver sendo alterado
        if product_data.sku and product_data.sku != product.sku:
            existing = await self.product_repo.get_by_sku(product_data.sku, tenant_id=tenant_id)
            if existing:
                raise ValueError(f"SKU {product_data.sku} já existe")
        
        # Verificar barcode único se estiver sendo alterado
        if product_data.barcode and product_data.barcode != product.barcode:
            existing_barcode = await self.product_repo.get_by_barcode(product_data.barcode, tenant_id=tenant_id)
            if existing_barcode:
                raise ValueError(f"Código de barras {product_data.barcode} já existe")
        
        update_dict = product_data.model_dump(exclude_unset=True)
        updated_product = await self.product_repo.update(self.db, id=product_id, obj_in=update_dict, tenant_id=tenant_id)
        return updated_product
    
    async def delete_product(self, product_id: int, *, tenant_id: int) -> bool:
        """
        Deleta um produto (soft delete).
        
        Args:
            product_id: ID do produto
            
        Returns:
            bool: True se deletado com sucesso
            
        Raises:
            ValueError: Se produto não encontrado ou possui estoque
        """
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        # Verificar se há estoque
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        if inventory and inventory.quantity > 0:
            raise ValueError(
                f"Não é possível deletar produto com estoque "
                f"(quantidade atual: {inventory.quantity})"
            )
        
        # Soft delete
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': False}, tenant_id=tenant_id)
        return True
    
    async def get_product(self, product_id: int, *, tenant_id: int) -> Optional[Product]:
        """
        Busca um produto por ID.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
    
    async def get_product_by_sku(self, sku: str, *, tenant_id: int) -> Optional[Product]:
        """
        Busca um produto por SKU.
        
        Args:
            sku: SKU do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get_by_sku(sku, tenant_id=tenant_id)
    
    async def get_product_by_barcode(self, barcode: str, *, tenant_id: int) -> Optional[Product]:
        """
        Busca um produto por código de barras.
        
        Args:
            barcode: Código de barras do produto
            
        Returns:
            Optional[Product]: Produto encontrado ou None
        """
        return await self.product_repo.get_by_barcode(barcode, tenant_id=tenant_id)
    
    async def search_products(
        self, 
        query: str, 
        skip: int = 0, 
        limit: int = 100,
        *,
        tenant_id: int,
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
        return await self.product_repo.search(query, tenant_id=tenant_id)
    
    async def get_products_by_category(
        self, 
        category_id: int,
        skip: int = 0,
        limit: int = 100,
        *,
        tenant_id: int,
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
        return await self.product_repo.get_by_category(category_id, tenant_id=tenant_id)
    
    async def get_products_by_brand(
        self, 
        brand: str,
        skip: int = 0,
        limit: int = 100,
        *,
        tenant_id: int,
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
        return await self.product_repo.get_by_brand(brand, tenant_id=tenant_id)
    
    async def list_products(
        self, 
        skip: int = 0, 
        limit: int = 100,
        active_only: bool = True,
        *,
        tenant_id: int,
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
        products = await self.product_repo.get_multi(self.db, skip=skip, limit=limit, tenant_id=tenant_id)
        
        if active_only:
            products = [p for p in products if p.is_active]
        
        return products
    
    async def get_product_with_inventory(self, product_id: int, *, tenant_id: int) -> Optional[Product]:
        """
        Busca produto com informações de estoque carregadas.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Optional[Product]: Produto com estoque ou None
        """
        return await self.product_repo.get_with_inventory(product_id, tenant_id=tenant_id)
    
    async def get_low_stock_products(self, threshold: int = None, *, tenant_id: int) -> List[Product]:
        """
        Lista produtos com estoque baixo.
        
        Args:
            threshold: Limite de estoque (usa min_stock se não fornecido)
            
        Returns:
            List[Product]: Lista de produtos com estoque baixo
        """
        low_stock_inventory = await self.inventory_repo.get_low_stock_products(threshold, tenant_id=tenant_id)
        
        # Buscar produtos correspondentes
        product_ids = [inv.product_id for inv in low_stock_inventory]
        products = []
        
        for product_id in product_ids:
            product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
            if product and product.is_active:
                products.append(product)
        
        return products
    
    async def activate_product(self, product_id: int, *, tenant_id: int) -> bool:
        """
        Ativa um produto desativado.
        
        Args:
            product_id: ID do produto
            
        Returns:
            bool: True se ativado com sucesso
            
        Raises:
            ValueError: Se produto não encontrado
        """
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError("Produto não encontrado")
        
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': True}, tenant_id=tenant_id)
        return True
    
    async def update_product_price(
        self, 
        product_id: int, 
        new_price: float,
        new_cost_price: float = None,
        *,
        tenant_id: int,
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
        
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
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

    async def get_catalog_products(
        self,
        *,
        tenant_id: int,
        category_id: Optional[int] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Product]:
        """
        Lista produtos do CATÁLOGO (templates).

        Estes são os 115 produtos padrão que aparecem para novas lojas.
        O usuário pode "ativar" produtos do catálogo para adicionar à sua loja.

        Args:
            tenant_id: ID do tenant (para filtrar produtos do catálogo deste tenant)
            category_id: Filtrar por categoria (opcional)
            search: Buscar por nome/marca (opcional)
            skip: Paginação - registros a pular
            limit: Paginação - máximo de registros

        Returns:
            Lista de produtos do catálogo
        """
        from sqlalchemy import select, and_

        # Buscar produtos do catálogo (is_catalog=true)
        stmt = select(Product).where(
            and_(
                Product.tenant_id == tenant_id,
                Product.is_catalog == True,
                Product.is_active == True
            )
        )

        # Filtrar por categoria
        if category_id is not None:
            stmt = stmt.where(Product.category_id == category_id)

        # Buscar por nome/marca
        if search:
            search_pattern = f"%{search}%"
            from sqlalchemy import or_
            stmt = stmt.where(
                or_(
                    Product.name.ilike(search_pattern),
                    Product.brand.ilike(search_pattern)
                )
            )

        stmt = stmt.order_by(Product.name).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_active_products(
        self,
        *,
        tenant_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Product]:
        """
        Lista produtos ATIVOS da loja (não catálogo).

        Estes são produtos que o lojista já adicionou à sua loja
        (ativados do catálogo ou criados manualmente).

        Args:
            tenant_id: ID do tenant
            skip: Paginação - registros a pular
            limit: Paginação - máximo de registros

        Returns:
            Lista de produtos ativos
        """
        from sqlalchemy import select, and_

        stmt = select(Product).where(
            and_(
                Product.tenant_id == tenant_id,
                Product.is_catalog == False,  # Apenas produtos ativos (não catálogo)
                Product.is_active == True
            )
        ).order_by(Product.name).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def activate_catalog_product(
        self,
        catalog_product_id: int,
        *,
        tenant_id: int,
        custom_price: Optional[float] = None
    ) -> Product:
        """
        Ativa um produto do catálogo, criando uma cópia para a loja do usuário.

        Fluxo:
        1. Busca produto do catálogo (is_catalog=true)
        2. Cria CÓPIA com is_catalog=false
        3. Gera novo SKU único para a loja
        4. Usa preço customizado ou mantém sugerido

        Args:
            catalog_product_id: ID do produto no catálogo
            tenant_id: ID do tenant (loja)
            custom_price: Preço personalizado (opcional, usa o do catálogo se None)

        Returns:
            Produto ativado (cópia)

        Raises:
            ValueError: Se produto não existe ou não é catálogo
        """
        # Buscar produto do catálogo
        catalog_product = await self.product_repo.get(
            self.db,
            catalog_product_id,
            tenant_id=tenant_id
        )

        if not catalog_product:
            raise ValueError("Produto não encontrado no catálogo")

        if not catalog_product.is_catalog:
            raise ValueError("Este produto não é um template do catálogo")

        # Gerar SKU único para a loja
        # Usar formato: MARCA-NOME-XXX (ex: NIKE-CAMISETA-001)
        import re
        base_sku = f"{catalog_product.brand or 'PROD'}-{catalog_product.name[:10]}"
        base_sku = re.sub(r'[^A-Z0-9-]', '', base_sku.upper())

        # Verificar se SKU já existe e adicionar contador
        counter = 1
        new_sku = f"{base_sku}-{counter:03d}"

        while await self.product_repo.exists_by_sku(new_sku, tenant_id=tenant_id):
            counter += 1
            new_sku = f"{base_sku}-{counter:03d}"

        # Criar cópia do produto como ativo
        product_data = ProductCreate(
            name=catalog_product.name,
            description=catalog_product.description,
            sku=new_sku,
            barcode=catalog_product.barcode,
            price=custom_price if custom_price is not None else catalog_product.price,
            cost_price=catalog_product.cost_price,
            category_id=catalog_product.category_id,
            brand=catalog_product.brand,
            color=catalog_product.color,
            size=catalog_product.size,
            gender=catalog_product.gender,
            material=catalog_product.material,
            is_digital=catalog_product.is_digital,
            is_activewear=catalog_product.is_activewear,
            is_catalog=False,  # ✅ Agora é produto ATIVO
            initial_stock=0,  # Sem estoque inicial
            min_stock=5
        )

        # Criar produto ativo
        new_product = await self.create_product(
            product_data,
            initial_quantity=0,
            min_stock=5,
            tenant_id=tenant_id
        )

        return new_product
