"""Check categories tenant_id"""
import asyncio
from sqlalchemy import text
from app.core.database import get_db

async def check():
    async for db in get_db():
        result = await db.execute(text(
            "SELECT id, name, slug, tenant_id FROM categories ORDER BY id LIMIT 10"
        ))
        cats = result.fetchall()
        
        if not cats:
            print("❌ No categories found")
        else:
            print(f"✅ Total categories: {len(cats)}\n")
            for cat in cats:
                print(f"ID={cat[0]}, Name={cat[1]}, Slug={cat[2]}, Tenant={cat[3]}")
        break

asyncio.run(check())
