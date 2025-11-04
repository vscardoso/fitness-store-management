"""
Testes completos para endpoints de Vendas (Sales).
Testa: Criar, Listar, Buscar, Cancelar vendas e relatórios.
"""
import pytest
from httpx import AsyncClient
from datetime import date

from tests.conftest import test_client, auth_token


async def create_test_product(test_client: AsyncClient, auth_token: str):
    """Helper: Criar produto para testes."""
    product_data = {
        "name": "Produto Teste Venda",
        "sku": f"SALE-TEST-{date.today().isoformat()}",
        "price": 100.0,
        "cost_price": 50.0,
        "initial_quantity": 100
    }
    response = await test_client.post(
        "/api/v1/products",
        json=product_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    return response.json()["id"]


async def create_test_customer(test_client: AsyncClient, auth_token: str):
    """Helper: Criar cliente para testes."""
    customer_data = {
        "full_name": "Cliente Teste Venda",
        "email": f"vendateste{date.today().isoformat()}@email.com",
        "phone": "11999999999"
    }
    response = await test_client.post(
        "/api/v1/customers",
        json=customer_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    return response.json()["id"]


@pytest.mark.asyncio
async def test_create_sale(test_client: AsyncClient, auth_token: str):
    """Teste: Criar venda."""
    # Criar produto e cliente primeiro
    product_id = await create_test_product(test_client, auth_token)
    customer_id = await create_test_customer(test_client, auth_token)
    
    sale_data = {
        "customer_id": customer_id,
        "payment_method": "CREDIT_CARD",
        "items": [
            {
                "product_id": product_id,
                "quantity": 2,
                "unit_price": 100.0,
                "discount": 0.0
            }
        ]
    }
    
    response = await test_client.post(
        "/api/v1/sales/",
        json=sale_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["customer_id"] == customer_id
    assert data["total_amount"] == 200.0
    assert data["status"] == "COMPLETED"
    assert len(data["items"]) == 1
    assert "id" in data
    
    return data["id"]


@pytest.mark.asyncio
async def test_list_sales(test_client: AsyncClient, auth_token: str):
    """Teste: Listar vendas."""
    response = await test_client.get(
        "/api/v1/sales/?skip=0&limit=100",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_sale_by_id(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar venda por ID."""
    # Criar venda primeiro
    sale_id = await test_create_sale(test_client, auth_token)
    
    response = await test_client.get(
        f"/api/v1/sales/{sale_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == sale_id


@pytest.mark.asyncio
async def test_cancel_sale(test_client: AsyncClient, auth_token: str):
    """Teste: Cancelar venda."""
    # Criar venda primeiro
    sale_id = await test_create_sale(test_client, auth_token)
    
    response = await test_client.post(
        f"/api/v1/sales/{sale_id}/cancel",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CANCELLED"


@pytest.mark.asyncio
async def test_get_daily_report(test_client: AsyncClient, auth_token: str):
    """Teste: Relatório diário de vendas."""
    response = await test_client.get(
        "/api/v1/sales/reports/daily",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "total_sales" in data
    assert "total_revenue" in data
    assert "sales" in data


@pytest.mark.asyncio
async def test_get_sales_by_date_range(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar vendas por período."""
    response = await test_client.get(
        f"/api/v1/sales/by-date-range?start_date=2025-10-01&end_date=2025-10-31",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_sales_by_payment_method(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar vendas por método de pagamento."""
    response = await test_client.get(
        "/api/v1/sales/by-payment-method/CREDIT_CARD",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_create_sale_without_auth(test_client: AsyncClient):
    """Teste: Criar venda sem autenticação (deve falhar)."""
    sale_data = {
        "customer_id": 1,
        "payment_method": "CASH",
        "items": []
    }
    
    response = await test_client.post(
        "/api/v1/sales/",
        json=sale_data
    )
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_sale_with_invalid_product(test_client: AsyncClient, auth_token: str):
    """Teste: Criar venda com produto inexistente (deve falhar)."""
    customer_id = await create_test_customer(test_client, auth_token)
    
    sale_data = {
        "customer_id": customer_id,
        "payment_method": "CASH",
        "items": [
            {
                "product_id": 999999,
                "quantity": 1,
                "unit_price": 10.0
            }
        ]
    }
    
    response = await test_client.post(
        "/api/v1/sales/",
        json=sale_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code in [400, 404]


@pytest.mark.asyncio
async def test_create_sale_with_insufficient_stock(test_client: AsyncClient, auth_token: str):
    """Teste: Criar venda com estoque insuficiente (deve falhar)."""
    product_id = await create_test_product(test_client, auth_token)
    customer_id = await create_test_customer(test_client, auth_token)
    
    sale_data = {
        "customer_id": customer_id,
        "payment_method": "CASH",
        "items": [
            {
                "product_id": product_id,
                "quantity": 1000,  # Quantidade maior que o estoque
                "unit_price": 10.0
            }
        ]
    }
    
    response = await test_client.post(
        "/api/v1/sales/",
        json=sale_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_top_selling_products(test_client: AsyncClient, auth_token: str):
    """Teste: Buscar produtos mais vendidos."""
    response = await test_client.get(
        "/api/v1/sales/reports/top-selling-products?limit=10",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_revenue_by_period(test_client: AsyncClient, auth_token: str):
    """Teste: Relatório de receita por período."""
    response = await test_client.get(
        "/api/v1/sales/reports/revenue?start_date=2025-10-01&end_date=2025-10-31",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "total_revenue" in data
    assert "total_sales" in data
