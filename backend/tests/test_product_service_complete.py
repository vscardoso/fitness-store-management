"""
Testes completos para ProductService.
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.product_service import ProductService
from app.models.product import Product
from app.models.category import Category
from app.schemas.product import ProductCreate, ProductUpdate


@pytest.fixture
async def category(async_session: AsyncSession):
    """Cria categoria para testes."""
    cat = Category(
        name="Test Category",
        slug="test-category",
        description="Category for testing",
        is_active=True,
    )
    async_session.add(cat)
    await async_session.commit()
    await async_session.refresh(cat)
    return cat


@pytest.fixture
def product_service(async_session: AsyncSession):
    """Retorna instância do ProductService."""
    return ProductService(async_session)


@pytest.mark.asyncio
async def test_create_product(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa criação de produto."""
    product_data = ProductCreate(
        sku="TEST-001",
        name="Test Product",
        description="Test description",
        price=100.00,
        cost_price=50.00,
        category_id=category.id,
        barcode="1234567890",
        min_stock_threshold=10,
        initial_quantity=100,
    )
    
    product = await product_service.create_product(product_data, tenant_id=1)
    
    assert product.id is not None
    assert product.sku == "TEST-001"
    assert product.name == "Test Product"
    assert product.price == 100.00
    assert product.tenant_id == 1


