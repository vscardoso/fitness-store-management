"""
Compara cost_price dos produtos vs unit_cost dos EntryItems.
"""
import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.entry_item import EntryItem
from app.models.stock_entry import StockEntry
from app.models.product import Product


async def compare_costs():
    """Compara custos de produtos vs entry items."""
    
    async with async_session_maker() as db:
        print("=" * 100)
        print("COMPARAÇÃO: cost_price (Produto) vs unit_cost (EntryItem)")
        print("=" * 100)
        
        # Buscar EntryItems com seus produtos
        q = (
            select(
                EntryItem.id.label("item_id"),
                EntryItem.product_id,
                Product.sku,
                Product.name,
                Product.cost_price.label("product_cost"),
                EntryItem.unit_cost.label("entry_cost"),
                EntryItem.quantity_remaining,
                EntryItem.is_active.label("item_active"),
                StockEntry.entry_code,
                StockEntry.entry_date
            )
            .select_from(EntryItem)
            .join(Product, EntryItem.product_id == Product.id)
            .join(StockEntry, EntryItem.entry_id == StockEntry.id)
            .where(EntryItem.quantity_remaining > 0)
            .order_by(EntryItem.id)
        )
        
        result = await db.execute(q)
        rows = result.fetchall()
        
        print(f"\n{'ItemID':<8} {'ProdID':<8} {'SKU':<20} {'Qtde':<6} {'Prod Cost':<12} {'Entry Cost':<12} {'Diferença':<12} {'Entry Code':<20}")
        print("-" * 120)
        
        total_by_product_cost = 0.0
        total_by_entry_cost = 0.0
        
        for r in rows:
            product_cost = float(r.product_cost or 0)
            entry_cost = float(r.entry_cost or 0)
            diff = product_cost - entry_cost
            qty = r.quantity_remaining
            
            total_by_product_cost += product_cost * qty
            total_by_entry_cost += entry_cost * qty
            
            diff_marker = " ⚠️" if abs(diff) > 0.01 else ""
            
            print(f"{r.item_id:<8} {r.product_id:<8} {r.sku:<20} {qty:<6} "
                  f"R$ {product_cost:<9.2f} R$ {entry_cost:<9.2f} R$ {diff:<9.2f}{diff_marker} {r.entry_code:<20}")
        
        print("-" * 120)
        print(f"\nSe usasse cost_price do produto: R$ {total_by_product_cost:.2f}")
        print(f"Usando unit_cost do EntryItem:    R$ {total_by_entry_cost:.2f}")
        print(f"Diferença:                        R$ {total_by_product_cost - total_by_entry_cost:.2f}")
        
        print("\n" + "=" * 100)
        print("EXPLICAÇÃO:")
        print("=" * 100)
        print("""
O valor do estoque é calculado usando EntryItem.unit_cost (custo no momento da entrada),
NÃO Product.cost_price (custo cadastral atual do produto).

RAZÃO: Rastreabilidade FIFO
- Cada lote tem seu custo histórico congelado (quanto você PAGOU naquela entrada)
- Se você comprou 100 un a R$ 25,00 e depois atualiza o produto para R$ 10,00,
  o estoque daquele lote CONTINUA valendo R$ 25,00 (custo real de compra)
- Quando você VENDER, o lucro será calculado usando o custo real daquela entrada

SOLUÇÃO:
Se você quer que o estoque reflita o novo custo:
1. Criar uma NOVA entrada com o custo atualizado (R$ 10,00)
2. OU fazer um ajuste manual nos EntryItems existentes (update unit_cost)
   ⚠️ CUIDADO: isso quebra a rastreabilidade histórica!
        """)


if __name__ == "__main__":
    asyncio.run(compare_costs())
