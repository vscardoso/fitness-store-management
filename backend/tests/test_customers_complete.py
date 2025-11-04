"""
Testes completos para endpoints de Clientes.
Testa: Criar, Listar, Buscar, Editar, Deletar clientes.
"""
import pytest
from httpx import AsyncClient

from tests.conftest import test_client, auth_token


@pytest.mark.asyncio
async def test_create_customer(test_client: AsyncClient, auth_token: str):
    """Teste: Criar cliente."""
    customer_data = {
        "full_name": "João da Silva",
        "email": "joao.silva@email.com",
        "phone": "11987654321",
        "document_number": "12345678901",
        "customer_type": "INDIVIDUAL",
        "birth_date": "1990-05-15",
        "address": "Rua Teste, 123",
        "city": "São Paulo",
        "state": "SP",
        "postal_code": "01234567"
    }
    
    response = await test_client.post(
        "/api/v1/customers",
        json=customer_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["full_name"] == customer_data["full_name"]
    assert data["email"] == customer_data["email"]
    assert data["phone"] == customer_data["phone"]
    assert "id" in data
    
    return data["id"]


@pytest.mark.asyncio
async def test_list_customers(test_client: AsyncClient, auth_token: str):
    """Teste: Listar clientes."""
    response = await test_client.get(
        "/api/v1/customers/",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_customer_by_id(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar cliente por ID."""
    # Criar cliente primeiro
    customer_id = await test_create_customer(test_client, auth_token)
    
    response = await test_client.get(
        f"/api/v1/customers/{customer_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == customer_id


@pytest.mark.asyncio
async def test_search_customers(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar clientes por nome."""
    response = await test_client.get(
        "/api/v1/customers/search?query=João",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_update_customer(test_client: AsyncClient, auth_token: str):
    """Teste: Editar cliente."""
    # Criar cliente primeiro
    customer_id = await test_create_customer(test_client, auth_token)
    
    update_data = {
        "full_name": "João da Silva Santos",
        "phone": "11999887766"
    }
    
    response = await test_client.put(
        f"/api/v1/customers/{customer_id}",
        json=update_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == update_data["full_name"]
    assert data["phone"] == update_data["phone"]


@pytest.mark.asyncio
async def test_delete_customer(test_client: AsyncClient, auth_token: str):
    """Teste: Deletar cliente (soft delete)."""
    # Criar cliente primeiro
    customer_id = await test_create_customer(test_client, auth_token)
    
    response = await test_client.delete(
        f"/api/v1/customers/{customer_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    
    # Verificar que foi soft deleted
    get_response = await test_client.get(
        f"/api/v1/customers/{customer_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_get_customer_sales_history(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar histórico de vendas do cliente."""
    customer_id = await test_create_customer(test_client, auth_token)
    
    response = await test_client.get(
        f"/api/v1/customers/{customer_id}/sales",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_create_customer_without_auth(test_client: AsyncClient):
    """Teste: Criar cliente sem autenticação (deve falhar)."""
    customer_data = {
        "full_name": "Teste",
        "email": "teste@email.com"
    }
    
    response = await test_client.post(
        "/api/v1/customers",
        json=customer_data
    )
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_customer_duplicate_email(test_client: AsyncClient, auth_token: str):
    """Teste: Criar cliente com email duplicado (deve falhar)."""
    customer_data = {
        "full_name": "Cliente 1",
        "email": "duplicado@email.com",
        "phone": "11999999999"
    }
    
    # Criar primeiro cliente
    response1 = await test_client.post(
        "/api/v1/customers",
        json=customer_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response1.status_code == 201
    
    # Tentar criar segundo cliente com mesmo email
    response2 = await test_client.post(
        "/api/v1/customers",
        json=customer_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response2.status_code == 400


@pytest.mark.asyncio
async def test_get_top_customers(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar top clientes por gastos."""
    response = await test_client.get(
        "/api/v1/customers/top?limit=10",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
