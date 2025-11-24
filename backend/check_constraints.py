"""
Check category constraints and existing data
"""
import asyncio
from app.core.database import get_db
from sqlalchemy import text

async def check_constraints():
    async for db in get_db():
        # Check constraint on categories table
        result = await db.execute(text("""
            SELECT 
                conname AS constraint_name,
                contype AS constraint_type,
                pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            JOIN pg_class cl ON cl.oid = c.conrelid
            WHERE cl.relname = 'categories'
            AND n.nspname = 'public'
            ORDER BY conname
        """))
        
        print("Constraints na tabela 'categories':")
        for row in result:
            print(f"  {row[0]} ({row[1]}): {row[2]}")
        
        # Check if there are categories with tenant_id=3
        result2 = await db.execute(text("""
            SELECT id, name, slug, tenant_id 
            FROM categories 
            WHERE tenant_id = 3
        """))
        
        print("\nCategorias com tenant_id=3:")
        rows = result2.fetchall()
        if rows:
            for r in rows:
                print(f"  ID: {r[0]}, Name: {r[1]}, Slug: {r[2]}, Tenant: {r[3]}")
        else:
            print("  Nenhuma encontrada")
        
        # Check for duplicate slugs with tenant_id=3
        result3 = await db.execute(text("""
            SELECT slug, tenant_id, COUNT(*) as count
            FROM categories
            WHERE tenant_id IN (0, 3)
            GROUP BY slug, tenant_id
            HAVING COUNT(*) > 1
        """))
        
        print("\nSlugs duplicados:")
        rows3 = result3.fetchall()
        if rows3:
            for r in rows3:
                print(f"  Slug: {r[0]}, Tenant: {r[1]}, Count: {r[2]}")
        else:
            print("  Nenhum encontrado")
        
        break

if __name__ == "__main__":
    asyncio.run(check_constraints())
