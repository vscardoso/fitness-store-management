"""
Testes completos para endpoints de Inventário (Inventory).
Testa: Movimentações, ajustes, consultas de estoque.
"""
import pytest
from httpx import AsyncClient
from datetime import date

from tests.conftest import test_client, auth_token


async def create_test_product_with_inventory(test_client: AsyncClient, auth_token: str):
    """Helper: Criar produto com inventário para testes."""
    product_data = {
        "name": f"Produto Inventário Teste {date.today().isoformat()}",
        "sku": f"INV-TEST-{date.today().isoformat()}",
        "price": 150.0,
        "cost_price": 80.0,
        "initial_quantity": 50
    }
    response = await test_client.post(
        "/api/v1/products",
        json=product_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    return response.json()["id"]


@pytest.mark.asyncio
async def test_create_inventory_movement_in(test_client: AsyncClient, auth_token: str):
    """Teste: Criar movimentação de entrada de estoque."""
    product_id = await create_test_product_with_inventory(test_client, auth_token)
    
    movement_data = {
        "product_id": product_id,
        "quantity": 20,
        "movement_type": "IN",
        "reason": "Compra de fornecedor",
        "reference_number": "NF-123456"
    }
    
    response = await test_client.post(
        "/api/v1/inventory/movement",
        json=movement_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["product_id"] == product_id
    assert data["quantity"] == 20
    assert data["movement_type"] == "IN"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_inventory_movement_out(test_client: AsyncClient, auth_token: str):
    """Teste: Criar movimentação de saída de estoque."""
    product_id = await create_test_product_with_inventory(test_client, auth_token)
    
    movement_data = {
        "product_id": product_id,
        "quantity": 5,
        "movement_type": "OUT",
        "reason": "Ajuste de estoque",
        "reference_number": "ADJ-001"
    }
    
    response = await test_client.post(
        "/api/v1/inventory/movement",
        json=movement_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["product_id"] == product_id
    assert data["quantity"] == 5
    assert data["movement_type"] == "OUT"


@pytest.mark.asyncio
async def test_get_inventory_by_product(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar inventário de um produto específico."""
    product_id = await create_test_product_with_inventory(test_client, auth_token)
    
    response = await test_client.get(
        f"/api/v1/inventory/product/{product_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["product_id"] == product_id
    assert "quantity" in data


@pytest.mark.asyncio
async def test_list_all_inventory(test_client: AsyncClient, auth_token: str):
    """Teste: Listar todo o inventário."""
    response = await test_client.get(
        "/api/v1/inventory/",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_inventory_movements(test_client: AsyncClient, auth_token: str):
    """Teste: Listar movimentações de inventário."""
    response = await test_client.get(
        "/api/v1/inventory/movements?skip=0&limit=100",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_inventory_movements_by_product(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar movimentações de um produto específico."""
    product_id = await create_test_product_with_inventory(test_client, auth_token)
    
    # Criar uma movimentação
    movement_data = {
        "product_id": product_id,
        "quantity": 10,
        "movement_type": "IN",
        "reason": "Teste"
    }
    await test_client.post(
        "/api/v1/inventory/movement",
        json=movement_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    response = await test_client.get(
        f"/api/v1/inventory/movements/product/{product_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_adjust_inventory(test_client: AsyncClient, auth_token: str):
    """Teste: Ajustar estoque de um produto."""
    product_id = await create_test_product_with_inventory(test_client, auth_token)
    
    adjust_data = {
        "new_quantity": 100,
        "reason": "Ajuste de inventário anual"
    }
    
    response = await test_client.post(
        f"/api/v1/inventory/adjust/{product_id}",
        json=adjust_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["quantity"] == 100


@pytest.mark.asyncio
async def test_get_low_stock_inventory(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar produtos com estoque baixo."""
    response = await test_client.get(
        "/api/v1/inventory/low-stock",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_create_movement_without_auth(test_client: AsyncClient):
    """Teste: Criar movimentação sem autenticação (deve falhar)."""
    movement_data = {
        "product_id": 1,
        "quantity": 10,
        "movement_type": "IN"
    }
    
    response = await test_client.post(
        "/api/v1/inventory/movement",
        json=movement_data
    )
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_movement_with_invalid_product(test_client: AsyncClient, auth_token: str):
    """Teste: Criar movimentação com produto inexistente (deve falhar)."""
    movement_data = {
        "product_id": 999999,
        "quantity": 10,
        "movement_type": "IN"
    }
    
    response = await test_client.post(
        "/api/v1/inventory/movement",
        json=movement_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code in [400, 404]


@pytest.mark.asyncio
async def test_create_movement_out_with_insufficient_stock(test_client: AsyncClient, auth_token: str):
    """Teste: Criar saída com estoque insuficiente (deve falhar)."""
    product_id = await create_test_product_with_inventory(test_client, auth_token)
    
    movement_data = {
        "product_id": product_id,
        "quantity": 1000,  # Quantidade maior que o estoque
        "movement_type": "OUT",
        "reason": "Teste"
    }
    
    response = await test_client.post(
        "/api/v1/inventory/movement",
        json=movement_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_adjust_inventory_negative(test_client: AsyncClient, auth_token: str):
    """Teste: Ajustar estoque para quantidade negativa (deve falhar)."""
    product_id = await create_test_product_with_inventory(test_client, auth_token)
    
    adjust_data = {
        "new_quantity": -10,
        "reason": "Teste negativo"
    }
    
    response = await test_client.post(
        f"/api/v1/inventory/adjust/{product_id}",
        json=adjust_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_inventory_value(test_client: AsyncClient, auth_token: str):
    """Teste: Calcular valor total do inventário."""
    response = await test_client.get(
        "/api/v1/inventory/value",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "total_value" in data
    assert "total_items" in data


@pytest.mark.asyncio
async def test_get_inventory_by_category(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar inventário por categoria."""
    response = await test_client.get(
        "/api/v1/inventory/by-category/1",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
