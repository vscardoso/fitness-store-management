"""
Script para recalcular total_cost de todas as entradas de estoque.
Útil quando entradas antigas não têm o total_cost calculado corretamente.
"""

import asyncio
import sys
from pathlib import Path

# Adicionar o diretório backend ao path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.stock_entry import StockEntry


async def recalculate_all_entries():
    """Recalcula total_cost de todas as entradas."""
    async with async_session_maker() as db:
        try:
            # Buscar todas as entradas ativas
            stmt = select(StockEntry).where(StockEntry.is_active == True)
            result = await db.execute(stmt)
            entries = result.scalars().all()
            
            print(f"📦 Encontradas {len(entries)} entradas para recalcular")
            
            updated_count = 0
            for entry in entries:
                old_cost = entry.total_cost
                
                # Recalcular usando o método do modelo
                entry.update_total_cost()
                new_cost = entry.total_cost
                
                if old_cost != new_cost:
                    print(f"✅ Entrada {entry.entry_code}: {old_cost} → {new_cost}")
                    updated_count += 1
                else:
                    print(f"⚪ Entrada {entry.entry_code}: {old_cost} (sem mudança)")
            
            await db.commit()
            
            print(f"\n✅ Total atualizado: {updated_count}/{len(entries)} entradas")
            print("🎯 Script concluído com sucesso!")
            
        except Exception as e:
            await db.rollback()
            print(f"❌ Erro: {str(e)}")
            raise


if __name__ == "__main__":
    print("🔄 Iniciando recálculo de total_cost das entradas...")
    asyncio.run(recalculate_all_entries())
