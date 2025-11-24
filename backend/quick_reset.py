"""Reset database quickly."""
import asyncio
from sqlalchemy import text
from app.core.database import get_db

async def reset():
    async for db in get_db():
        await db.execute(text("TRUNCATE stores, users, subscriptions, products, categories, customers, sales, sale_items, payments, inventory, inventory_movements, stock_entries, entry_items, trips CASCADE"))
        await db.commit()
        print("DB limpo")
        break

asyncio.run(reset())
