"""
Corrigir produtos de catálogo que têm entry_items

Se um produto tem:
- is_catalog=True
- entry_items ativos
- inventário > 0

Então ele foi adicionado à loja, mas não foi desmarcado como catálogo.
Vamos corrigir isso marcando is_catalog=False.
"""
import asyncio
from sqlalchemy import select, update
from app.core.database import async_session_maker
from app.models.product import Product
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory


async def fix_catalog_products_with_entries():
    async with async_session_maker() as db:
        print("=" * 70)
        print("CORRIGINDO PRODUTOS DE CATÁLOGO COM ENTRY_ITEMS")
        print("=" * 70)
        
        # Buscar produtos de catálogo que têm entry_items ativos
        result = await db.execute(
            select(Product.id).distinct().select_from(Product).join(
                EntryItem, EntryItem.product_id == Product.id
            ).where(
                Product.tenant_id == 2,
                Product.is_catalog == True,
                Product.is_active == True,
                EntryItem.is_active == True,
                EntryItem.quantity_remaining > 0
            )
        )
        catalog_products_with_entries = result.scalars().all()
        
        if not catalog_products_with_entries:
            print("\n✅ Nenhum produto de catálogo com entry_items encontrado")
            return
        
        print(f"\nEncontrados {len(catalog_products_with_entries)} produtos de catálogo com entry_items ativos")
        
        # Buscar detalhes dos produtos
        for product_id in catalog_products_with_entries:
            result = await db.execute(select(Product).where(Product.id == product_id))
            product = result.scalar_one()
            
            # Verificar inventário
            result = await db.execute(
                select(Inventory).where(
                    Inventory.product_id == product_id,
                    Inventory.tenant_id == 2
                )
            )
            inventory = result.scalar_one_or_none()
            
            # Verificar entry_items
            result = await db.execute(
                select(EntryItem).where(
                    EntryItem.product_id == product_id,
                    EntryItem.tenant_id == 2,
                    EntryItem.is_active == True
                )
            )
            entry_items = result.scalars().all()
            
            print(f"\n🔄 Produto: {product.name} (ID: {product.id}, SKU: {product.sku})")
            print(f"   • is_catalog: True → False")
            print(f"   • Entry items ativos: {len(entry_items)}")
            if inventory:
                print(f"   • Inventário: {inventory.quantity} unidades")
            
            # Atualizar para is_catalog=False
            product.is_catalog = False
        
        # Commit das mudanças
        await db.commit()
        
        print(f"\n✅ {len(catalog_products_with_entries)} produto(s) corrigido(s)")
        print("\n" + "=" * 70)


if __name__ == "__main__":
    asyncio.run(fix_catalog_products_with_entries())
