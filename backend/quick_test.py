"""Quick test without logs"""
import asyncio
import sys
import logging

# Disable SQLAlchemy logs
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

from app.core.database import get_db
from app.services.signup_service import SignupService
from app.schemas.signup import SignupRequest

async def test():
    data = SignupRequest(
        full_name="Victor Santos Cardoso",
        email="vacardoso2005@gmail.com",
        password="SecurePass123",
        phone="(34) 98831-7323",
        store_name="Store Fitness",
        plan="trial"
    )
    
    async for db in get_db():
        try:
            result = await SignupService(db).signup(data)
            print(f"\n✅ SUCESSO!")
            print(f"  Store ID: {result.store_id} - {result.store_name}")
            print(f"  User ID: {result.user_id} - {result.user_email}")
            print(f"  Plano: {result.subscription_plan} (Trial: {result.is_trial})")
            print(f"  Trial dias: {result.trial_days_remaining}")
            return True
        except ValueError as e:
            print(f"\n❌ ERRO: {e}")
            return False
        finally:
            break

result = asyncio.run(test())
sys.exit(0 if result else 1)
