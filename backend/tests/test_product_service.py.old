"""
Testes unitários para ProductService
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.product_service import ProductService
from app.schemas.product import ProductCreate, ProductUpdate
from app.models.product import Product


@pytest.fixture
def product_service():
    """Fixture para criar instância do ProductService"""
    repository = AsyncMock()
    category_repository = AsyncMock()
    return ProductService(repository, category_repository)


@pytest.fixture
def sample_product():
    """Fixture com dados de exemplo de produto"""
    return Product(
        id=1,
        name="Whey Protein",
        sku="WP-001",
        barcode="7891234567890",
        category_id=1,
        brand="FitNutrition",
        cost_price=80.00,
        sale_price=120.00,
        description="Proteína de alta qualidade",
        is_active=True
    )


@pytest.mark.asyncio
async def test_create_product_success(product_service, sample_product):
    """Testa criação bem-sucedida de produto"""
    # Arrange
    product_data = ProductCreate(
        name="Whey Protein",
        sku="WP-001",
        barcode="7891234567890",
        category_id=1,
        brand="FitNutrition",
        cost_price=80.00,
        sale_price=120.00,
        description="Proteína de alta qualidade"
    )
    
    product_service.repository.create.return_value = sample_product
    product_service.category_repository.get.return_value = MagicMock(id=1)
    
    # Act
    result = await product_service.create(product_data)
    
    # Assert
    assert result.id == 1
    assert result.name == "Whey Protein"
    assert result.sku == "WP-001"
    product_service.repository.create.assert_called_once()


@pytest.mark.asyncio
async def test_create_product_duplicate_sku(product_service):
    """Testa erro ao criar produto com SKU duplicado"""
    # Arrange
    product_data = ProductCreate(
        name="Whey Protein",
        sku="WP-001",
        category_id=1,
        cost_price=80.00,
        sale_price=120.00
    )
    
    product_service.repository.get_by_sku.return_value = MagicMock(id=1)
    
    # Act & Assert
    with pytest.raises(ValueError, match="SKU já existe"):
        await product_service.create(product_data)


@pytest.mark.asyncio
async def test_update_product_success(product_service, sample_product):
    """Testa atualização bem-sucedida de produto"""
    # Arrange
    product_id = 1
    update_data = ProductUpdate(
        name="Whey Protein Premium",
        sale_price=150.00
    )
    
    updated_product = sample_product
    updated_product.name = "Whey Protein Premium"
    updated_product.sale_price = 150.00
    
    product_service.repository.get.return_value = sample_product
    product_service.repository.update.return_value = updated_product
    
    # Act
    result = await product_service.update(product_id, update_data)
    
    # Assert
    assert result.name == "Whey Protein Premium"
    assert result.sale_price == 150.00


@pytest.mark.asyncio
async def test_get_product_not_found(product_service):
    """Testa busca de produto inexistente"""
    # Arrange
    product_id = 999
    product_service.repository.get.return_value = None
    
    # Act & Assert
    with pytest.raises(ValueError, match="Produto não encontrado"):
        await product_service.get(product_id)


@pytest.mark.asyncio
async def test_list_products_with_pagination(product_service, sample_product):
    """Testa listagem de produtos com paginação"""
    # Arrange
    products = [sample_product for _ in range(10)]
    product_service.repository.list.return_value = products
    
    # Act
    result = await product_service.list(skip=0, limit=10)
    
    # Assert
    assert len(result) == 10
    product_service.repository.list.assert_called_once_with(skip=0, limit=10)


@pytest.mark.asyncio
async def test_delete_product_success(product_service, sample_product):
    """Testa exclusão bem-sucedida de produto"""
    # Arrange
    product_id = 1
    product_service.repository.get.return_value = sample_product
    product_service.repository.delete.return_value = True
    
    # Act
    result = await product_service.delete(product_id)
    
    # Assert
    assert result is True
    product_service.repository.delete.assert_called_once_with(product_id)


@pytest.mark.asyncio
async def test_search_products(product_service, sample_product):
    """Testa busca de produtos por termo"""
    # Arrange
    search_term = "whey"
    products = [sample_product]
    product_service.repository.search.return_value = products
    
    # Act
    result = await product_service.search(search_term)
    
    # Assert
    assert len(result) == 1
    assert result[0].name == "Whey Protein"
    product_service.repository.search.assert_called_once_with(search_term)
