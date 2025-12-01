"""
Script para recalcular o total_cost de todas as entradas de estoque.
Necessário após correção do eager loading de entry_items.
"""
import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem
from sqlalchemy.orm import selectinload


async def recalculate_all_entry_totals():
    """Recalcula o total_cost de todas as entradas."""
    async with async_session_maker() as db:
        # Buscar todas as entradas com seus items
        result = await db.execute(
            select(StockEntry)
            .options(selectinload(StockEntry.entry_items))
            .where(StockEntry.is_active == True)
        )
        entries = result.scalars().all()

        print(f'Encontradas {len(entries)} entradas para recalcular\n')

        updated_count = 0
        for entry in entries:
            old_total = entry.total_cost

            # Recalcular usando o método do model
            entry.update_total_cost()
            new_total = entry.total_cost

            if old_total != new_total:
                print(f'Entrada {entry.entry_code}:')
                print(f'  Total antigo: R$ {old_total:,.2f}')
                print(f'  Total novo: R$ {new_total:,.2f}')
                print(f'  Items: {len(entry.entry_items)}')
                print('-' * 50)
                updated_count += 1

        # Commitar mudanças
        await db.commit()

        print(f'\n✅ Recálculo concluído!')
        print(f'Total de entradas atualizadas: {updated_count}')
        print(f'Total de entradas sem mudanças: {len(entries) - updated_count}')


if __name__ == '__main__':
    asyncio.run(recalculate_all_entry_totals())
