import asyncio
from app.core.database import async_session_maker
from sqlalchemy import text

async def cleanup():
    async with async_session_maker() as db:
        r = await db.execute(text("UPDATE looks SET is_active=0 WHERE name LIKE 'TESTE%' AND id >= 14"))
        print(f"Looks de teste removidos: {r.rowcount}")
        r2 = await db.execute(text("UPDATE wishlists SET is_active=0 WHERE notes='Quero no M preto'"))
        print(f"Wishlists de teste removidos: {r2.rowcount}")
        await db.commit()
        print("Limpeza concluida.")

asyncio.run(cleanup())
