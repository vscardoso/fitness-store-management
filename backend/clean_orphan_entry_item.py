"""
Script para limpar entry_item órfão com tenant_id incorreto.
"""

import asyncio
from sqlalchemy import update
from app.core.database import async_session_maker
from app.models.entry_item import EntryItem


async def clean_orphan():
    """Desativa entry_items órfãos."""
    async with async_session_maker() as db:
        # Desativar TODOS os entry_items ativos (independente do tenant)
        result = await db.execute(
            update(EntryItem)
            .where(EntryItem.is_active == True)
            .values(is_active=False, quantity_remaining=0)
        )
        
        updated = result.rowcount
        await db.commit()
        
        print(f"✅ {updated} entry_item(s) desativado(s)")


if __name__ == "__main__":
    asyncio.run(clean_orphan())
