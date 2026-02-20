#!/usr/bin/env python3
"""
Teste de endpoints da API - Simula chamadas do mobile.
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

import asyncio
import httpx
import json

BASE_URL = os.getenv("API_URL", "http://localhost:8000/api/v1")
TENANT_ID = 1

async def test_api():
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # Headers padrão
        headers = {"X-Tenant-Id": str(TENANT_ID)}
        
        print("=" * 60)
        print("TESTE DE ENDPOINTS DA API")
        print("=" * 60)
        
        # 1. Health check
        print("\n1. Health Check...")
        try:
            resp = await client.get(f"{BASE_URL.replace('/api/v1', '')}/health")
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                print("   [OK] Backend online")
            else:
                print(f"   [WARN] Backend respondeu com {resp.status_code}")
        except Exception as e:
            print(f"   [ERROR] Backend offline: {e}")
            return
        
        # 2. Login (obter token)
        print("\n2. Login...")
        login_data = {
            "email": "test@test.com",
            "password": "Test12345"  # Min 8 caracteres com maiuscula
        }
        try:
            resp = await client.post(f"{BASE_URL}/auth/login", json=login_data, headers=headers)
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("access_token")
                headers["Authorization"] = f"Bearer {token}"
                print(f"   [OK] Token obtido")
            else:
                print(f"   [ERROR] {resp.text[:200]}")
                # Tentar criar usuário de teste
                print("   Tentando criar usuário de teste...")
                signup_data = {
                    "email": "test@test.com",
                    "password": "Test12345",  # Min 8 caracteres com maiuscula
                    "full_name": "Test User",
                    "store_name": "Test Store"
                }
                resp = await client.post(f"{BASE_URL}/auth/signup", json=signup_data, headers=headers)
                if resp.status_code in [200, 201]:
                    data = resp.json()
                    token = data.get("access_token")
                    if token:
                        headers["Authorization"] = f"Bearer {token}"
                        print(f"   [OK] Usuário criado e token obtido")
                else:
                    print(f"   [ERROR] Não foi possível autenticar: {resp.text[:200]}")
                    return
        except Exception as e:
            print(f"   [ERROR] {e}")
            return
        
        # 3. Listar produtos ativos
        print("\n3. GET /products/active...")
        try:
            resp = await client.get(f"{BASE_URL}/products/active", headers=headers)
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                products = resp.json()
                print(f"   [OK] {len(products)} produtos ativos")
                if products:
                    print(f"   Primeiro: {products[0].get('name')} - SKU: {products[0].get('sku')}")
            else:
                print(f"   [ERROR] {resp.text[:500]}")
        except Exception as e:
            print(f"   [ERROR] {e}")
        
        # 4. Listar catálogo
        print("\n4. GET /products/catalog...")
        try:
            resp = await client.get(f"{BASE_URL}/products/catalog", headers=headers)
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                products = resp.json()
                print(f"   [OK] {len(products)} produtos no catálogo")
            else:
                print(f"   [ERROR] {resp.text[:500]}")
        except Exception as e:
            print(f"   [ERROR] {e}")
        
        # 5. Criar produto
        print("\n5. POST /products (criar produto)...")
        product_data = {
            "name": f"Produto Teste {asyncio.get_event_loop().time():.0f}",
            "description": "Produto para teste de API",
            "sku": f"TEST-{asyncio.get_event_loop().time():.0f}",
            "price": 99.90,
            "cost_price": 45.00,
            "category_id": 1,
            "brand": "TestBrand",
            "is_catalog": False,
            "initial_stock": 0
        }
        try:
            resp = await client.post(f"{BASE_URL}/products", json=product_data, headers=headers)
            print(f"   Status: {resp.status_code}")
            if resp.status_code in [200, 201]:
                product = resp.json()
                product_id = product.get("id")
                print(f"   [OK] Produto criado: {product.get('name')} (ID: {product_id})")
                print(f"   SKU: {product.get('sku')}")
            else:
                print(f"   [ERROR] {resp.text[:500]}")
                product_id = None
        except Exception as e:
            print(f"   [ERROR] {e}")
            product_id = None
        
        # 6. Buscar produto por ID
        if product_id:
            print(f"\n6. GET /products/{product_id}...")
            try:
                resp = await client.get(f"{BASE_URL}/products/{product_id}", headers=headers)
                print(f"   Status: {resp.status_code}")
                if resp.status_code == 200:
                    product = resp.json()
                    print(f"   [OK] Produto: {product.get('name')}")
                    print(f"   SKU: {product.get('sku')}, Preço: {product.get('price')}")
                else:
                    print(f"   [ERROR] {resp.text[:500]}")
            except Exception as e:
                print(f"   [ERROR] {e}")
        
        # 7. Dashboard
        print("\n7. GET /dashboard...")
        try:
            resp = await client.get(f"{BASE_URL}/dashboard", headers=headers)
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                dashboard = resp.json()
                print(f"   [OK] Dashboard carregado")
                print(f"   Vendas do dia: {dashboard.get('daily_sales', {}).get('total', 0)}")
                print(f"   Produtos ativos: {dashboard.get('products_count', 0)}")
            else:
                print(f"   [ERROR] {resp.text[:500]}")
        except Exception as e:
            print(f"   [ERROR] {e}")
        
        print("\n" + "=" * 60)
        print("TESTES CONCLUÍDOS")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_api())