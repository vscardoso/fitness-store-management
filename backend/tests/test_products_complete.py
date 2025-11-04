"""
Testes completos para endpoints de Produtos.
Testa: Criar, Listar, Buscar, Editar, Deletar produtos.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from tests.conftest import test_client, async_session, auth_token


@pytest.mark.asyncio
async def test_create_product(test_client: AsyncClient, auth_token: str, async_session: AsyncSession):
    """Teste: Criar produto."""
    product_data = {
        "name": "Whey Protein Premium",
        "sku": "WHEY-001",
        "price": 149.90,
        "cost_price": 89.90,
        "category_id": 1,
        "brand": "Integral Médica",
        "description": "Whey protein concentrado",
        "min_stock_threshold": 10,
        "initial_quantity": 50
    }
    
    response = await test_client.post(
        "/api/v1/products/",
        json=product_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == product_data["name"]
    assert data["sku"] == product_data["sku"]
    # Preço pode vir como string do JSON
    assert float(data["price"]) == product_data["price"]
    assert "id" in data
    
    return data["id"]


@pytest.mark.asyncio
async def test_list_products(test_client: AsyncClient, auth_token: str):
    """Teste: Listar produtos."""
    response = await test_client.get(
        "/api/v1/products/",
        headers={"Authorization": f"Bearer {auth_token}"},
        params={"skip": 0, "limit": 100}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_product_by_id(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar produto por ID."""
    # Criar produto primeiro
    product_id = await test_create_product(test_client, auth_token, None)
    
    response = await test_client.get(
        f"/api/v1/products/{product_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == product_id


@pytest.mark.asyncio
async def test_search_products(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar produtos por nome."""
    response = await test_client.get(
        "/api/v1/products/",
        headers={"Authorization": f"Bearer {auth_token}"},
        params={"search": "Whey", "skip": 0, "limit": 100}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_update_product(test_client: AsyncClient, auth_token: str):
    """Teste: Editar produto."""
    # Criar produto primeiro
    product_id = await test_create_product(test_client, auth_token, None)
    
    update_data = {
        "name": "Whey Protein Premium ATUALIZADO",
        "price": 159.90
    }
    
    response = await test_client.put(
        f"/api/v1/products/{product_id}",
        json=update_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == update_data["name"]
    # Preço pode vir como string do JSON
    assert float(data["price"]) == update_data["price"]


@pytest.mark.asyncio
async def test_delete_product(test_client: AsyncClient, auth_token: str):
    """Teste: Deletar produto (soft delete)."""
    # Criar produto primeiro
    product_id = await test_create_product(test_client, auth_token, None)
    
    response = await test_client.delete(
        f"/api/v1/products/{product_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 204
    
    # Verificar que foi soft deleted
    get_response = await test_client.get(
        f"/api/v1/products/{product_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_get_low_stock_products(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar produtos com estoque baixo."""
    response = await test_client.get(
        "/api/v1/products/low-stock",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_products_by_category(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar produtos por categoria - usa query param category_id."""
    response = await test_client.get(
        "/api/v1/products/",
        headers={"Authorization": f"Bearer {auth_token}"},
        params={"category_id": 1, "skip": 0, "limit": 100}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_create_product_without_auth(test_client: AsyncClient):
    """Teste: Criar produto sem autenticação (deve falhar)."""
    product_data = {
        "name": "Produto Teste",
        "sku": "TEST-001",
        "price": 10.0
    }
    
    response = await test_client.post(
        "/api/v1/products/",
        json=product_data,
        follow_redirects=True
    )
    
    # 403 Forbidden quando não há token (FastAPI padrão)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_product_duplicate_sku(test_client: AsyncClient, auth_token: str):
    """Teste: Criar produto com SKU duplicado (deve falhar)."""
    product_data = {
        "name": "Produto 1",
        "sku": "DUP-001",
        "price": 10.0,
        "category_id": 1,
        "initial_quantity": 10
    }
    
    # Criar primeiro produto
    response1 = await test_client.post(
        "/api/v1/products/",
        json=product_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response1.status_code == 201
    
    # Tentar criar segundo produto com mesmo SKU
    response2 = await test_client.post(
        "/api/v1/products/",
        json=product_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response2.status_code == 400
