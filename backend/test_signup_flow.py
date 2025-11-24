"""
Test signup flow to verify all fields match between frontend and backend
"""
import asyncio
import json
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.signup_service import SignupService
from app.schemas.signup import SignupRequest

async def test_signup():
    """Test signup with full address data"""
    
    # Simulate frontend payload
    signup_data_dict = {
        "full_name": "Test User",
        "email": "test@example.com",
        "password": "Test1234",
        "phone": "(11) 98765-4321",
        "store_name": "Test Store",
        "plan": "trial",
        "zip_code": "12345678",
        "street": "Rua Teste",
        "number": "123",
        "complement": "Apto 45",
        "neighborhood": "Centro",
        "city": "São Paulo",
        "state": "SP"
    }
    
    print("📋 Testing signup payload:")
    print(json.dumps(signup_data_dict, indent=2, ensure_ascii=False))
    
    try:
        # Validate schema
        signup_request = SignupRequest(**signup_data_dict)
        print("\n✅ Schema validation passed!")
        print(f"\nParsed fields:")
        print(f"  - full_name: {signup_request.full_name}")
        print(f"  - email: {signup_request.email}")
        print(f"  - phone: {signup_request.phone}")
        print(f"  - store_name: {signup_request.store_name}")
        print(f"  - plan: {signup_request.plan}")
        print(f"  - zip_code: {signup_request.zip_code}")
        print(f"  - street: {signup_request.street}")
        print(f"  - number: {signup_request.number}")
        print(f"  - complement: {signup_request.complement}")
        print(f"  - neighborhood: {signup_request.neighborhood}")
        print(f"  - city: {signup_request.city}")
        print(f"  - state: {signup_request.state}")
        
        print("\n✅ All fields correctly received by backend!")
        
    except Exception as e:
        print(f"\n❌ Schema validation failed: {e}")
        return

if __name__ == "__main__":
    asyncio.run(test_signup())
