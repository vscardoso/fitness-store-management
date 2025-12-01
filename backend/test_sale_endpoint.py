"""
Script para testar o endpoint POST /api/v1/sales/ e capturar erro de validação.
"""
import asyncio
import httpx
from decimal import Decimal
import json

async def test_create_sale():
    # Primeiro fazer login
    login_url = "http://localhost:8000/api/v1/auth/login"
    login_data = {
        "email": "admin@fitness.com",
        "password": "admin123"
    }

    async with httpx.AsyncClient() as client:
        # Login
        print("=== FAZENDO LOGIN ===")
        login_response = await client.post(login_url, json=login_data)
        print(f"Status: {login_response.status_code}")

        if login_response.status_code != 200:
            print(f"Erro no login: {login_response.text}")
            return

        token_data = login_response.json()
        token = token_data.get("access_token")
        print(f"Token obtido: {token[:50]}...")

        # Criar venda
        print("\n=== CRIANDO VENDA ===")
        sale_url = "http://localhost:8000/api/v1/sales/"
        headers = {"Authorization": f"Bearer {token}"}

        sale_data = {
            "customer_id": 3,
            "payment_method": "pix",
            "discount_amount": 0,
            "tax_amount": 0,
            "notes": "Venda de teste FIFO",
            "items": [
                {
                    "product_id": 5,
                    "quantity": 1,
                    "unit_price": 100.0,
                    "discount_amount": 0
                }
            ],
            "payments": [
                {
                    "amount": 100.0,
                    "payment_method": "pix"
                }
            ]
        }

        print(f"Payload: {json.dumps(sale_data, indent=2)}")

        try:
            sale_response = await client.post(sale_url, json=sale_data, headers=headers)
            print(f"\nStatus: {sale_response.status_code}")
            print(f"Headers: {dict(sale_response.headers)}")

            if sale_response.status_code == 201:
                print("\n✅ SUCESSO!")
                print(json.dumps(sale_response.json(), indent=2))
            else:
                print("\n❌ ERRO!")
                print(f"Resposta completa: {sale_response.text}")

                # Tentar parsear JSON de erro
                try:
                    error_data = sale_response.json()
                    print("\nErro JSON:")
                    print(json.dumps(error_data, indent=2))
                except:
                    pass

        except Exception as e:
            print(f"\n❌ EXCEÇÃO: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_create_sale())