@pytest.mark.asyncio
async def test_get_product_by_id(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa busca de produto por ID."""
    # Criar produto
    product_data = ProductCreate(
        sku="TEST-002",
        name="Test Product 2",
        price=200.00,
        cost_price=100.00,
        category_id=category.id,
        initial_quantity=50,
    )
    created = await product_service.create_product(product_data, tenant_id=1)
    
    # Buscar produto
    found = await product_service.get_product(created.id, tenant_id=1)
    
    assert found is not None
    assert found.id == created.id
    assert found.sku == "TEST-002"


@pytest.mark.asyncio
async def test_get_product_not_found(product_service: ProductService):
    """Testa busca de produto inexistente."""
    product = await product_service.get_product(99999, tenant_id=1)
    assert product is None


@pytest.mark.asyncio
async def test_list_products(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa listagem de produtos."""
    # Criar múltiplos produtos
    for i in range(3):
        product_data = ProductCreate(
            sku=f"LIST-{i}",
            name=f"Product {i}",
            price=100.00 * (i + 1),
            cost_price=50.00,
            category_id=category.id,
            initial_quantity=10,
        )
        await product_service.create_product(product_data, tenant_id=1)
    
    # Listar produtos
    products = await product_service.list_products(skip=0, limit=10, tenant_id=1)
    
    assert len(products) >= 3


@pytest.mark.asyncio
async def test_list_products_with_search(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa listagem com busca."""
    # Criar produtos
    await product_service.create_product(
        ProductCreate(
            sku="SEARCH-001",
            name="Whey Protein",
            price=100.00,
            cost_price=50.00,
            category_id=category.id,
            initial_quantity=10,
        ),
        tenant_id=1,
    )
    await product_service.create_product(
        ProductCreate(
            sku="SEARCH-002",
            name="Creatine",
            price=80.00,
            cost_price=40.00,
            category_id=category.id,
            initial_quantity=10,
        ),
        tenant_id=1,
    )
    
    # Buscar por "Whey"
    products = await product_service.search_products("Whey", tenant_id=1)
    
    assert len(products) >= 1
    assert any("Whey" in p.name for p in products)


@pytest.mark.asyncio
async def test_update_product(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa atualização de produto."""
    # Criar produto
    product_data = ProductCreate(
        sku="UPDATE-001",
        name="Original Name",
        price=100.00,
        cost_price=50.00,
        category_id=category.id,
        initial_quantity=10,
    )
    product = await product_service.create_product(product_data, tenant_id=1)
    
    # Atualizar produto
    update_data = ProductUpdate(
        name="Updated Name",
        price=150.00,
    )
    updated = await product_service.update_product(product.id, update_data, tenant_id=1)
    
    assert updated is not None
    assert updated.name == "Updated Name"
    assert updated.price == 150.00


@pytest.mark.asyncio
async def test_delete_product(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa soft delete de produto."""
    # Criar produto
    product_data = ProductCreate(
        sku="DELETE-001",
        name="To Delete",
        price=100.00,
        cost_price=50.00,
        category_id=category.id,
        initial_quantity=10,
    )
    product = await product_service.create_product(product_data, tenant_id=1)
    
    # Deletar produto
    result = await product_service.delete_product(product.id, tenant_id=1)
    
    assert result is True
    
    # Verificar que não aparece mais
    found = await product_service.get_product(product.id, tenant_id=1)
    assert found is None


@pytest.mark.asyncio
async def test_get_products_by_category(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa busca de produtos por categoria."""
    # Criar produtos na categoria
    for i in range(2):
        await product_service.create_product(
            ProductCreate(
                sku=f"CAT-{i}",
                name=f"Product {i}",
                price=100.00,
                cost_price=50.00,
                category_id=category.id,
                initial_quantity=10,
            ),
            tenant_id=1,
        )
    
    # Buscar por categoria
    products = await product_service.get_products_by_category(category.id, tenant_id=1)
    
    assert len(products) >= 2
    assert all(p.category_id == category.id for p in products)


@pytest.mark.asyncio
async def test_get_low_stock_products(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa busca de produtos com estoque baixo."""
    # Criar produto com estoque baixo
    await product_service.create_product(
        ProductCreate(
            sku="LOW-STOCK",
            name="Low Stock Product",
            price=100.00,
            cost_price=50.00,
            category_id=category.id,
            min_stock_threshold=100,
            initial_quantity=5,  # Abaixo do threshold
        ),
        tenant_id=1,
    )
    
    # Buscar produtos com estoque baixo
    products = await product_service.get_low_stock_products(tenant_id=1)
    
    # Deve retornar pelo menos o produto criado
    assert len(products) >= 1


@pytest.mark.asyncio
async def test_get_product_by_sku(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa busca de produto por SKU."""
    # Criar produto
    await product_service.create_product(
        ProductCreate(
            sku="UNIQUE-SKU",
            name="Product with Unique SKU",
            price=100.00,
            cost_price=50.00,
            category_id=category.id,
            initial_quantity=10,
        ),
        tenant_id=1,
    )
    
    # Buscar por SKU
    product = await product_service.get_product_by_sku("UNIQUE-SKU", tenant_id=1)
    
    assert product is not None
    assert product.sku == "UNIQUE-SKU"


@pytest.mark.asyncio
async def test_get_product_by_barcode(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa busca de produto por código de barras."""
    # Criar produto com barcode
    await product_service.create_product(
        ProductCreate(
            sku="BARCODE-001",
            name="Product with Barcode",
            price=100.00,
            cost_price=50.00,
            category_id=category.id,
            barcode="9876543210",
            initial_quantity=10,
        ),
        tenant_id=1,
    )
    
    # Buscar por barcode
    product = await product_service.get_product_by_barcode("9876543210", tenant_id=1)
    
    assert product is not None
    assert product.barcode == "9876543210"


@pytest.mark.asyncio
async def test_create_product_with_duplicate_sku(product_service: ProductService, category: Category, async_session: AsyncSession):
    """Testa criação de produto com SKU duplicado."""
    # Criar primeiro produto
    await product_service.create_product(
        ProductCreate(
            sku="DUP-SKU",
            name="First Product",
            price=100.00,
            cost_price=50.00,
            category_id=category.id,
            initial_quantity=10,
        ),
        tenant_id=1,
    )
    
    # Tentar criar segundo produto com mesmo SKU
    with pytest.raises(Exception):  # Deve lançar erro de duplicação
        await product_service.create_product(
            ProductCreate(
                sku="DUP-SKU",
                name="Second Product",
                price=200.00,
                cost_price=100.00,
                category_id=category.id,
                initial_quantity=10,
            ),
            tenant_id=1,
        )


print("✅ Testes do ProductService criados!")
