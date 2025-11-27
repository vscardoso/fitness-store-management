import requests

# Login
login = requests.post('http://localhost:8000/api/v1/auth/login', json={
    'email': 'admin@fitness.com',
    'password': 'admin123'
})
token = login.json()['access_token']

# Get entry
response = requests.get(
    'http://localhost:8000/api/v1/stock-entries/1',
    headers={'Authorization': f'Bearer {token}'}
)

print(f'Status: {response.status_code}')
if response.status_code == 200:
    data = response.json()
    print(f'\nSuccess! Entry {data["id"]} retrieved:')
    print(f'  Entry Code: {data["entry_code"]}')
    print(f'  Total Items: {data.get("total_items", 0)}')
    print(f'  Total Cost: {data.get("total_cost", 0)}')
    print(f'  Number of entry_items: {len(data.get("entry_items", []))}')
else:
    print(f'Error: {response.text[:500]}')
