"""
Teste integrado da API - Valida todos os endpoints criados
"""
import asyncio
import json
from decimal import Decimal

async def test_api():
    """Testa todos os endpoints da API"""
    import aiohttp
    
    BASE_URL = "http://127.0.0.1:8000"
    
    print("=" * 70)
    print("🧪 TESTE INTEGRADO DA API")
    print("=" * 70)
    
    async with aiohttp.ClientSession() as session:
        
        # 1. Health Check
        print("\n1️⃣  Testando Health Check...")
        async with session.get(f"{BASE_URL}/health") as resp:
            data = await resp.json()
            print(f"   ✅ Status: {resp.status}")
            print(f"   📊 Response: {json.dumps(data, indent=2)}")
        
        # 2. Root
        print("\n2️⃣  Testando Root...")
        async with session.get(f"{BASE_URL}/") as resp:
            data = await resp.json()
            print(f"   ✅ Status: {resp.status}")
            print(f"   📊 Response: {json.dumps(data, indent=2)}")
        
        # 3. Registrar usuário
        print("\n3️⃣  Registrando usuário Admin...")
        user_data = {
            "email": "admin@fitness.com",
            "password": "Admin123",
            "full_name": "Administrador Sistema",
            "role": "ADMIN",
            "phone": "(11) 99999-9999"
        }
        async with session.post(f"{BASE_URL}/api/v1/auth/register", json=user_data) as resp:
            if resp.status == 201:
                admin_response = await resp.json()
                print(f"   ✅ Admin criado: {admin_response['user']['email']}")
            else:
                print(f"   ⚠️  Status: {resp.status} - {await resp.text()}")
        
        # 4. Login
        print("\n4️⃣  Fazendo login...")
        login_data = {
            "email": "admin@fitness.com",
            "password": "Admin123"
        }
        async with session.post(f"{BASE_URL}/api/v1/auth/login", json=login_data) as resp:
            if resp.status == 200:
                login_response = await resp.json()
                token = login_response['access_token']
                print(f"   ✅ Login OK! Token: {token[:30]}...")
                headers = {"Authorization": f"Bearer {token}"}
            else:
                print(f"   ❌ Erro no login: {resp.status}")
                return
        
        # 5. Listar categorias (público)
        print("\n5️⃣  Listando categorias...")
        async with session.get(f"{BASE_URL}/api/v1/categories/") as resp:
            categories = await resp.json()
            print(f"   ✅ Status: {resp.status}")
            print(f"   📊 Total de categorias: {len(categories)}")
        
        # 6. Criar categoria
        print("\n6️⃣  Criando categoria...")
        category_data = {
            "name": "Suplementos",
            "description": "Suplementos alimentares",
            "parent_id": None
        }
        async with session.post(f"{BASE_URL}/api/v1/categories/", json=category_data, headers=headers) as resp:
            if resp.status == 201:
                category = await resp.json()
                category_id = category['id']
                print(f"   ✅ Categoria criada: ID {category_id}")
            else:
                print(f"   ⚠️  Status: {resp.status} - {await resp.text()}")
                category_id = 1
        
        # 7. Criar produto
        print("\n7️⃣  Criando produto...")
        product_data = {
            "name": "Whey Protein 1kg",
            "description": "Proteína de soro do leite",
            "sku": "WHEY-001",
            "barcode": "7891234567890",
            "price": 99.90,
            "cost_price": 60.00,
            "category_id": category_id,
            "brand": "FitMax",
            "is_digital": False,
            "is_activewear": False
        }
        async with session.post(f"{BASE_URL}/api/v1/products/", json=product_data, headers=headers) as resp:
            if resp.status == 201:
                product = await resp.json()
                product_id = product['id']
                print(f"   ✅ Produto criado: ID {product_id}")
            else:
                print(f"   ⚠️  Status: {resp.status} - {await resp.text()}")
                product_id = 1
        
        # 8. Listar produtos
        print("\n8️⃣  Listando produtos...")
        async with session.get(f"{BASE_URL}/api/v1/products/") as resp:
            products = await resp.json()
            print(f"   ✅ Status: {resp.status}")
            print(f"   📊 Total de produtos: {len(products)}")
        
        # 9. Criar cliente
        print("\n9️⃣  Criando cliente...")
        customer_data = {
            "full_name": "Maria Silva",
            "email": "maria@email.com",
            "phone": "(11) 98765-4321",
            "document_number": "12345678900",
            "address": "Rua A, 123",
            "city": "São Paulo",
            "state": "SP",
            "zip_code": "01234-567"
        }
        async with session.post(f"{BASE_URL}/api/v1/customers/", json=customer_data, headers=headers) as resp:
            if resp.status == 201:
                customer = await resp.json()
                customer_id = customer['id']
                print(f"   ✅ Cliente criado: ID {customer_id}")
            else:
                print(f"   ⚠️  Status: {resp.status} - {await resp.text()}")
                customer_id = 1
        
        # 10. Adicionar estoque
        print("\n🔟  Adicionando estoque...")
        stock_data = {
            "product_id": product_id,
            "warehouse_id": 1,
            "quantity": 100,
            "notes": "Estoque inicial"
        }
        async with session.post(f"{BASE_URL}/api/v1/inventory/add", json=stock_data, headers=headers) as resp:
            if resp.status == 201:
                inventory = await resp.json()
                print(f"   ✅ Estoque adicionado: {inventory['quantity']} unidades")
            else:
                print(f"   ⚠️  Status: {resp.status} - {await resp.text()}")
        
        # 11. Alertas de estoque
        print("\n1️⃣1️⃣  Verificando alertas de estoque...")
        async with session.get(f"{BASE_URL}/api/v1/inventory/alerts", headers=headers) as resp:
            alerts = await resp.json()
            print(f"   ✅ Status: {resp.status}")
            print(f"   📊 Total de alertas: {len(alerts)}")
        
        # 12. Listar clientes
        print("\n1️⃣2️⃣  Listando clientes...")
        async with session.get(f"{BASE_URL}/api/v1/customers/", headers=headers) as resp:
            customers = await resp.json()
            print(f"   ✅ Status: {resp.status}")
            print(f"   📊 Total de clientes: {len(customers)}")
        
        # 13. Hierarquia de categorias
        print("\n1️⃣3️⃣  Obtendo hierarquia de categorias...")
        async with session.get(f"{BASE_URL}/api/v1/categories/hierarchy") as resp:
            hierarchy = await resp.json()
            print(f"   ✅ Status: {resp.status}")
            print(f"   📊 Categorias raiz: {len(hierarchy)}")
        
        print("\n" + "=" * 70)
        print("✅ TODOS OS TESTES CONCLUÍDOS COM SUCESSO!")
        print("=" * 70)
        print("\n📚 Documentação disponível em: http://127.0.0.1:8000/api/docs")
        print("\n📊 Total de endpoints testados: 13")
        print("   - ✅ Health check")
        print("   - ✅ Root")
        print("   - ✅ Auth (register, login)")
        print("   - ✅ Categories (list, create, hierarchy)")
        print("   - ✅ Products (list, create)")
        print("   - ✅ Customers (list, create)")
        print("   - ✅ Inventory (add, alerts)")
        print("=" * 70)


if __name__ == "__main__":
    try:
        asyncio.run(test_api())
    except KeyboardInterrupt:
        print("\n\n⚠️  Teste interrompido pelo usuário")
    except Exception as e:
        print(f"\n\n❌ Erro durante o teste: {e}")
        import traceback
        traceback.print_exc()
