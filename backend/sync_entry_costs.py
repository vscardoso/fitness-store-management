"""
⚠️ SCRIPT DE AJUSTE MANUAL: Sincroniza unit_cost dos EntryItems com cost_price dos produtos.

ATENÇÃO: Isso QUEBRA a rastreabilidade FIFO e histórico de custos!
Use apenas se você entende que o valor do estoque não refletirá o custo real de compra.
"""
import asyncio
from sqlalchemy import select, update
from app.core.database import async_session_maker
from app.models.entry_item import EntryItem
from app.models.product import Product


async def sync_entry_costs():
    """Atualiza unit_cost dos EntryItems para cost_price dos produtos."""
    
    async with async_session_maker() as db:
        print("=" * 100)
        print("⚠️  SINCRONIZAÇÃO DE CUSTOS (QUEBRA RASTREABILIDADE)")
        print("=" * 100)
        
        # Buscar EntryItems com seus produtos
        q = (
            select(
                EntryItem.id,
                EntryItem.product_id,
                Product.sku,
                Product.cost_price,
                EntryItem.unit_cost,
                EntryItem.quantity_remaining
            )
            .select_from(EntryItem)
            .join(Product, EntryItem.product_id == Product.id)
            .where(EntryItem.quantity_remaining > 0)
            .order_by(EntryItem.id)
        )
        
        result = await db.execute(q)
        items = result.fetchall()
        
        print(f"\nProdutos encontrados: {len(items)}")
        print(f"\n{'ItemID':<8} {'ProdID':<8} {'SKU':<20} {'Qtde':<6} {'Custo Antigo':<15} {'Custo Novo':<15}")
        print("-" * 90)
        
        updates = []
        for item in items:
            old_cost = float(item.unit_cost or 0)
            new_cost = float(item.cost_price or 0)
            
            if abs(old_cost - new_cost) > 0.01:  # Se houver diferença
                updates.append({
                    'item_id': item.id,
                    'product_id': item.product_id,
                    'sku': item.sku,
                    'qty': item.quantity_remaining,
                    'old_cost': old_cost,
                    'new_cost': new_cost
                })
                print(f"{item.id:<8} {item.product_id:<8} {item.sku:<20} {item.quantity_remaining:<6} "
                      f"R$ {old_cost:<12.2f} R$ {new_cost:<12.2f}")
        
        if not updates:
            print("\n✅ Nenhum ajuste necessário. Todos os custos já estão sincronizados.")
            return
        
        print(f"\n{len(updates)} EntryItems precisam de ajuste.")
        print("\n⚠️  ATENÇÃO: Esta operação é IRREVERSÍVEL e quebra o histórico de custos!")
        print("Digite 'CONFIRMAR' para prosseguir ou qualquer outra coisa para cancelar: ", end="")
        
        confirmation = input().strip()
        
        if confirmation != "CONFIRMAR":
            print("\n❌ Operação cancelada.")
            return
        
        # Aplicar updates
        for upd in updates:
            stmt = (
                update(EntryItem)
                .where(EntryItem.id == upd['item_id'])
                .values(unit_cost=upd['new_cost'])
            )
            await db.execute(stmt)
        
        await db.commit()
        
        print(f"\n✅ {len(updates)} EntryItems atualizados com sucesso!")
        print("\nIMPACTO:")
        
        old_total = sum(u['old_cost'] * u['qty'] for u in updates)
        new_total = sum(u['new_cost'] * u['qty'] for u in updates)
        
        print(f"  Valor antigo do estoque: R$ {old_total:.2f}")
        print(f"  Valor novo do estoque:   R$ {new_total:.2f}")
        print(f"  Diferença:               R$ {new_total - old_total:.2f}")


if __name__ == "__main__":
    asyncio.run(sync_entry_costs())
