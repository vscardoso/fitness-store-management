"""
Testes completos para sistema de Envio Condicional (Try Before You Buy).
Cobre: Models, Repository, Service, Endpoints e integrações.
"""
import pytest
from httpx import AsyncClient
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.conditional_shipment import ConditionalShipment, ConditionalShipmentItem
from app.models.inventory import Inventory
from app.models.product import Product
from app.models.customer import Customer
from app.models.sale import Sale
from app.repositories.conditional_shipment import (
    ConditionalShipmentRepository,
    ConditionalShipmentItemRepository,
)
from app.services.conditional_shipment import ConditionalShipmentService
from tests.conftest import test_client, auth_token, async_session


# ============================================================================
# HELPERS
# ============================================================================

async def create_test_product(test_client: AsyncClient, auth_token: str, sku_suffix: str = ""):
    """Helper: Criar produto para testes."""
    # Pegar primeira categoria disponível (tenant-aware request)
    categories_response = await test_client.get(
        "/api/v1/categories",
        headers={
            "Authorization": f"Bearer {auth_token}",
            "Host": "test"  # Tenant domain header
        },
    )
    assert categories_response.status_code == 200
    categories = categories_response.json()
    category_id = categories[0]["id"] if categories else 1  # Fallback para ID 1
    
    product_data = {
        "name": f"Produto Condicional {sku_suffix}",
        "sku": f"COND-TEST-{sku_suffix}-{datetime.now().timestamp()}",
        "price": 150.0,
        "cost_price": 75.0,
        "category_id": category_id,
        "initial_quantity": 50,
    }
    response = await test_client.post(
        "/api/v1/products",
        json=product_data,
        headers={
            "Authorization": f"Bearer {auth_token}",
            "Host": "test"  # Tenant domain header
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


async def create_test_customer(test_client: AsyncClient, auth_token: str):
    """Helper: Criar cliente para testes."""
    customer_data = {
        "full_name": "Cliente Condicional Teste",
        "email": f"cond{datetime.now().timestamp()}@teste.com",
        "phone": "11987654321",
        "address": "Rua Teste, 123",
        "city": "São Paulo",
        "state": "SP",
    }
    response = await test_client.post(
        "/api/v1/customers",
        json=customer_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 201
    return response.json()["id"]


# ============================================================================
# TESTES DE MODELS
# ============================================================================

@pytest.mark.asyncio
async def test_conditional_shipment_model_properties():
    """Teste: Propriedades calculadas do model ConditionalShipment."""
    shipment = ConditionalShipment(
        tenant_id=1,
        customer_id=1,
        status="SENT",
        shipping_address="Rua Teste, 123",
        deadline=datetime.utcnow() + timedelta(days=3),
        sent_at=datetime.utcnow(),
    )
    
    # Adicionar items
    item1 = ConditionalShipmentItem(
        product_id=1,
        quantity_sent=5,
        quantity_kept=2,
        quantity_returned=1,
        unit_price=100,
        status="SENT",
    )
    item2 = ConditionalShipmentItem(
        product_id=2,
        quantity_sent=3,
        quantity_kept=3,
        quantity_returned=0,
        unit_price=150,
        status="KEPT",
    )
    
    shipment.items = [item1, item2]
    
    # Testar propriedades calculadas
    assert shipment.total_items_sent == 8
    assert shipment.total_items_kept == 5
    assert shipment.total_items_returned == 1
    assert shipment.total_value_sent == 950.0  # (5*100) + (3*150)
    assert shipment.total_value_kept == 650.0  # (2*100) + (3*150)
    assert shipment.days_remaining >= 2  # Deadline em 3 dias
    assert not shipment.is_overdue


@pytest.mark.asyncio
async def test_conditional_shipment_item_properties():
    """Teste: Propriedades calculadas do ConditionalShipmentItem."""
    item = ConditionalShipmentItem(
        product_id=1,
        quantity_sent=10,
        quantity_kept=4,
        quantity_returned=3,
        unit_price=200,
        status="SENT",
    )
    
    assert item.quantity_pending == 3  # 10 - 4 - 3
    assert item.total_value == 2000.0  # 10 * 200
    assert item.kept_value == 800.0  # 4 * 200


# ============================================================================
# TESTES DE REPOSITORY
# ============================================================================

@pytest.mark.asyncio
async def test_repository_create_with_items(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Repository cria envio com items em transação única."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
    )
    
    # Criar produto e cliente
    product_id = await create_test_product(test_client, auth_token, "REPO1")
    customer_id = await create_test_customer(test_client, auth_token)
    
    repo = ConditionalShipmentRepository()
    
    shipment_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Rua Repository Test, 456",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=5, unit_price=150
            )
        ],
        deadline_days=7,
    )
    
    shipment = await repo.create_with_items(async_session, 1, shipment_data)
    
    assert shipment.id is not None
    assert shipment.customer_id == customer_id
    assert shipment.status == "PENDING"
    assert len(shipment.items) == 1
    assert shipment.items[0].quantity_sent == 5


