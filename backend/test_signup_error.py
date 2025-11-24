"""
Test signup to capture exact error
"""
import asyncio
from app.core.database import get_db
from app.services.signup_service import SignupService
from app.schemas.signup import SignupRequest

async def test_signup_error():
    signup_data = SignupRequest(
        full_name="Victor Santos Cardoso",
        email="vacardoso2005@gmail.com",
        password="SecurePass123",
        phone="(34) 98831-7323",
        store_name="Store Fitness",
        plan="trial",
        zip_code="38400000",
        street="Av Brasil",
        number="1000",
        complement="Sala 101",
        neighborhood="Centro",
        city="Uberlândia",
        state="MG"
    )
    
    async for db in get_db():
        try:
            service = SignupService(db)
            result = await service.signup(signup_data)
            print("✅ Signup successful!")
            print(f"Store ID: {result.store_id}")
            print(f"Store Name: {result.store_name}")
            print(f"User ID: {result.user_id}")
        except ValueError as e:
            print(f"❌ ValueError: {e}")
        except Exception as e:
            print(f"❌ Exception: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            break

if __name__ == "__main__":
    asyncio.run(test_signup_error())
