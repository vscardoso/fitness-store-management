"""
Testes completos para endpoints de Lotes (Batches).
Testa: Criar, Listar, Buscar, Editar, Deletar lotes.
"""
import pytest
from httpx import AsyncClient
from datetime import date

from tests.conftest import test_client, auth_token


@pytest.mark.asyncio
async def test_create_batch(test_client: AsyncClient, auth_token: str):
    """Teste: Criar lote."""
    batch_data = {
        "batch_code": "LOTE-2025-001",
        "purchase_date": "2025-10-31",
        "invoice_number": "NF-12345",
        "supplier_name": "Fornecedor Fitness LTDA",
        "supplier_cnpj": "12.345.678/0001-99",
        "total_cost": 5000.00,
        "notes": "Lote de equipamentos novos"
    }
    
    response = await test_client.post(
        "/api/v1/batches/",
        json=batch_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["batch_code"] == batch_data["batch_code"]
    assert data["supplier_name"] == batch_data["supplier_name"]
    assert data["total_cost"] == batch_data["total_cost"]
    assert "id" in data
    
    return data["id"]


@pytest.mark.asyncio
async def test_list_batches(test_client: AsyncClient, auth_token: str):
    """Teste: Listar lotes."""
    response = await test_client.get(
        "/api/v1/batches/?skip=0&limit=100",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_batch_by_id(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar lote por ID."""
    # Criar lote primeiro
    batch_id = await test_create_batch(test_client, auth_token)
    
    response = await test_client.get(
        f"/api/v1/batches/{batch_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == batch_id


@pytest.mark.asyncio
async def test_get_batch_by_code(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar lote por código."""
    # Criar lote primeiro
    batch_id = await test_create_batch(test_client, auth_token)
    
    response = await test_client.get(
        "/api/v1/batches/by-number/LOTE-2025-001",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["batch_code"] == "LOTE-2025-001"


@pytest.mark.asyncio
async def test_search_batches(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar lotes por termo."""
    response = await test_client.get(
        "/api/v1/batches/?search=LOTE",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_update_batch(test_client: AsyncClient, auth_token: str):
    """Teste: Editar lote."""
    # Criar lote primeiro
    batch_id = await test_create_batch(test_client, auth_token)
    
    update_data = {
        "supplier_name": "Fornecedor Fitness Premium LTDA",
        "total_cost": 5500.00,
        "notes": "Lote atualizado com observações"
    }
    
    response = await test_client.put(
        f"/api/v1/batches/{batch_id}",
        json=update_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["supplier_name"] == update_data["supplier_name"]
    assert data["total_cost"] == update_data["total_cost"]


@pytest.mark.asyncio
async def test_delete_batch(test_client: AsyncClient, auth_token: str):
    """Teste: Deletar lote (soft delete)."""
    # Criar lote primeiro
    batch_id = await test_create_batch(test_client, auth_token)
    
    response = await test_client.delete(
        f"/api/v1/batches/{batch_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    
    # Verificar que foi soft deleted
    get_response = await test_client.get(
        f"/api/v1/batches/{batch_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_get_batches_by_supplier(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar lotes por fornecedor."""
    # Criar lote primeiro
    await test_create_batch(test_client, auth_token)
    
    response = await test_client.get(
        "/api/v1/batches/by-supplier/Fornecedor%20Fitness",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_slow_moving_batches(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar lotes com venda lenta."""
    response = await test_client.get(
        "/api/v1/batches/reports/slow-moving?min_days=60&min_remaining=15",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_best_performing_batches(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar lotes com melhor performance."""
    response = await test_client.get(
        "/api/v1/batches/reports/best-performing?limit=10",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_create_batch_without_auth(test_client: AsyncClient):
    """Teste: Criar lote sem autenticação (deve falhar)."""
    batch_data = {
        "batch_code": "TESTE-001",
        "purchase_date": "2025-10-31",
        "total_cost": 1000.00
    }
    
    response = await test_client.post(
        "/api/v1/batches/",
        json=batch_data
    )
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_batch_duplicate_code(test_client: AsyncClient, auth_token: str):
    """Teste: Criar lote com código duplicado (deve falhar)."""
    batch_data = {
        "batch_code": "DUP-LOTE-001",
        "purchase_date": "2025-10-31",
        "total_cost": 1000.00
    }
    
    # Criar primeiro lote
    response1 = await test_client.post(
        "/api/v1/batches/",
        json=batch_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response1.status_code == 201
    
    # Tentar criar segundo lote com mesmo código
    response2 = await test_client.post(
        "/api/v1/batches/",
        json=batch_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response2.status_code == 400


@pytest.mark.asyncio
async def test_get_expired_batches(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar lotes vencidos."""
    response = await test_client.get(
        "/api/v1/batches/expired",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_expiring_soon_batches(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar lotes próximos ao vencimento."""
    response = await test_client.get(
        "/api/v1/batches/expiring-soon?days=30",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
