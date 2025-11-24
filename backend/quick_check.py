"""Quick check for missing constraint"""
import asyncio
from sqlalchemy import text
from app.core.database import get_db

async def check():
    async for db in get_db():
        result = await db.execute(
            text("SELECT conname FROM pg_constraint WHERE conname LIKE '%tenant_slug%'")
        )
        constraints = [r[0] for r in result]
        print('Constraints com tenant_slug:', constraints)
        
        # Check actual error
        try:
            await db.execute(text("""
                INSERT INTO categories (name, description, slug, parent_id, is_active, tenant_id)
                VALUES ('Test', NULL, 'suplementos', NULL, true, 3)
            """))
            await db.commit()
            print("✅ Insert successful - no constraint violation")
        except Exception as e:
            await db.rollback()
            print(f"❌ Error: {type(e).__name__}: {e}")
        
        break

asyncio.run(check())
