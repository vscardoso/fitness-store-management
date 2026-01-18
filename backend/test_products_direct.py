"""Script para testar endpoint de produtos diretamente via pytest fixtures"""
import sys
import asyncio
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.product import ProductRepository
from app.repositories.entry_item import EntryItemRepository
from app.database import async_session_maker


async def test_products_with_stock():
    """Testar produtos com estoque diretamente no banco"""
    async with async_session_maker() as db:
        product_repo = ProductRepository()
        entry_item_repo = EntryItemRepository()
        
        # Tenant ID 2
        tenant_id = 2
        
        # Buscar produtos com estoque
        products_with_stock = await entry_item_repo.get_products_with_stock(db, tenant_id)
        print(f'\n📦 Produtos com estoque no banco (EntryItems): {len(products_with_stock)}')
        print(f'IDs: {sorted(products_with_stock)}')
        
        # Buscar produtos ativos não-catalogo
        all_products = await product_repo.get_multi(
            db,
            filters={'tenant_id': tenant_id, 'is_active': True, 'is_catalog': False}
        )
        print(f'\n📦 Total produtos ativos não-catálogo: {len(all_products)}')
        
        # Filtrar apenas os que têm estoque
        filtered_products = [p for p in all_products if p.id in products_with_stock]
        print(f'\n✅ Produtos filtrados com estoque: {len(filtered_products)}')
        
        for product in filtered_products:
            # Buscar estoque do inventory
            from app.repositories.inventory import InventoryRepository
            inventory_repo = InventoryRepository()
            inventory = await inventory_repo.get_by_product_and_tenant(db, product.id, tenant_id)
            
            print(f'\nID: {product.id}')
            print(f'  Nome: {product.name}')
            print(f'  Estoque (Inventory): {inventory.current_stock if inventory else 0}')
            print(f'  is_catalog: {product.is_catalog}')
            print(f'  is_active: {product.is_active}')


if __name__ == '__main__':
    asyncio.run(test_products_with_stock())
