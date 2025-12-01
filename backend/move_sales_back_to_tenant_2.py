"""
Move todas as vendas e itens de volta para tenant_id=2.
"""
import asyncio
from sqlalchemy import update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.sale import Sale, SaleItem


async def move_sales_to_tenant_2():
    """Move vendas de volta para tenant_id=2."""
    
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as db:
        try:
            # Atualizar vendas
            await db.execute(
                update(Sale).values(tenant_id=2)
            )
            
            # Atualizar sale_items
            await db.execute(
                update(SaleItem).values(tenant_id=2)
            )
            
            await db.commit()
            print("\n✅ Todas as vendas e items movidos de volta para tenant_id=2!")
            
        except Exception as e:
            print(f"\n❌ Erro: {e}")
            await db.rollback()
        finally:
            await engine.dispose()


if __name__ == "__main__":
    asyncio.run(move_sales_to_tenant_2())
