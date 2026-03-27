"""
Fix: preenche variant_id nos EntryItems que têm product_id mas variant_id = NULL.

Causa: add_item_to_entry não setava variant_id → products_grouped calculava
       total_stock = 0, pois filtra por ei.variant_id = v.id.

Execução: python fix_entry_items_variant_id.py
"""
import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker


async def fix():
    async with async_session_maker() as db:
        # Buscar entry_items com product_id mas sem variant_id
        result = await db.execute(text("""
            SELECT ei.id, ei.product_id, ei.tenant_id
            FROM entry_items ei
            WHERE ei.variant_id IS NULL
              AND ei.product_id IS NOT NULL
              AND ei.is_active = 1
        """))
        rows = result.fetchall()

        if not rows:
            print("OK: Nenhum entry_item com variant_id NULL encontrado.")
            return

        print(f"Fix: {len(rows)} entry_item(s) para corrigir...")

        fixed = 0
        skipped = 0
        for row in rows:
            ei_id, product_id, tenant_id = row

            # Buscar variante padrão do produto
            variant_result = await db.execute(text("""
                SELECT id FROM product_variants
                WHERE product_id = :pid AND is_active = 1
                LIMIT 1
            """), {"pid": product_id})
            variant = variant_result.fetchone()

            if not variant:
                print(f"  SKIP entry_item {ei_id}: produto {product_id} sem variante ativa")
                skipped += 1
                continue

            variant_id = variant[0]
            await db.execute(text("""
                UPDATE entry_items SET variant_id = :vid WHERE id = :eid
            """), {"vid": variant_id, "eid": ei_id})

            print(f"  OK entry_item {ei_id}: product_id={product_id} -> variant_id={variant_id}")
            fixed += 1

        await db.commit()
        print(f"\nConcluido: {fixed} corrigidos, {skipped} pulados.")


if __name__ == "__main__":
    asyncio.run(fix())
