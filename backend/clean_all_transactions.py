"""
Limpeza completa do banco — remove todas as transações de teste e corrige inconsistências.

O que REMOVE (hard delete):
  - sales, sale_items
  - sale_returns, return_items
  - conditional_shipments, conditional_shipment_items
  - inventory_movements

O que RESTAURA:
  - entry_items.quantity_remaining = quantity_received  (estoque devolvido ao estado original)
  - inventory.quantity = soma FIFO dos entry_items ativos

O que MANTÉM:
  - users, stores, categories
  - products, product_variants
  - stock_entries, entry_items (com estoque restaurado)
  - customers
"""
import asyncio
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from sqlalchemy import text, update, select, func
from app.core.database import async_session_maker
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.stock_entry import StockEntry


async def clean():
    async with async_session_maker() as db:
        print("=" * 60)
        print("  LIMPEZA COMPLETA DO BANCO")
        print("=" * 60)

        # ── 1. Remover return_items ──────────────────────────────────
        r = await db.execute(text("DELETE FROM return_items"))
        print(f"[1/9] return_items removidos:             {r.rowcount}")

        # ── 2. Remover sale_returns ──────────────────────────────────
        r = await db.execute(text("DELETE FROM sale_returns"))
        print(f"[2/9] sale_returns removidos:             {r.rowcount}")

        # ── 3. Remover sale_items ────────────────────────────────────
        r = await db.execute(text("DELETE FROM sale_items"))
        print(f"[3/9] sale_items removidos:               {r.rowcount}")

        # ── 4. Remover sales ─────────────────────────────────────────
        r = await db.execute(text("DELETE FROM sales"))
        print(f"[4/9] sales removidos:                    {r.rowcount}")

        # ── 5. Remover conditional_shipment_items ────────────────────
        r = await db.execute(text("DELETE FROM conditional_shipment_items"))
        print(f"[5/9] conditional_shipment_items removidos: {r.rowcount}")

        # ── 6. Remover conditional_shipments ─────────────────────────
        r = await db.execute(text("DELETE FROM conditional_shipments"))
        print(f"[6/9] conditional_shipments removidos:    {r.rowcount}")

        # ── 7. Remover inventory_movements ───────────────────────────
        r = await db.execute(text("DELETE FROM inventory_movements"))
        print(f"[7/9] inventory_movements removidos:      {r.rowcount}")

        # ── 8. Restaurar quantity_remaining de todos entry_items ─────
        r = await db.execute(
            update(EntryItem)
            .where(EntryItem.is_active == True)
            .values(quantity_remaining=EntryItem.quantity_received)
        )
        print(f"[8/9] entry_items restaurados (qty_remaining=qty_received): {r.rowcount}")

        await db.commit()

        # ── 9. Reconstruir inventory.quantity a partir do FIFO ───────
        print("[9/9] Reconstruindo inventory a partir do FIFO...")

        # Somar qty_remaining por product_id
        fifo_stmt = (
            select(
                EntryItem.product_id,
                func.sum(EntryItem.quantity_remaining).label("qty")
            )
            .join(StockEntry, EntryItem.entry_id == StockEntry.id)
            .where(
                EntryItem.is_active == True,
                EntryItem.product_id.isnot(None),
                StockEntry.is_active == True,
            )
            .group_by(EntryItem.product_id)
        )
        rows = (await db.execute(fifo_stmt)).all()
        fifo_map = {r[0]: int(r[1]) for r in rows}

        inv_rows = (await db.execute(select(Inventory))).scalars().all()
        updated = 0
        for inv in inv_rows:
            correct = fifo_map.get(inv.product_id, 0)
            if inv.quantity != correct:
                inv.quantity = correct
                updated += 1

        await db.commit()
        print(f"         Inventários atualizados: {updated} de {len(inv_rows)}")

        # ── Relatório de orphans ─────────────────────────────────────
        print()
        print("── Verificando orfãos restantes ──")

        # entry_items sem stock_entry ativo
        orphan_ei = await db.execute(text("""
            SELECT COUNT(*) FROM entry_items ei
            LEFT JOIN stock_entries se ON se.id = ei.entry_id
            WHERE (se.id IS NULL OR se.is_active = 0) AND ei.is_active = 1
        """))
        print(f"  entry_items sem entry ativa:    {orphan_ei.scalar()}")

        # inventory sem produto ativo
        orphan_inv = await db.execute(text("""
            SELECT COUNT(*) FROM inventory i
            LEFT JOIN products p ON p.id = i.product_id
            WHERE (p.id IS NULL OR p.is_active = 0) AND i.is_active = 1
        """))
        n_orphan_inv = orphan_inv.scalar()
        print(f"  inventory sem produto ativo:    {n_orphan_inv}")

        # Soft-delete inventory orfãos
        if n_orphan_inv > 0:
            await db.execute(text("""
                UPDATE inventory SET is_active = 0
                WHERE is_active = 1 AND product_id IN (
                    SELECT i.product_id FROM inventory i
                    LEFT JOIN products p ON p.id = i.product_id
                    WHERE p.id IS NULL OR p.is_active = 0
                )
            """))
            await db.commit()
            print(f"  -> {n_orphan_inv} inventory orfãos removidos (soft delete)")

        # product_variants sem produto
        orphan_pv = await db.execute(text("""
            SELECT COUNT(*) FROM product_variants pv
            LEFT JOIN products p ON p.id = pv.product_id
            WHERE (p.id IS NULL OR p.is_active = 0) AND pv.is_active = 1
        """))
        print(f"  product_variants sem produto:   {orphan_pv.scalar()}")

        print()
        print("=" * 60)
        print("  BANCO LIMPO COM SUCESSO")
        print("=" * 60)
        print("  Mantido: users, stores, categories, products,")
        print("           product_variants, customers, stock_entries,")
        print("           entry_items (estoque restaurado)")
        print("  Removido: todas as vendas, devoluções, envios condicionais")


if __name__ == '__main__':
    asyncio.run(clean())
