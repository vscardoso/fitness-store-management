"""
Script para soft delete de todos os produtos e entradas SEM confirmação.

Remove (is_active = False):
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


async def delete_all():
    async with async_session_maker() as db:
        try:
            print('DELETANDO TODOS OS PRODUTOS E ENTRADAS...')
            print('=' * 80)

            # 1. Soft delete de todos entry_items
            result1 = await db.execute(
                update(EntryItem)
                .where(EntryItem.is_active == True)
                .values(is_active=False)
            )
            entry_items_deleted = result1.rowcount
            print(f'[1/4] Entry_items deletados: {entry_items_deleted}')

            # 2. Soft delete de todas entradas
            result2 = await db.execute(
                update(StockEntry)
                .where(StockEntry.is_active == True)
                .values(is_active=False)
            )
            entries_deleted = result2.rowcount
            print(f'[2/4] Entradas deletadas: {entries_deleted}')

            # 3. Soft delete de todos inventarios
            result3 = await db.execute(
                update(Inventory)
                .where(Inventory.is_active == True)
                .values(is_active=False)
            )
            inventories_deleted = result3.rowcount
            print(f'[3/4] Inventarios deletados: {inventories_deleted}')

            # 4. Soft delete de todos produtos
            result4 = await db.execute(
                update(Product)
                .where(Product.is_active == True)
                .values(is_active=False)
            )
            products_deleted = result4.rowcount
            print(f'[4/4] Produtos deletados: {products_deleted}')

            await db.commit()

            print()
            print('=' * 80)
            print('[OK] Todos os produtos e entradas foram deletados (soft delete)!')
            print()
            print('Sistema limpo. Pode comecar do zero.')
            print('Usuarios foram mantidos!')

        except Exception as e:
            print(f'[ERRO] {str(e)}')
            await db.rollback()
            raise


if __name__ == '__main__':
    print("""
    ==================================================================
                    DELETAR TODOS OS PRODUTOS E ENTRADAS
    ==================================================================

    Este script fara soft delete (is_active = False) de:
    - Todos os produtos
    - Todas as entradas de estoque
    - Todos os entry_items
    - Todos os inventarios

    Usuarios serao mantidos!

    """)

    asyncio.run(delete_all())
