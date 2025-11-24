"""Check users in PostgreSQL database"""
import asyncio
from sqlalchemy import text
from app.core.database import get_db

async def check_users():
    async for db in get_db():
        result = await db.execute(text(
            "SELECT id, email, full_name, role, tenant_id, is_active FROM users ORDER BY created_at DESC"
        ))
        users = result.fetchall()
        
        if not users:
            print("❌ Nenhum usuário encontrado")
        else:
            print(f"✅ Total de usuários: {len(users)}\n")
            for user in users:
                print(f"ID: {user[0]}")
                print(f"Email: {user[1]}")
                print(f"Nome: {user[2]}")
                print(f"Role: {user[3]}")
                print(f"Tenant ID: {user[4]}")
                print(f"Ativo: {user[5]}")
                print("-" * 60)
        
        # Check stores
        result = await db.execute(text(
            "SELECT id, name, tenant_id FROM stores ORDER BY created_at DESC LIMIT 5"
        ))
        stores = result.fetchall()
        
        if stores:
            print(f"\n📦 Últimas stores criadas: {len(stores)}")
            for store in stores:
                print(f"  Store ID: {store[0]}, Nome: {store[1]}, Tenant: {store[2]}")
        
        break

if __name__ == "__main__":
    asyncio.run(check_users())
