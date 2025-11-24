"""
Test the /auth/me endpoint directly with httpx to verify the fix.
"""
import asyncio
import httpx


async def test_auth_me():
    """Test /auth/me endpoint after signup."""
    base_url = "http://localhost:8000/api/v1"

    print("=" * 60)
    print("TEST: /auth/me endpoint after signup")
    print("=" * 60)

    # Step 1: Signup (create new user)
    print("\n1. Creating new test account...")
    timestamp = int(asyncio.get_event_loop().time())
    signup_data = {
        "full_name": "Test Auth Me User",
        "email": f"test.auth.me.{timestamp}@example.com",
        "password": "Test@12345",
        "phone": "(99) 99999-9999",
        "store_name": "Test Auth Me Store",
        "store_slug": f"test-auth-me-{timestamp}",
        "plan": "trial"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Signup
            response = await client.post(f"{base_url}/auth/signup", json=signup_data)
            print(f"   Status: {response.status_code}")

            if response.status_code != 201:
                print(f"   ERROR: Signup failed")
                print(f"   Response: {response.text}")
                return

            data = response.json()
            token = data.get("access_token")
            user_email = data.get("user_email")

            print(f"   SUCCESS: Account created")
            print(f"   Email: {user_email}")
            print(f"   Token: {token[:50]}...")

            # Step 2: Test /auth/me
            print("\n2. Testing /auth/me endpoint...")
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get(f"{base_url}/auth/me", headers=headers)
            print(f"   Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                print(f"   SUCCESS: /auth/me working!")
                print(f"   User ID: {data.get('id')}")
                print(f"   Email: {data.get('email')}")
                print(f"   Full Name: {data.get('full_name')}")
                print(f"   Tenant ID: {data.get('tenant_id')}")
                print(f"   Store Name: {data.get('store_name')}")
                print(f"   Role: {data.get('role')}")
            else:
                print(f"   ERROR: /auth/me failed")
                print(f"   Response: {response.text}")

        except Exception as e:
            print(f"   ERROR: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60)


if __name__ == "__main__":
    asyncio.run(test_auth_me())
