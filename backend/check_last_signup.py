"""Check last signup"""
import asyncio
from sqlalchemy import text
from app.core.database import get_db

async def check():
    async for db in get_db():
        # Check stores
        result = await db.execute(text("""
            SELECT id, name, slug, tenant_id, created_at 
            FROM stores 
            WHERE slug LIKE '%fitness%'
            ORDER BY id DESC LIMIT 1
        """))
        store = result.fetchone()
        
        if store:
            print(f"✅ Store criada:")
            print(f"  ID: {store[0]}, Name: {store[1]}, Slug: {store[2]}, Tenant: {store[3]}")
            print(f"  Criada em: {store[4]}")
            
            tenant_id = store[0]
            
            # Check categories
            result2 = await db.execute(text(f"""
                SELECT COUNT(*) FROM categories WHERE tenant_id = {tenant_id}
            """))
            cat_count = result2.scalar()
            print(f"\n✅ Categorias: {cat_count}")
            
            # Check products
            result3 = await db.execute(text(f"""
                SELECT COUNT(*) FROM products WHERE tenant_id = {tenant_id}
            """))
            prod_count = result3.scalar()
            print(f"✅ Produtos: {prod_count}")
            
            # Check user
            result4 = await db.execute(text(f"""
                SELECT id, email, full_name, role FROM users WHERE tenant_id = {tenant_id}
            """))
            user = result4.fetchone()
            if user:
                print(f"\n✅ Usuário:")
                print(f"  ID: {user[0]}, Email: {user[1]}, Nome: {user[2]}, Role: {user[3]}")
            
            # Check subscription
            result5 = await db.execute(text(f"""
                SELECT plan, status, is_trial, trial_ends_at::date 
                FROM subscriptions 
                WHERE tenant_id = {tenant_id}
            """))
            sub = result5.fetchone()
            if sub:
                print(f"\n✅ Assinatura:")
                print(f"  Plano: {sub[0]}, Status: {sub[1]}, Trial: {sub[2]}, Expira: {sub[3]}")
        else:
            print("❌ Nenhuma store encontrada")
        
        break

asyncio.run(check())
