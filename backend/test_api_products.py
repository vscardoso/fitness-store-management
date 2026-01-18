"""
Teste direto da API de produtos
"""
import asyncio
import httpx

async def test():
    async with httpx.AsyncClient() as client:
        # Login
        login_response = await client.post(
            'http://localhost:8000/api/v1/auth/login',
            json={'email': 'admin@fitness.com', 'password': 'admin123'}
        )
        login_data = login_response.json()
        print(f'Login response: {login_data}')
        token = login_data.get('access_token') or login_data.get('token')
        print(f'Token obtido: {token[:50] if token else "NONE"}...\n')
        
        # Buscar produtos com has_stock=true
        headers = {'Authorization': f'Bearer {token}'}
        response = await client.get(
            'http://localhost:8000/api/v1/products/?has_stock=true&limit=100',
            headers=headers
        )
        
        products = response.json()
        print(f'=== RESPOSTA DA API ===')
        print(f'Status Code: {response.status_code}')
        print(f'Total de produtos retornados: {len(products)}\n')
        
        for p in products:
            print(f'ID: {p["id"]} | Nome: {p["name"]} | Estoque: {p.get("current_stock", "N/A")}')

asyncio.run(test())
