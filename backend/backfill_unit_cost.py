"""
Script para fazer backfill de unit_cost em sale_items existentes.
Usa sale_sources JSON para calcular custo médio ponderado.
"""
import asyncio
from decimal import Decimal
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.sale import SaleItem


async def backfill_unit_cost():
    """Preenche unit_cost em sale_items existentes usando sale_sources."""
    
    # Criar engine e sessão
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as db:
        try:
            # Buscar todos os sale_items com unit_cost = 0 (default)
            query = select(SaleItem).where(SaleItem.unit_cost == 0)
            result = await db.execute(query)
            sale_items = result.scalars().all()
            
            print(f"\n📦 Encontrados {len(sale_items)} sale_items com unit_cost = 0")
            
            updated_count = 0
            failed_count = 0
            
            for sale_item in sale_items:
                try:
                    # Se tem sale_sources, calcular unit_cost a partir delas
                    if sale_item.sale_sources and 'sources' in sale_item.sale_sources:
                        sources = sale_item.sale_sources['sources']
                        
                        if sources:
                            # Calcular custo total: SUM(quantity_taken * unit_cost)
                            total_cost = sum(
                                Decimal(str(source['quantity_taken'])) * Decimal(str(source['unit_cost']))
                                for source in sources
                            )
                            
                            # Calcular custo unitário médio ponderado
                            unit_cost = total_cost / sale_item.quantity if sale_item.quantity > 0 else Decimal('0')
                            
                            # Atualizar
                            sale_item.unit_cost = float(unit_cost)
                            updated_count += 1
                            
                            print(f"  ✅ SaleItem ID {sale_item.id}: unit_cost = R$ {unit_cost:.2f} (de {len(sources)} fontes)")
                        else:
                            print(f"  ⚠️  SaleItem ID {sale_item.id}: sale_sources vazio, mantendo unit_cost = 0")
                            failed_count += 1
                    else:
                        print(f"  ⚠️  SaleItem ID {sale_item.id}: sem sale_sources, mantendo unit_cost = 0")
                        failed_count += 1
                        
                except Exception as e:
                    print(f"  ❌ Erro ao processar SaleItem ID {sale_item.id}: {e}")
                    failed_count += 1
            
            # Commit das alterações
            await db.commit()
            
            print(f"\n✅ Backfill concluído!")
            print(f"   - {updated_count} sale_items atualizados")
            print(f"   - {failed_count} sale_items mantidos com unit_cost = 0")
            
        except Exception as e:
            print(f"\n❌ Erro durante backfill: {e}")
            await db.rollback()
            raise
        finally:
            await engine.dispose()


if __name__ == "__main__":
    asyncio.run(backfill_unit_cost())