@pytest.mark.asyncio
async def test_repository_get_with_items(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Repository busca envio com items carregados."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
    )
    
    product_id = await create_test_product(test_client, auth_token, "REPO2")
    customer_id = await create_test_customer(test_client, auth_token)
    
    repo = ConditionalShipmentRepository()
    
    # Criar envio
    shipment_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Rua Test, 789",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=3, unit_price=100
            )
        ],
    )
    
    created = await repo.create_with_items(async_session, 1, shipment_data)
    
    # Buscar
    fetched = await repo.get_with_items(async_session, created.id, 1)
    
    assert fetched is not None
    assert fetched.id == created.id
    assert len(fetched.items) == 1


@pytest.mark.asyncio
async def test_repository_list_by_tenant_filters(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Repository lista com filtros (status, customer, overdue)."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
    )
    
    product_id = await create_test_product(test_client, auth_token, "REPO3")
    customer_id = await create_test_customer(test_client, auth_token)
    
    repo = ConditionalShipmentRepository()
    
    # Criar 2 envios: 1 SENT, 1 PENDING
    shipment1_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Endereco 1",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=2, unit_price=100
            )
        ],
    )
    shipment1 = await repo.create_with_items(async_session, 1, shipment1_data)
    await repo.mark_as_sent(async_session, shipment1.id, 1, deadline_days=7)
    
    shipment2_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Endereco 2",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=3, unit_price=150
            )
        ],
    )
    await repo.create_with_items(async_session, 1, shipment2_data)
    
    # Listar SENT
    sent_shipments = await repo.list_by_tenant(async_session, 1, status="SENT")
    assert len(sent_shipments) >= 1
    
    # Listar PENDING
    pending_shipments = await repo.list_by_tenant(async_session, 1, status="PENDING")
    assert len(pending_shipments) >= 1
    
    # Listar por customer
    customer_shipments = await repo.list_by_tenant(
        async_session, 1, customer_id=customer_id
    )
    assert len(customer_shipments) >= 2


# ============================================================================
# TESTES DE SERVICE
# ============================================================================

@pytest.mark.asyncio
async def test_service_create_shipment_reserves_stock(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Service cria envio e reserva estoque (decrementa quantity)."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
    )
    from app.repositories.inventory import InventoryRepository
    
    product_id = await create_test_product(test_client, auth_token, "SVC1")
    customer_id = await create_test_customer(test_client, auth_token)
    
    # Verificar estoque inicial
    inv_repo = InventoryRepository()
    initial_inventory = await inv_repo.get_by_product(async_session, product_id, 1)
    initial_qty = initial_inventory.quantity if initial_inventory else 0
    
    # Criar envio
    service = ConditionalShipmentService()
    shipment_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Rua Service Test, 111",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=10, unit_price=150
            )
        ],
        deadline_days=7,
    )
    
    shipment = await service.create_shipment(async_session, 1, 1, shipment_data)
    
    # Verificar estoque foi decrementado
    updated_inventory = await inv_repo.get_by_product(async_session, product_id, 1)
    assert updated_inventory.quantity == initial_qty - 10
    
    # Verificar envio está SENT
    assert shipment.status == "SENT"
    assert shipment.deadline is not None


