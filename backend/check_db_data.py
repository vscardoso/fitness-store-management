"""
Check stores and categories in database
"""
import asyncio
from app.core.database import get_db
from sqlalchemy import text

async def check_data():
    async for db in get_db():
        # Check stores
        result = await db.execute(
            text("SELECT id, name, slug, tenant_id FROM stores WHERE slug LIKE '%fitness%' ORDER BY id")
        )
        rows = result.fetchall()
        print('Stores existentes:')
        for r in rows:
            print(f'  ID: {r[0]}, Name: {r[1]}, Slug: {r[2]}, Tenant: {r[3]}')
        
        # Check template categories
        result2 = await db.execute(
            text("SELECT id, name, description FROM categories WHERE tenant_id = 0 LIMIT 6")
        )
        rows2 = result2.fetchall()
        print('\nCategorias template (tenant_id=0):')
        for r in rows2:
            print(f'  ID: {r[0]}, Name: {r[1]}, Description: {r[2]}')
        
        break

if __name__ == "__main__":
    asyncio.run(check_data())
