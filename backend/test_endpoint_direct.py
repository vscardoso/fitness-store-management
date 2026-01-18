"""
Testar o endpoint diretamente usando a lógica do endpoint
"""
import asyncio
from app.core.database import async_session_maker
from app.repositories.product import ProductRepository
from app.repositories.inventory import InventoryRepository
from app.repositories.entry_item import EntryItemRepository


async def test():
    async with async_session_maker() as db:
        tenant_id = 2
        has_stock = True
        
        product_repo = ProductRepository(db)
        inventory_repo = InventoryRepository(db)
        entry_item_repo = EntryItemRepository()
        
        # Buscar produtos com estoque (FIFO)
        products_with_stock = await entry_item_repo.get_products_with_stock(db, tenant_id)
        print(f'\n📦 Produtos com estoque no FIFO: {len(products_with_stock)}')
        print(f'IDs: {sorted(products_with_stock)}')
        
        # Buscar todos os produtos
        products = await product_repo.get_multi(db, skip=0, limit=20, tenant_id=tenant_id)
        print(f'\n📦 Total produtos do tenant: {len(products)}')
        
        # Filtrar (mesma lógica do endpoint)
        filtered_products = []
        for product in products:
            if product.is_catalog:
                continue
            
            # Enriquecer com estoque
            inventory = await inventory_repo.get_by_product_and_tenant(db, product.id, tenant_id)
            if inventory:
                product.current_stock = inventory.current_stock
            else:
                product.current_stock = 0
            
            # Filtrar por estoque
            if has_stock:
                if product.id in products_with_stock:
                    filtered_products.append(product)
            else:
                filtered_products.append(product)
        
        print(f'\n✅ Produtos filtrados (has_stock={has_stock}): {len(filtered_products)}')
        for p in filtered_products:
            print(f'  - ID: {p.id} | Nome: {p.name} | Estoque: {p.current_stock}')


if __name__ == '__main__':
    asyncio.run(test())