@pytest.mark.asyncio
async def test_service_create_shipment_validates_stock(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Service valida estoque insuficiente ao criar envio."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
    )
    
    product_id = await create_test_product(test_client, auth_token, "SVC2")
    customer_id = await create_test_customer(test_client, auth_token)
    
    service = ConditionalShipmentService()
    
    # Tentar criar envio com quantidade > estoque (50)
    shipment_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Rua Test",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=100, unit_price=150
            )
        ],
    )
    
    with pytest.raises(ValueError, match="Estoque insuficiente"):
        await service.create_shipment(async_session, 1, 1, shipment_data)


@pytest.mark.asyncio
async def test_service_process_return_returns_stock(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Service processa devolução e devolve estoque."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
        ProcessReturnRequest,
        ConditionalShipmentItemUpdate,
    )
    from app.repositories.inventory import InventoryRepository
    
    product_id = await create_test_product(test_client, auth_token, "SVC3")
    customer_id = await create_test_customer(test_client, auth_token)
    
    # Criar envio (reserva 10 unidades)
    service = ConditionalShipmentService()
    shipment_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Rua Test",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=10, unit_price=150
            )
        ],
    )
    
    shipment = await service.create_shipment(async_session, 1, 1, shipment_data)
    
    # Verificar estoque após criação
    inv_repo = InventoryRepository()
    inventory_after_create = await inv_repo.get_by_product(async_session, product_id, 1)
    qty_after_create = inventory_after_create.quantity
    
    # Processar devolução: cliente ficou com 3, devolveu 7
    item_id = shipment.items[0].id
    return_data = ProcessReturnRequest(
        items=[
            ConditionalShipmentItemUpdate(
                id=item_id,
                quantity_kept=3,
                quantity_returned=7,
                status="RETURNED",
            )
        ],
        create_sale=False,
    )
    
    await service.process_return(async_session, shipment.id, 1, 1, return_data)
    
    # Verificar estoque foi incrementado (+7 devolvidos)
    inventory_after_return = await inv_repo.get_by_product(async_session, product_id, 1)
    assert inventory_after_return.quantity == qty_after_create + 7


@pytest.mark.asyncio
async def test_service_process_return_creates_sale_automatically(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Service cria venda automaticamente para itens mantidos."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
        ProcessReturnRequest,
        ConditionalShipmentItemUpdate,
    )
    
    product_id = await create_test_product(test_client, auth_token, "SVC4")
    customer_id = await create_test_customer(test_client, auth_token)
    
    # Criar envio
    service = ConditionalShipmentService()
    shipment_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Rua Test",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=5, unit_price=200
            )
        ],
    )
    
    shipment = await service.create_shipment(async_session, 1, 1, shipment_data)
    
    # Processar com create_sale=True
    item_id = shipment.items[0].id
    return_data = ProcessReturnRequest(
        items=[
            ConditionalShipmentItemUpdate(
                id=item_id,
                quantity_kept=4,
                quantity_returned=1,
                status="KEPT",
            )
        ],
        create_sale=True,
    )
    
    await service.process_return(async_session, shipment.id, 1, 1, return_data)
    
    # Verificar venda foi criada
    stmt = select(Sale).where(
        Sale.customer_id == customer_id, Sale.tenant_id == 1
    )
    result = await async_session.execute(stmt)
    sales = result.scalars().all()
    
    assert len(sales) >= 1
    latest_sale = sales[-1]
    assert float(latest_sale.total) == 800.0  # 4 * 200


