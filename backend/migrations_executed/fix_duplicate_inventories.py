"""
Script para remover inventories duplicados.

PROBLEMA: Alguns produtos têm múltiplos registros de inventory,
quando deveria ter apenas 1.

SOLUÇÃO: Para produtos com múltiplos inventories:
- Manter apenas o mais recente (com quantity agregado)
- Deletar (soft delete) os outros
"""
import asyncio
import sys
from pathlib import Path

# Adicionar diretório backend ao path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import select, func
from app.core.database import async_session_maker
from app.models.inventory import Inventory
from app.models.product import Product


async def fix_duplicate_inventories():
    """Remove inventories duplicados."""
    async with async_session_maker() as db:
        print("Buscando inventories duplicados...")
        print("=" * 60)
        print()
        
        # Buscar produtos com múltiplos inventories
        result = await db.execute(
            select(Inventory.product_id, func.count(Inventory.id).label('count'))
            .where(Inventory.is_active == True)
            .group_by(Inventory.product_id)
            .having(func.count(Inventory.id) > 1)
        )
        duplicates = result.all()
        
        if not duplicates:
            print("[OK] Nenhum inventory duplicado encontrado!")
            return
        
        print(f"[AVISO] Encontrados {len(duplicates)} produtos com inventories duplicados:")
        print()
        
        fixed_count = 0
        
        for product_id, count in duplicates:
            # Buscar produto
            product_result = await db.execute(
                select(Product).where(Product.id == product_id)
            )
            product = product_result.scalar_one_or_none()
            
            if not product:
                continue
            
            # Buscar todos os inventories deste produto
            inventories_result = await db.execute(
                select(Inventory)
                .where(Inventory.product_id == product_id, Inventory.is_active == True)
                .order_by(Inventory.created_at.desc())
            )
            inventories = list(inventories_result.scalars().all())
            
            print(f"   Produto {product_id} ({product.name[:30]}): {count} inventories")
            
            # Manter o mais recente (primeiro da lista ordenada por desc)
            keep_inventory = inventories[0]
            
            # Calcular quantity total (somar todos)
            total_quantity = sum(inv.quantity for inv in inventories)
            
            # Atualizar o inventory que vai ficar com a quantidade total
            keep_inventory.quantity = total_quantity
            
            print(f"      Mantendo: ID {keep_inventory.id} (criado em {keep_inventory.created_at})")
            print(f"      Quantity atualizado: {total_quantity}")
            
            # Soft delete dos demais
            for inv in inventories[1:]:
                inv.is_active = False
                print(f"      Deletando: ID {inv.id} (qty {inv.quantity})")
            
            fixed_count += 1
            print()
        
        await db.commit()
        
        print("=" * 60)
        print(f"[OK] {fixed_count} produtos corrigidos!")
        print()


async def main():
    """Função principal."""
    print()
    print("FIX DUPLICATE INVENTORIES")
    print("=" * 60)
    print()
    
    try:
        await fix_duplicate_inventories()
        print("=" * 60)
        print("[OK] Script concluido com sucesso!")
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
