"""
Testes de integração para endpoints de produtos
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_product(test_client, auth_token):
    """Testa criação de produto via API"""
    # Arrange
    product_data = {
        "name": "Creatina Monohidratada",
        "sku": "CR-001",
        "barcode": "7891234567890",
        "category_id": 1,
        "brand": "FitNutrition",
        "cost_price": 50.00,
        "sale_price": 80.00,
        "description": "Creatina pura"
    }
    
    # Act
    response = await test_client.post(
        "/api/v1/products/",
        json=product_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Creatina Monohidratada"
    assert data["sku"] == "CR-001"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_product(test_client, auth_token):
    """Testa busca de produto por ID"""
    # Arrange
    product_id = 1
    
    # Act
    response = await test_client.get(
        f"/api/v1/products/{product_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == product_id


@pytest.mark.asyncio
async def test_list_products(test_client, auth_token):
    """Testa listagem de produtos"""
    # Act
    response = await test_client.get(
        "/api/v1/products/?skip=0&limit=10",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    # Assert
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_update_product(test_client, auth_token):
    """Testa atualização de produto"""
    # Arrange
    product_id = 1
    update_data = {
        "name": "Creatina Premium",
        "sale_price": 100.00
    }
    
    # Act
    response = await test_client.put(
        f"/api/v1/products/{product_id}",
        json=update_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Creatina Premium"
    # sale_price pode vir como string devido à serialização Decimal
    assert float(data["sale_price"]) == 100.00


@pytest.mark.asyncio
async def test_delete_product(test_client, auth_token):
    """Testa exclusão de produto"""
    # Arrange
    product_id = 1
    
    # Act
    response = await test_client.delete(
        f"/api/v1/products/{product_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    # Assert
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_create_product_unauthorized(test_client):
    """Testa criação de produto sem autenticação"""
    # Arrange
    product_data = {
        "name": "Produto Teste",
        "sku": "PT-001",
        "category_id": 1,
        "cost_price": 10.00,
        "sale_price": 20.00
    }
    
    # Act
    response = await test_client.post(
        "/api/v1/products/",
        json=product_data
    )
    
    # Assert
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_product_invalid_data(test_client, auth_token):
    """Testa criação de produto com dados inválidos"""
    # Arrange
    product_data = {
        "name": "",  # Nome vazio (inválido)
        "sku": "PT-001",
        "category_id": 1,
        "cost_price": -10.00,  # Preço negativo (inválido)
        "sale_price": 20.00
    }
    
    # Act
    response = await test_client.post(
        "/api/v1/products/",
        json=product_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    # Assert
    assert response.status_code == 422

