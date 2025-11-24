"""
Debug script to test /auth/me endpoint and identify the issue.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.models.user import User
from app.models.store import Store

# Database URL - Use the actual PostgreSQL database
DATABASE_URL = "postgresql+asyncpg://fitness:fitness123@localhost:5432/fitness_store"

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def debug_auth_me():
    """Test the /auth/me logic in isolation."""
    print("DEBUG: Testing /auth/me endpoint logic\n")

    async with AsyncSessionLocal() as db:
        try:
            # 1. Get the most recent user (should be the one from signup)
            print("1. Fetching latest user...")
            result = await db.execute(
                select(User).order_by(User.id.desc()).limit(1)
            )
            user = result.scalar_one_or_none()

            if not user:
                print("ERROR: No users found in database")
                return

            print(f"SUCCESS: Found user: {user.email}")
            print(f"   - ID: {user.id}")
            print(f"   - Full name: {user.full_name}")
            print(f"   - Role: {user.role}")
            print(f"   - Tenant ID: {user.tenant_id}")
            print(f"   - Is Active: {user.is_active}")
            print()

            # 2. Check if tenant_id is set
            if not user.tenant_id:
                print("WARNING: User has no tenant_id - store_name will be None")
                return

            print(f"2. User has tenant_id={user.tenant_id}, fetching store...")

            # 3. Try to fetch store name (exact same query as endpoint)
            try:
                result = await db.execute(
                    select(Store.name).where(Store.id == user.tenant_id)
                )
                store_name = result.scalar_one_or_none()

                if store_name:
                    print(f"SUCCESS: Store found: {store_name}")
                else:
                    print(f"WARNING: No store found with id={user.tenant_id}")

                    # Check if store exists at all
                    result = await db.execute(
                        select(Store).where(Store.id == user.tenant_id)
                    )
                    store = result.scalar_one_or_none()

                    if store:
                        print(f"   Store exists but query returned None")
                        print(f"   Store details: id={store.id}, name={store.name}, is_active={store.is_active}")
                    else:
                        print(f"   Store with id={user.tenant_id} does NOT exist in database")

                        # List all stores
                        result = await db.execute(select(Store))
                        stores = result.scalars().all()
                        print(f"\n   Available stores: {len(stores)}")
                        for s in stores:
                            print(f"      - Store ID {s.id}: {s.name} (active={s.is_active})")

            except Exception as e:
                print(f"ERROR: Error querying store: {e}")
                print(f"   Exception type: {type(e).__name__}")
                import traceback
                traceback.print_exc()
                return

            # 4. Try to construct UserResponse dict (as endpoint does)
            print("\n3. Constructing UserResponse dict...")
            try:
                user_dict = {
                    "id": user.id,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                    "phone": user.phone,
                    "is_active": user.is_active,
                    "created_at": user.created_at,
                    "updated_at": user.updated_at,
                    "tenant_id": user.tenant_id,
                    "store_name": store_name
                }
                print(f"SUCCESS: Dict created successfully:")
                for key, val in user_dict.items():
                    print(f"   {key}: {val}")

                # 5. Try to create Pydantic model
                print("\n4. Creating UserResponse Pydantic model...")
                from app.schemas.user import UserResponse

                user_response = UserResponse(**user_dict)
                print(f"SUCCESS: UserResponse created successfully")
                print(f"   Response JSON: {user_response.model_dump()}")

            except Exception as e:
                print(f"ERROR: Error creating UserResponse: {e}")
                print(f"   Exception type: {type(e).__name__}")
                import traceback
                traceback.print_exc()

        except Exception as e:
            print(f"ERROR: Unexpected error: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    print("=" * 60)
    print("DEBUG SCRIPT: /auth/me endpoint")
    print("=" * 60)
    asyncio.run(debug_auth_me())
    print("\n" + "=" * 60)
