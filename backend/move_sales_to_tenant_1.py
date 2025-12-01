"""
Move todas as vendas e itens para tenant_id=1 (admin) para teste.
"""
import asyncio
from sqlalchemy import update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.sale import Sale, SaleItem


async def move_sales_to_tenant_1():
    """Move vendas para tenant_id=1."""
    
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as db:
        try:
            # Atualizar vendas
            await db.execute(
                update(Sale).values(tenant_id=1)
            )
            
            # Atualizar sale_items
            await db.execute(
                update(SaleItem).values(tenant_id=1)
            )
            
            await db.commit()
            print("\n✅ Todas as vendas e items movidos para tenant_id=1!")
            
        except Exception as e:
            print(f"\n❌ Erro: {e}")
            await db.rollback()
        finally:
            await engine.dispose()


if __name__ == "__main__":
    asyncio.run(move_sales_to_tenant_1())
