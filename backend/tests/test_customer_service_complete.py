"""
Testes completos para CustomerService.
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.customer_service import CustomerService
from app.schemas.customer import CustomerCreate, CustomerUpdate


@pytest.fixture
def customer_service(async_session: AsyncSession):
    """Retorna instância do CustomerService."""
    return CustomerService(async_session)


@pytest.mark.asyncio
async def test_create_customer(customer_service: CustomerService):
    """Testa criação de cliente."""
    customer_data = CustomerCreate(
        full_name="João Silva",
        email="joao@test.com",
        phone="11999999999",
        cpf="12345678900",
        birth_date="1990-01-01",
        address="Rua Teste, 123",
        city="São Paulo",
        state="SP",
        zip_code="01234-567",
    )
    
    customer = await customer_service.create_customer(customer_data, tenant_id=1)
    
    assert customer.id is not None
    assert customer.full_name == "João Silva"
    assert customer.email == "joao@test.com"
    assert customer.tenant_id == 1


@pytest.mark.asyncio
async def test_get_customer_by_id(customer_service: CustomerService):
    """Testa busca de cliente por ID."""
    # Criar cliente
    customer_data = CustomerCreate(
        full_name="Maria Santos",
        email="maria@test.com",
        phone="11888888888",
    )
    created = await customer_service.create_customer(customer_data, tenant_id=1)
    
    # Buscar cliente
    found = await customer_service.get_customer(created.id, tenant_id=1)
    
    assert found is not None
    assert found.id == created.id
    assert found.full_name == "Maria Santos"


@pytest.mark.asyncio
async def test_get_customer_not_found(customer_service: CustomerService):
    """Testa busca de cliente inexistente."""
    customer = await customer_service.get_customer(99999, tenant_id=1)
    assert customer is None


@pytest.mark.asyncio
async def test_list_customers(customer_service: CustomerService):
    """Testa listagem de clientes."""
    # Criar múltiplos clientes
    for i in range(3):
        customer_data = CustomerCreate(
            full_name=f"Cliente {i}",
            email=f"cliente{i}@test.com",
            phone=f"119999999{i}",
        )
        await customer_service.create_customer(customer_data, tenant_id=1)
    
    # Listar clientes
    customers = await customer_service.list_customers(skip=0, limit=10, tenant_id=1)
    
    assert len(customers) >= 3


@pytest.mark.asyncio
async def test_search_customers(customer_service: CustomerService):
    """Testa busca de clientes."""
    # Criar clientes
    await customer_service.create_customer(
        CustomerCreate(
            full_name="Pedro Oliveira",
            email="pedro@test.com",
            phone="11777777777",
        ),
        tenant_id=1,
    )
    await customer_service.create_customer(
        CustomerCreate(
            full_name="Ana Costa",
            email="ana@test.com",
            phone="11666666666",
        ),
        tenant_id=1,
    )
    
    # Buscar por "Pedro"
    customers = await customer_service.search_customers("Pedro", tenant_id=1)
    
    assert len(customers) >= 1
    assert any("Pedro" in c.full_name for c in customers)


@pytest.mark.asyncio
async def test_update_customer(customer_service: CustomerService):
    """Testa atualização de cliente."""
    # Criar cliente
    customer_data = CustomerCreate(
        full_name="Original Name",
        email="original@test.com",
        phone="11555555555",
    )
    customer = await customer_service.create_customer(customer_data, tenant_id=1)
    
    # Atualizar cliente
    update_data = CustomerUpdate(
        full_name="Updated Name",
        phone="11444444444",
    )
    updated = await customer_service.update_customer(customer.id, update_data, tenant_id=1)
    
    assert updated is not None
    assert updated.full_name == "Updated Name"
    assert updated.phone == "11444444444"


@pytest.mark.asyncio
async def test_delete_customer(customer_service: CustomerService):
    """Testa soft delete de cliente."""
    # Criar cliente
    customer_data = CustomerCreate(
        full_name="To Delete",
        email="delete@test.com",
        phone="11333333333",
    )
    customer = await customer_service.create_customer(customer_data, tenant_id=1)
    
    # Deletar cliente
    result = await customer_service.delete_customer(customer.id, tenant_id=1)
    
    assert result is True
    
    # Verificar que não aparece mais
    found = await customer_service.get_customer(customer.id, tenant_id=1)
    assert found is None


@pytest.mark.asyncio
async def test_get_customer_by_email(customer_service: CustomerService):
    """Testa busca de cliente por email."""
    # Criar cliente
    await customer_service.create_customer(
        CustomerCreate(
            full_name="Email Test",
            email="unique@test.com",
            phone="11222222222",
        ),
        tenant_id=1,
    )
    
    # Buscar por email
    customer = await customer_service.get_customer_by_email("unique@test.com", tenant_id=1)
    
    assert customer is not None
    assert customer.email == "unique@test.com"


@pytest.mark.asyncio
async def test_get_customer_by_cpf(customer_service: CustomerService):
    """Testa busca de cliente por CPF."""
    # Criar cliente com CPF
    await customer_service.create_customer(
        CustomerCreate(
            full_name="CPF Test",
            email="cpf@test.com",
            phone="11111111111",
            document_number="98765432100",
        ),
        tenant_id=1,
    )
    
    # Buscar por CPF
    customer = await customer_service.get_customer_by_cpf("98765432100", tenant_id=1)
    
    assert customer is not None
    assert customer.document_number == "98765432100"


@pytest.mark.asyncio
async def test_search_customers_by_phone(customer_service: CustomerService):
    """Testa busca de clientes por telefone usando search."""
    # Criar cliente
    await customer_service.create_customer(
        CustomerCreate(
            full_name="Phone Test",
            email="phone@test.com",
            phone="11987654321",
        ),
        tenant_id=1,
    )
    
    # Buscar usando search
    customers = await customer_service.search_customers("11987654321", tenant_id=1)
    assert len(customers) > 0
    assert any(c.phone == "11987654321" for c in customers)


@pytest.mark.asyncio
async def test_create_customer_with_duplicate_email(customer_service: CustomerService):
    """Testa criação de cliente com email duplicado."""
    # Criar primeiro cliente
    await customer_service.create_customer(
        CustomerCreate(
            full_name="First Customer",
            email="duplicate@test.com",
            phone="11000000001",
        ),
        tenant_id=1,
    )
    
    # Tentar criar segundo cliente com mesmo email
    with pytest.raises(Exception):
        await customer_service.create_customer(
            CustomerCreate(
                full_name="Second Customer",
                email="duplicate@test.com",
                phone="11000000002",
            ),
            tenant_id=1,
        )


print("✅ Testes do CustomerService criados!")
