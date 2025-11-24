"""
Testes abrangentes para BaseRepository cobrindo todos os métodos.
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError

from app.repositories.base import BaseRepository
from app.models.product import Product
from app.models.category import Category
from app.models.customer import Customer


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


@pytest.mark.asyncio
async def test_repository_initialization():
    """Testa inicialização do repositório."""
    repo = BaseRepository[Product, dict, dict](Product)
    assert repo.model == Product


@pytest.mark.asyncio
async def test_create_with_dict(async_session: AsyncSession, category: Category):
    """Testa criação com dicionário."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "TEST-001",
            "name": "Test Product",
            "description": "Test description",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    
    assert product.id is not None
    assert product.sku == "TEST-001"
    assert product.name == "Test Product"
    assert product.tenant_id == 1
    assert product.is_active is True


@pytest.mark.asyncio
async def test_create_injects_tenant_id(async_session: AsyncSession, category: Category):
    """Testa que create injeta tenant_id automaticamente."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Não passa tenant_id no obj_in
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "TEST-002",
            "name": "Test Product 2",
            "price": 200.00,
            "category_id": category.id,
        },
        tenant_id=5,  # Passa apenas no parâmetro
    )
    
    assert product.tenant_id == 5


@pytest.mark.asyncio
async def test_get_by_id(async_session: AsyncSession, category: Category):
    """Testa busca por ID."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto
    created = await repo.create(
        async_session,
        obj_in={
            "sku": "TEST-003",
            "name": "Test Product 3",
            "price": 300.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Buscar produto
    found = await repo.get(async_session, created.id, tenant_id=1)
    
    assert found is not None
    assert found.id == created.id
    assert found.sku == "TEST-003"


@pytest.mark.asyncio
async def test_get_respects_tenant_isolation(async_session: AsyncSession, category: Category):
    """Testa que get respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto para tenant 1
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "TEST-004",
            "name": "Test Product 4",
            "price": 400.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Tentar buscar com tenant diferente
    not_found = await repo.get(async_session, product.id, tenant_id=2)
    
    assert not_found is None


@pytest.mark.asyncio
async def test_get_non_existent(async_session: AsyncSession):
    """Testa busca de registro inexistente."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    result = await repo.get(async_session, 99999, tenant_id=1)
    
    assert result is None


@pytest.mark.asyncio
async def test_get_multi_with_pagination(async_session: AsyncSession, category: Category):
    """Testa busca múltipla com paginação."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar 5 produtos
    for i in range(5):
        await repo.create(
            async_session,
            obj_in={
                "sku": f"TEST-PAGE-{i}",
                "name": f"Product {i}",
                "price": 100.00 * (i + 1),
                "category_id": category.id,
            },
            tenant_id=1,
        )
    await async_session.commit()
    
    # Buscar primeiros 3
    page1 = await repo.get_multi(async_session, skip=0, limit=3, tenant_id=1)
    assert len(page1) == 3
    
    # Buscar próximos 2
    page2 = await repo.get_multi(async_session, skip=3, limit=3, tenant_id=1)
    assert len(page2) == 2


@pytest.mark.asyncio
async def test_get_multi_with_filters(async_session: AsyncSession, category: Category):
    """Testa busca múltipla com filtros."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produtos com diferentes preços
    await repo.create(
        async_session,
        obj_in={
            "sku": "FILTER-001",
            "name": "Cheap Product",
            "price": 50.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await repo.create(
        async_session,
        obj_in={
            "sku": "FILTER-002",
            "name": "Expensive Product",
            "price": 500.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Buscar por categoria
    products = await repo.get_multi(
        async_session,
        filters={"category_id": category.id},
        tenant_id=1,
    )
    
    assert len(products) >= 2


@pytest.mark.asyncio
async def test_get_multi_with_order_by(async_session: AsyncSession, category: Category):
    """Testa busca múltipla com ordenação."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produtos
    await repo.create(
        async_session,
        obj_in={
            "sku": "ORDER-C",
            "name": "Product C",
            "price": 300.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await repo.create(
        async_session,
        obj_in={
            "sku": "ORDER-A",
            "name": "Product A",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await repo.create(
        async_session,
        obj_in={
            "sku": "ORDER-B",
            "name": "Product B",
            "price": 200.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Buscar ordenado por SKU
    products = await repo.get_multi(
        async_session,
        order_by="sku",
        tenant_id=1,
    )
    
    # Verificar ordem
    skus = [p.sku for p in products if p.sku.startswith("ORDER-")]
    assert skus == sorted(skus)


@pytest.mark.asyncio
async def test_get_multi_respects_tenant_isolation(async_session: AsyncSession, category: Category):
    """Testa que get_multi respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produtos para tenant 1
    await repo.create(
        async_session,
        obj_in={"sku": "T1-001", "name": "T1 Product", "price": 100.00, "category_id": category.id},
        tenant_id=1,
    )
    
    # Criar produtos para tenant 2
    await repo.create(
        async_session,
        obj_in={"sku": "T2-001", "name": "T2 Product", "price": 200.00, "category_id": category.id},
        tenant_id=2,
    )
    await async_session.commit()
    
    # Buscar produtos do tenant 1
    t1_products = await repo.get_multi(async_session, tenant_id=1)
    t1_skus = [p.sku for p in t1_products]
    
    assert "T1-001" in t1_skus
    assert "T2-001" not in t1_skus


@pytest.mark.asyncio
async def test_update_record(async_session: AsyncSession, category: Category):
    """Testa atualização de registro."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "UPDATE-001",
            "name": "Original Name",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Atualizar produto
    updated = await repo.update(
        async_session,
        id=product.id,
        obj_in={"name": "Updated Name", "price": 150.00},
        tenant_id=1,
    )
    await async_session.commit()
    
    assert updated is not None
    assert updated.name == "Updated Name"
    assert updated.price == 150.00


@pytest.mark.asyncio
async def test_update_respects_tenant_isolation(async_session: AsyncSession, category: Category):
    """Testa que update respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto para tenant 1
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "UPDATE-002",
            "name": "Tenant 1 Product",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Tentar atualizar com tenant diferente
    result = await repo.update(
        async_session,
        id=product.id,
        obj_in={"name": "Hacked Name"},
        tenant_id=2,
    )
    
    assert result is None


@pytest.mark.asyncio
async def test_update_non_existent(async_session: AsyncSession):
    """Testa atualização de registro inexistente."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    result = await repo.update(
        async_session,
        id=99999,
        obj_in={"name": "New Name"},
        tenant_id=1,
    )
    
    assert result is None


@pytest.mark.asyncio
async def test_soft_delete(async_session: AsyncSession, category: Category):
    """Testa soft delete (padrão)."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "DELETE-001",
            "name": "To Delete",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Soft delete
    deleted = await repo.delete(async_session, id=product.id, soft_delete=True, tenant_id=1)
    await async_session.commit()
    
    assert deleted is True
    
    # Verificar que não aparece em buscas normais
    found = await repo.get(async_session, product.id, tenant_id=1)
    assert found is None


@pytest.mark.asyncio
async def test_hard_delete(async_session: AsyncSession, category: Category):
    """Testa hard delete."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "DELETE-002",
            "name": "To Hard Delete",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Hard delete
    deleted = await repo.delete(async_session, id=product.id, soft_delete=False, tenant_id=1)
    await async_session.commit()
    
    assert deleted is True
    
    # Verificar que não existe mais
    found = await repo.get(async_session, product.id, tenant_id=1)
    assert found is None


@pytest.mark.asyncio
async def test_delete_respects_tenant_isolation(async_session: AsyncSession, category: Category):
    """Testa que delete respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto para tenant 1
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "DELETE-003",
            "name": "Protected Product",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Tentar deletar com tenant diferente
    deleted = await repo.delete(async_session, id=product.id, tenant_id=2)
    
    assert deleted is False
    
    # Verificar que ainda existe para tenant correto
    found = await repo.get(async_session, product.id, tenant_id=1)
    assert found is not None


@pytest.mark.asyncio
async def test_get_by_field(async_session: AsyncSession, category: Category):
    """Testa busca por campo arbitrário."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto
    await repo.create(
        async_session,
        obj_in={
            "sku": "FIELD-001",
            "name": "Unique Product",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Buscar por SKU
    found = await repo.get_by_field(
        async_session,
        field="sku",
        value="FIELD-001",
        tenant_id=1,
    )
    
    assert found is not None
    assert found.sku == "FIELD-001"


@pytest.mark.asyncio
async def test_get_by_field_invalid_field(async_session: AsyncSession):
    """Testa busca por campo inválido."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    with pytest.raises(ValueError, match="Field 'invalid_field' does not exist"):
        await repo.get_by_field(
            async_session,
            field="invalid_field",
            value="anything",
            tenant_id=1,
        )


@pytest.mark.asyncio
async def test_exists_true(async_session: AsyncSession, category: Category):
    """Testa exists quando registro existe."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "EXISTS-001",
            "name": "Exists Product",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Verificar existência
    exists = await repo.exists(async_session, id=product.id, tenant_id=1)
    
    assert exists is True


@pytest.mark.asyncio
async def test_exists_false(async_session: AsyncSession):
    """Testa exists quando registro não existe."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    exists = await repo.exists(async_session, id=99999, tenant_id=1)
    
    assert exists is False


@pytest.mark.asyncio
async def test_exists_respects_tenant_isolation(async_session: AsyncSession, category: Category):
    """Testa que exists respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto para tenant 1
    product = await repo.create(
        async_session,
        obj_in={
            "sku": "EXISTS-002",
            "name": "Tenant Product",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Verificar com tenant diferente
    exists = await repo.exists(async_session, id=product.id, tenant_id=2)
    
    assert exists is False


@pytest.mark.asyncio
async def test_count_all(async_session: AsyncSession, category: Category):
    """Testa contagem de todos os registros."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produtos
    for i in range(3):
        await repo.create(
            async_session,
            obj_in={
                "sku": f"COUNT-{i}",
                "name": f"Product {i}",
                "price": 100.00,
                "category_id": category.id,
            },
            tenant_id=1,
        )
    await async_session.commit()
    
    # Contar
    count = await repo.count(async_session, tenant_id=1)
    
    assert count >= 3


@pytest.mark.asyncio
async def test_count_with_filters(async_session: AsyncSession, category: Category):
    """Testa contagem com filtros."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produtos
    await repo.create(
        async_session,
        obj_in={
            "sku": "COUNT-FILTER-1",
            "name": "Product 1",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Contar com filtro
    count = await repo.count(
        async_session,
        filters={"category_id": category.id},
        tenant_id=1,
    )
    
    assert count >= 1


@pytest.mark.asyncio
async def test_bulk_create(async_session: AsyncSession, category: Category):
    """Testa criação em lote."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar múltiplos produtos
    products = await repo.bulk_create(
        async_session,
        objects=[
            {"sku": "BULK-001", "name": "Bulk 1", "price": 100.00, "category_id": category.id},
            {"sku": "BULK-002", "name": "Bulk 2", "price": 200.00, "category_id": category.id},
            {"sku": "BULK-003", "name": "Bulk 3", "price": 300.00, "category_id": category.id},
        ],
        tenant_id=1,
    )
    await async_session.commit()
    
    assert len(products) == 3
    assert all(p.id is not None for p in products)
    assert all(p.tenant_id == 1 for p in products)


@pytest.mark.asyncio
async def test_get_or_create_get_existing(async_session: AsyncSession, category: Category):
    """Testa get_or_create quando registro já existe."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto
    await repo.create(
        async_session,
        obj_in={
            "sku": "GOC-001",
            "name": "Existing Product",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Tentar get_or_create
    product, created = await repo.get_or_create(
        async_session,
        sku="GOC-001",
        tenant_id=1,
        defaults={"name": "New Name", "price": 200.00, "category_id": category.id},
    )
    
    assert created is False
    assert product.name == "Existing Product"  # Não foi alterado


@pytest.mark.asyncio
async def test_get_or_create_create_new(async_session: AsyncSession, category: Category):
    """Testa get_or_create quando registro não existe."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # get_or_create de produto inexistente
    product, created = await repo.get_or_create(
        async_session,
        sku="GOC-002",
        tenant_id=1,
        defaults={"name": "New Product", "price": 300.00, "category_id": category.id},
    )
    await async_session.commit()
    
    assert created is True
    assert product.sku == "GOC-002"
    assert product.name == "New Product"


@pytest.mark.asyncio
async def test_repository_with_non_tenant_model(async_session: AsyncSession):
    """Testa repository com modelo sem tenant_id (Category)."""
    repo = BaseRepository[Category, dict, dict](Category)
    
    # Criar categoria
    category = await repo.create(
        async_session,
        obj_in={
            "name": "Test Category",
            "slug": "test-category",
        },
    )
    await async_session.commit()
    
    # Buscar categoria
    found = await repo.get(async_session, category.id)
    
    assert found is not None
    assert found.name == "Test Category"
    assert not hasattr(found, "tenant_id")


@pytest.mark.asyncio
async def test_get_multi_respects_is_active_filter(async_session: AsyncSession, category: Category):
    """Testa que get_multi retorna apenas registros ativos."""
    repo = BaseRepository[Product, dict, dict](Product)
    
    # Criar produto ativo
    active = await repo.create(
        async_session,
        obj_in={
            "sku": "ACTIVE-001",
            "name": "Active Product",
            "price": 100.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    
    # Criar produto e inativar
    inactive = await repo.create(
        async_session,
        obj_in={
            "sku": "INACTIVE-001",
            "name": "Inactive Product",
            "price": 200.00,
            "category_id": category.id,
        },
        tenant_id=1,
    )
    await async_session.commit()
    
    # Inativar segundo produto
    await repo.delete(async_session, id=inactive.id, soft_delete=True, tenant_id=1)
    await async_session.commit()
    
    # Buscar produtos
    products = await repo.get_multi(async_session, tenant_id=1)
    skus = [p.sku for p in products]
    
    assert "ACTIVE-001" in skus
    assert "INACTIVE-001" not in skus


print("✅ Testes completos do BaseRepository criados com sucesso!")