@pytest.mark.asyncio
async def test_service_cancel_shipment_returns_all_stock(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Service cancela envio e devolve todo estoque."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
    )
    from app.repositories.inventory import InventoryRepository
    
    product_id = await create_test_product(test_client, auth_token, "SVC5")
    customer_id = await create_test_customer(test_client, auth_token)
    
    # Criar envio
    service = ConditionalShipmentService()
    shipment_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Rua Test",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=8, unit_price=100
            )
        ],
    )
    
    shipment = await service.create_shipment(async_session, 1, 1, shipment_data)
    
    # Verificar estoque após criação
    inv_repo = InventoryRepository()
    inventory_after_create = await inv_repo.get_by_product(async_session, product_id, 1)
    qty_after_create = inventory_after_create.quantity
    
    # Cancelar
    await service.cancel_shipment(
        async_session, shipment.id, 1, 1, "Teste de cancelamento"
    )
    
    # Verificar estoque foi totalmente devolvido
    inventory_after_cancel = await inv_repo.get_by_product(async_session, product_id, 1)
    assert inventory_after_cancel.quantity == qty_after_create + 8


@pytest.mark.asyncio
async def test_service_check_overdue_updates_status(
    async_session: AsyncSession, test_client: AsyncClient, auth_token: str
):
    """Teste: Service detecta e atualiza envios atrasados."""
    from app.schemas.conditional_shipment import (
        ConditionalShipmentCreate,
        ConditionalShipmentItemCreate,
    )
    from app.repositories.conditional_shipment import ConditionalShipmentRepository
    
    product_id = await create_test_product(test_client, auth_token, "SVC6")
    customer_id = await create_test_customer(test_client, auth_token)
    
    # Criar envio com deadline no passado
    repo = ConditionalShipmentRepository()
    shipment_data = ConditionalShipmentCreate(
        customer_id=customer_id,
        shipping_address="Rua Test",
        items=[
            ConditionalShipmentItemCreate(
                product_id=product_id, quantity_sent=2, unit_price=100
            )
        ],
    )
    
    shipment = await repo.create_with_items(async_session, 1, shipment_data)
    
    # Marcar como SENT com deadline no passado
    shipment.status = "SENT"
    shipment.sent_at = datetime.utcnow() - timedelta(days=10)
    shipment.deadline = datetime.utcnow() - timedelta(days=3)
    await async_session.commit()
    await async_session.refresh(shipment)
    
    # Verificar está atrasado
    assert shipment.is_overdue
    
    # Rodar check
    service = ConditionalShipmentService()
    overdue_shipments = await service.check_overdue_shipments(async_session, 1)
    
    # Verificar status foi atualizado
    assert len(overdue_shipments) >= 1
    for ship in overdue_shipments:
        if ship.id == shipment.id:
            assert ship.status == "OVERDUE"


# ============================================================================
# TESTES DE ENDPOINTS
# ============================================================================

