"""
Script temporário para verificar stores no banco.
"""
import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker

async def check_stores():
    async with async_session_maker() as db:
        result = await db.execute(text('SELECT id, name, slug, is_default FROM stores'))
        stores = result.fetchall()
        if stores:
            print(f"✅ {len(stores)} store(s) encontrada(s):")
            for store in stores:
                print(f"  - ID: {store[0]}, Name: {store[1]}, Slug: {store[2]}, Default: {store[3]}")
        else:
            print("⚠️  Nenhuma store encontrada. Criando store default...")
            await db.execute(text(
                "INSERT INTO stores (name, slug, is_default, is_active) "
                "VALUES ('Default Store', 'default', TRUE, TRUE)"
            ))
            await db.commit()
            print("✅ Store default criada.")

if __name__ == "__main__":
    asyncio.run(check_stores())
