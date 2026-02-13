"""
Script para criar registros de Inventory faltantes.

PROBLEMA: Alguns produtos foram criados sem registro de inventory,
causando erro 404 ao buscar estoque.

SOLUÇÃO: Criar inventory para todos os produtos que não têm.
"""
import asyncio
import sys
from pathlib import Path

# Adicionar diretório backend ao path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import select, func
from app.core.database import async_session_maker
from app.models.product import Product
from app.models.inventory import Inventory
from app.models.entry_item import EntryItem


async def fix_missing_inventories():
    """Cria inventories faltantes para produtos."""
    async with async_session_maker() as db:
        print("Buscando produtos sem inventory...")
        print("=" * 60)
        
        # Buscar todos os produtos ativos
        result = await db.execute(
            select(Product).where(Product.is_active == True).order_by(Product.id)
        )
        products = result.scalars().all()
        
        products_without_inventory = []
        products_fixed = []
        
        for product in products:
            # Verificar se tem inventory
            inv_result = await db.execute(
                select(func.count(Inventory.id))
                .where(Inventory.product_id == product.id, Inventory.is_active == True)
            )
            inv_count = inv_result.scalar()
            
            if inv_count == 0:
                products_without_inventory.append(product)
                
                # Calcular quantidade a partir dos entry_items
                entry_items_result = await db.execute(
                    select(func.sum(EntryItem.quantity_remaining))
                    .where(EntryItem.product_id == product.id, EntryItem.is_active == True)
                )
                total_quantity = entry_items_result.scalar() or 0
                
                # Criar inventory
                new_inventory = Inventory(
                    product_id=product.id,
                    quantity=total_quantity,
                    min_stock=5,  # Padrão
                    tenant_id=product.tenant_id,
                )
                db.add(new_inventory)
                
                products_fixed.append({
                    'id': product.id,
                    'name': product.name,
                    'sku': product.sku,
                    'quantity': total_quantity,
                })
                
                print(f"[OK] Criando inventory: Produto {product.id} ({product.name[:30]}) - Qty: {total_quantity}")
        
        if products_fixed:
            await db.commit()
            print()
            print("=" * 60)
            print(f"[OK] SUCESSO! Criados {len(products_fixed)} inventories:")
            print()
            for p in products_fixed:
                print(f"   ID {p['id']}: {p['name'][:35]:<35} (SKU: {p['sku']:<10}) - {p['quantity']} un")
        else:
            print()
            print("[OK] Nenhum inventory faltante encontrado!")
        
        print()
        print(f"Resumo:")
        print(f"   Total de produtos: {len(products)}")
        print(f"   Sem inventory: {len(products_without_inventory)}")
        print(f"   Corrigidos: {len(products_fixed)}")


async def main():
    """Função principal."""
    print()
    print("FIX MISSING INVENTORIES")
    print("=" * 60)
    print()
    
    try:
        await fix_missing_inventories()
        print()
        print("=" * 60)
        print("[OK] Script concluído com sucesso!")
        print()
    except Exception as e:
        print()
        print("=" * 60)
        print(f"[ERRO]: {e}")
        print()
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
