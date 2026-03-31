"""
Fix: preenche tenant_id nos EntryItems que têm tenant_id = NULL.

Causa: product_service.py ao criar estoque inicial não passava tenant_id
       para o EntryItem. Isso fazia o FIFO check_availability retornar 0
       mesmo quando build_product_response mostrava estoque disponível,
       pois check_availability filtra por tenant_id.

Execução: python fix_entry_items_tenant_id.py
"""
import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker


async def fix():
    async with async_session_maker() as db:
        # Buscar entry_items sem tenant_id mas cuja stock_entry tem tenant_id
        result = await db.execute(text("""
            SELECT ei.id, se.tenant_id
            FROM entry_items ei
            JOIN stock_entries se ON se.id = ei.entry_id
            WHERE ei.tenant_id IS NULL
              AND se.tenant_id IS NOT NULL
              AND ei.is_active = 1
        """))
        rows = result.fetchall()

        if not rows:
            print("OK: Nenhum entry_item com tenant_id NULL encontrado.")
            return

        print(f"Fix: {len(rows)} entry_item(s) para corrigir...")

        fixed = 0
        for row in rows:
            ei_id, tenant_id = row

            await db.execute(text("""
                UPDATE entry_items SET tenant_id = :tid WHERE id = :eid
            """), {"tid": tenant_id, "eid": ei_id})

            print(f"  OK entry_item {ei_id}: tenant_id={tenant_id}")
            fixed += 1

        await db.commit()
        print(f"\nConcluido: {fixed} entry_item(s) corrigidos.")


if __name__ == "__main__":
    asyncio.run(fix())