@pytest.mark.asyncio
async def test_endpoint_create_shipment(test_client: AsyncClient, auth_token: str):
    """Teste: POST /conditional-shipments cria envio."""
    product_id = await create_test_product(test_client, auth_token, "EP1")
    customer_id = await create_test_customer(test_client, auth_token)
    
    shipment_data = {
        "customer_id": customer_id,
        "shipping_address": "Rua Endpoint Test, 999",
        "items": [
            {"product_id": product_id, "quantity_sent": 5, "unit_price": 180.0}
        ],
        "deadline_days": 10,
        "notes": "Teste de endpoint",
    }
    
    response = await test_client.post(
        "/api/v1/conditional-shipments",
        json=shipment_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["customer_id"] == customer_id
    assert data["status"] == "SENT"
    assert data["total_items_sent"] == 5
    assert data["total_value_sent"] == 900.0
    assert len(data["items"]) == 1
    
    return data["id"]


@pytest.mark.asyncio
async def test_endpoint_list_shipments(test_client: AsyncClient, auth_token: str):
    """Teste: GET /conditional-shipments lista envios."""
    # Criar envio
    await test_endpoint_create_shipment(test_client, auth_token)
    
    response = await test_client.get(
        "/api/v1/conditional-shipments",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_endpoint_list_shipments_with_filters(
    test_client: AsyncClient, auth_token: str
):
    """Teste: GET /conditional-shipments com filtros."""
    shipment_id = await test_endpoint_create_shipment(test_client, auth_token)
    
    # Filtrar por status SENT
    response = await test_client.get(
        "/api/v1/conditional-shipments?status=SENT",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    for shipment in data:
        assert shipment["status"] == "SENT"


@pytest.mark.asyncio
async def test_endpoint_get_shipment_by_id(test_client: AsyncClient, auth_token: str):
    """Teste: GET /conditional-shipments/{id} retorna detalhes."""
    shipment_id = await test_endpoint_create_shipment(test_client, auth_token)
    
    response = await test_client.get(
        f"/api/v1/conditional-shipments/{shipment_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == shipment_id
    assert "items" in data
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_endpoint_process_return(test_client: AsyncClient, auth_token: str):
    """Teste: PUT /conditional-shipments/{id}/process-return."""
    shipment_id = await test_endpoint_create_shipment(test_client, auth_token)
    
    # Buscar item ID
    get_response = await test_client.get(
        f"/api/v1/conditional-shipments/{shipment_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    item_id = get_response.json()["items"][0]["id"]
    
    # Processar devolução
    return_data = {
        "items": [
            {
                "id": item_id,
                "quantity_kept": 3,
                "quantity_returned": 2,
                "status": "KEPT",
            }
        ],
        "create_sale": True,
    }
    
    response = await test_client.put(
        f"/api/v1/conditional-shipments/{shipment_id}/process-return",
        json=return_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["total_items_kept"] == 3
    assert data["total_items_returned"] == 2
    assert data["status"] in ["PARTIAL_RETURN", "COMPLETED"]


@pytest.mark.asyncio
async def test_endpoint_cancel_shipment(test_client: AsyncClient, auth_token: str):
    """Teste: DELETE /conditional-shipments/{id} cancela envio."""
    shipment_id = await test_endpoint_create_shipment(test_client, auth_token)
    
    response = await test_client.delete(
        f"/api/v1/conditional-shipments/{shipment_id}",
        params={"reason": "Teste de cancelamento via endpoint"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "cancelado com sucesso" in data["message"]


@pytest.mark.asyncio
async def test_endpoint_check_overdue(test_client: AsyncClient, auth_token: str):
    """Teste: GET /conditional-shipments/overdue/check."""
    response = await test_client.get(
        "/api/v1/conditional-shipments/overdue/check",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


# ============================================================================
# TESTES DE VALIDAÇÃO
# ============================================================================

@pytest.mark.asyncio
async def test_validation_minimum_one_item(test_client: AsyncClient, auth_token: str):
    """Teste: Validação requer pelo menos 1 item."""
    customer_id = await create_test_customer(test_client, auth_token)
    
    shipment_data = {
        "customer_id": customer_id,
        "shipping_address": "Rua Test",
        "items": [],  # Vazio
    }
    
    response = await test_client.post(
        "/api/v1/conditional-shipments",
        json=shipment_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_validation_quantities_positive(test_client: AsyncClient, auth_token: str):
    """Teste: Validação de quantidades positivas."""
    product_id = await create_test_product(test_client, auth_token, "VAL1")
    customer_id = await create_test_customer(test_client, auth_token)
    
    shipment_data = {
        "customer_id": customer_id,
        "shipping_address": "Rua Test",
        "items": [{"product_id": product_id, "quantity_sent": -5, "unit_price": 100}],
    }
    
    response = await test_client.post(
        "/api/v1/conditional-shipments",
        json=shipment_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_validation_process_return_exceeds_sent(
    test_client: AsyncClient, auth_token: str
):
    """Teste: Validação impede processar mais que enviado."""
    shipment_id = await test_endpoint_create_shipment(test_client, auth_token)
    
    # Buscar item ID
    get_response = await test_client.get(
        f"/api/v1/conditional-shipments/{shipment_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    item_id = get_response.json()["items"][0]["id"]
    
    # Tentar processar quantidade > enviada
    return_data = {
        "items": [
            {
                "id": item_id,
                "quantity_kept": 10,
                "quantity_returned": 10,  # Total 20 > 5 enviados
                "status": "KEPT",
            }
        ],
    }
    
    response = await test_client.put(
        f"/api/v1/conditional-shipments/{shipment_id}/process-return",
        json=return_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 400
    assert "excede quantidade enviada" in response.json()["detail"]


# ============================================================================
# TESTES DE INTEGRAÇÃO
# ============================================================================

@pytest.mark.asyncio
async def test_full_flow_create_to_complete(
    test_client: AsyncClient, auth_token: str
):
    """Teste: Fluxo completo - criar → processar → finalizar."""
    product_id = await create_test_product(test_client, auth_token, "FLOW1")
    customer_id = await create_test_customer(test_client, auth_token)
    
    # 1. Criar envio
    shipment_data = {
        "customer_id": customer_id,
        "shipping_address": "Rua Fluxo Completo, 111",
        "items": [{"product_id": product_id, "quantity_sent": 10, "unit_price": 200}],
        "deadline_days": 7,
    }
    
    create_response = await test_client.post(
        "/api/v1/conditional-shipments",
        json=shipment_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert create_response.status_code == 201
    shipment_id = create_response.json()["id"]
    
    # 2. Verificar está SENT
    get_response = await test_client.get(
        f"/api/v1/conditional-shipments/{shipment_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert get_response.json()["status"] == "SENT"
    
    # 3. Processar devolução parcial
    item_id = get_response.json()["items"][0]["id"]
    return_data = {
        "items": [
            {
                "id": item_id,
                "quantity_kept": 6,
                "quantity_returned": 4,
                "status": "KEPT",
            }
        ],
        "create_sale": True,
    }
    
    process_response = await test_client.put(
        f"/api/v1/conditional-shipments/{shipment_id}/process-return",
        json=return_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert process_response.status_code == 200
    processed = process_response.json()
    assert processed["total_items_kept"] == 6
    assert processed["total_items_returned"] == 4
    assert processed["status"] == "COMPLETED"
    
    # 4. Verificar venda foi criada
    sales_response = await test_client.get(
        "/api/v1/sales",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    sales = sales_response.json()["sales"]
    assert len(sales) >= 1


@pytest.mark.asyncio
async def test_multi_product_shipment(test_client: AsyncClient, auth_token: str):
    """Teste: Envio com múltiplos produtos."""
    product1_id = await create_test_product(test_client, auth_token, "MULTI1")
    product2_id = await create_test_product(test_client, auth_token, "MULTI2")
    product3_id = await create_test_product(test_client, auth_token, "MULTI3")
    customer_id = await create_test_customer(test_client, auth_token)
    
    shipment_data = {
        "customer_id": customer_id,
        "shipping_address": "Rua Multi Produto, 222",
        "items": [
            {"product_id": product1_id, "quantity_sent": 3, "unit_price": 100},
            {"product_id": product2_id, "quantity_sent": 5, "unit_price": 150},
            {"product_id": product3_id, "quantity_sent": 2, "unit_price": 200},
        ],
        "deadline_days": 7,
    }
    
    response = await test_client.post(
        "/api/v1/conditional-shipments",
        json=shipment_data,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    
    assert response.status_code == 201
    data = response.json()
    assert len(data["items"]) == 3
    assert data["total_items_sent"] == 10  # 3 + 5 + 2
    assert data["total_value_sent"] == 1350.0  # (3*100) + (5*150) + (2*200)
