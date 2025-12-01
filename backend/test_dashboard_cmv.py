"""
Testa endpoint /dashboard/stats para verificar CMV e lucro realizado.
"""
import asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.sale import Sale, SaleItem


async def test_dashboard_cmv():
    """Calcula CMV e lucro manualmente para validar endpoint."""
    
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as db:
        try:
            # 1. Total de vendas
            sales_query = select(
                func.coalesce(func.sum(Sale.total_amount), 0).label("total_sales"),
                func.count(Sale.id).label("count_sales")
            ).where(Sale.is_active == True)
            
            result = await db.execute(sales_query)
            sales_data = result.one()
            
            print(f"\n📊 VENDAS:")
            print(f"   Total: R$ {sales_data.total_sales:.2f}")
            print(f"   Quantidade: {sales_data.count_sales}")
            
            # 2. CMV (Custo das Mercadorias Vendidas)
            cmv_query = select(
                func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("total_cmv")
            ).join(Sale, SaleItem.sale_id == Sale.id).where(
                Sale.is_active == True,
                SaleItem.is_active == True,
            )
            
            result = await db.execute(cmv_query)
            cmv_data = result.one()
            
            print(f"\n💰 CMV (Custo das Mercadorias Vendidas):")
            print(f"   Total: R$ {cmv_data.total_cmv:.2f}")
            
            # 3. Lucro Realizado
            lucro = sales_data.total_sales - cmv_data.total_cmv
            margem = (lucro / sales_data.total_sales * 100) if sales_data.total_sales > 0 else 0
            
            print(f"\n✅ LUCRO REALIZADO:")
            print(f"   Lucro: R$ {lucro:.2f}")
            print(f"   Margem: {margem:.1f}%")
            
            # 4. Detalhe por venda
            items_query = select(
                SaleItem.id,
                SaleItem.sale_id,
                SaleItem.product_id,
                SaleItem.quantity,
                SaleItem.unit_price,
                SaleItem.unit_cost,
                SaleItem.subtotal
            ).join(Sale, SaleItem.sale_id == Sale.id).where(
                Sale.is_active == True,
                SaleItem.is_active == True,
            )
            
            result = await db.execute(items_query)
            items = result.all()
            
            print(f"\n📦 DETALHES DOS ITENS ({len(items)} itens):")
            for item in items[:5]:  # Mostrar apenas 5 primeiros
                item_cmv = item.quantity * item.unit_cost
                item_revenue = item.subtotal
                item_profit = item_revenue - item_cmv
                print(f"   Item {item.id}: Qtd={item.quantity}, Preço=R${item.unit_price:.2f}, Custo=R${item.unit_cost:.2f}, Lucro=R${item_profit:.2f}")
            
        except Exception as e:
            print(f"\n❌ Erro: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test_dashboard_cmv())
