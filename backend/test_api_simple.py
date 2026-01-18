"""Script simples para testar endpoint de produtos"""
import requests

# Testar login primeiro
print("=== TESTANDO LOGIN ===")
login_url = "http://localhost:8000/api/v1/auth/login"
login_data = {
    "email": "admin@fitness.com",
    "password": "admin123"
}

try:
    login_response = requests.post(login_url, json=login_data, timeout=5)
    print(f"Status: {login_response.status_code}")
    print(f"Response: {login_response.json()}")
    
    # Tentar diferentes chaves para o token
    login_json = login_response.json()
    token = None
    
    if 'access_token' in login_json:
        token = login_json['access_token']
    elif 'token' in login_json:
        token = login_json['token']
    elif 'data' in login_json and isinstance(login_json['data'], dict):
        if 'access_token' in login_json['data']:
            token = login_json['data']['access_token']
        elif 'token' in login_json['data']:
            token = login_json['data']['token']
    
    if not token:
        print("❌ Token não encontrado na resposta")
        print(f"Chaves disponíveis: {list(login_json.keys())}")
        exit(1)
    
    print(f"✅ Token obtido: {token[:50]}...")
    
    # Testar produtos com estoque
    print("\n=== TESTANDO PRODUTOS COM ESTOQUE ===")
    products_url = "http://localhost:8000/api/v1/products/"
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "has_stock": "true",
        "limit": 20,
        "skip": 0
    }
    
    products_response = requests.get(products_url, headers=headers, params=params, timeout=5)
    print(f"Status: {products_response.status_code}")
    
    products = products_response.json()
    print(f"✅ Produtos retornados: {len(products)}")
    
    for p in products:
        print(f"  - ID: {p.get('id')} | Nome: {p.get('name')} | Estoque: {p.get('current_stock')}")

except requests.exceptions.ConnectionError:
    print("❌ Não foi possível conectar ao servidor. Certifique-se de que o backend está rodando em http://localhost:8000")
except requests.exceptions.Timeout:
    print("❌ Timeout ao conectar ao servidor")
except Exception as e:
    print(f"❌ Erro: {str(e)}")
    import traceback
    traceback.print_exc()
