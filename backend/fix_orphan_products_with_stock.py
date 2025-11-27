"""
Script para corrigir produtos órfãos que ainda têm estoque

Se um produto está inativo (is_active=False) mas:
- Tem inventário com quantity > 0
- Tem entry_items ativos apontando para ele

Então devemos reativá-lo, pois ele não é realmente órfão.
"""
import asyncio
from sqlalchemy import select, update
from app.core.database import async_session_maker
from app.models.product import Product
from app.models.inventory import Inventory
from app.models.entry_item import EntryItem


async def fix_orphan_products():
    async with async_session_maker() as db:
        print("=" * 70)
        print("CORRIGINDO PRODUTOS ÓRFÃOS COM ESTOQUE")
        print("=" * 70)
        
        # Buscar produtos inativos que têm entry_items ativos ou inventário > 0
        result = await db.execute(
            select(Product).where(
                Product.tenant_id == 2,
                Product.is_active == False
            )
        )
        inactive_products = result.scalars().all()
        
        print(f"\nEncontrados {len(inactive_products)} produtos inativos no tenant 2")
        
        reactivated = []
        
        for product in inactive_products:
            should_reactivate = False
            reason = []
            
            # Verificar se tem entry_items ativos
            result = await db.execute(
                select(EntryItem).where(
                    EntryItem.product_id == product.id,
                    EntryItem.tenant_id == 2,
                    EntryItem.is_active == True,
                    EntryItem.quantity_remaining > 0
                )
            )
            active_items = result.scalars().all()
            
            if active_items:
                should_reactivate = True
                total_remaining = sum(item.quantity_remaining for item in active_items)
                reason.append(f"tem {len(active_items)} entry_items ativos (total: {total_remaining} unidades)")
            
            # Verificar se tem inventário > 0
            result = await db.execute(
                select(Inventory).where(
                    Inventory.product_id == product.id,
                    Inventory.tenant_id == 2,
                    Inventory.quantity > 0
                )
            )
            inventory = result.scalar_one_or_none()
            
            if inventory:
                should_reactivate = True
                reason.append(f"tem inventário com {inventory.quantity} unidades")
            
            if should_reactivate:
                print(f"\n🔄 Reativando produto: {product.name} (ID: {product.id})")
                for r in reason:
                    print(f"   → {r}")
                
                product.is_active = True
                reactivated.append(product.name)
        
        if reactivated:
            await db.commit()
            print(f"\n✅ {len(reactivated)} produto(s) reativado(s):")
            for name in reactivated:
                print(f"   • {name}")
        else:
            print("\n✅ Nenhum produto órfão com estoque encontrado")
        
        print("\n" + "=" * 70)


if __name__ == "__main__":
    asyncio.run(fix_orphan_products())
