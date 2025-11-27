"""
Script para restaurar produtos e entradas deletados.

Restaura (is_active = True):
- Todos os produtos
- Todas as entradas de estoque
- Todos os entry_items
- Todos os inventarios
"""
import asyncio
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from sqlalchemy import update
from app.core.database import async_session_maker
from app.models.product import Product
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory


async def restore_all():
    async with async_session_maker() as db:
        try:
            print('RESTAURANDO TODOS OS PRODUTOS E ENTRADAS...')
            print('=' * 80)

            # 1. Restaurar todos produtos
            result1 = await db.execute(
                update(Product)
                .where(Product.is_active == False)
                .values(is_active=True)
            )
            products_restored = result1.rowcount
            print(f'[1/4] Produtos restaurados: {products_restored}')

            # 2. Restaurar todos inventarios
            result2 = await db.execute(
                update(Inventory)
                .where(Inventory.is_active == False)
                .values(is_active=True)
            )
            inventories_restored = result2.rowcount
            print(f'[2/4] Inventarios restaurados: {inventories_restored}')

            # 3. Restaurar todas entradas
            result3 = await db.execute(
                update(StockEntry)
                .where(StockEntry.is_active == False)
                .values(is_active=True)
            )
            entries_restored = result3.rowcount
            print(f'[3/4] Entradas restauradas: {entries_restored}')

            # 4. Restaurar todos entry_items
            result4 = await db.execute(
                update(EntryItem)
                .where(EntryItem.is_active == False)
                .values(is_active=True)
            )
            entry_items_restored = result4.rowcount
            print(f'[4/4] Entry_items restaurados: {entry_items_restored}')

            await db.commit()

            print()
            print('=' * 80)
            print('[OK] Todos os dados foram restaurados!')

        except Exception as e:
            print(f'[ERRO] {str(e)}')
            await db.rollback()
            raise


if __name__ == '__main__':
    asyncio.run(restore_all())
