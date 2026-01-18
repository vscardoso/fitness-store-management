"""
Script para criar registros de inventário para produtos que não têm.
"""
import asyncio
import sys
from pathlib import Path

# Adicionar diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select, text
from app.core.database import async_engine, AsyncSessionLocal
from app.models.product import Product
from app.models.inventory import Inventory


async def create_missing_inventory():
    """Cria registros de inventory para produtos sem estoque."""
    async with AsyncSessionLocal() as db:
        try:
            # Buscar produtos ativos que não têm inventory
            query = text("""
                SELECT p.id, p.name, p.tenant_id
                FROM products p
                LEFT JOIN inventory i ON p.id = i.product_id AND p.tenant_id = i.tenant_id
                WHERE p.is_active = 1 
                  AND i.id IS NULL
            """)
            
            result = await db.execute(query)
            products_without_inventory = result.fetchall()
            
            if not products_without_inventory:
                print("✅ Todos os produtos ativos já têm registro de inventário!")
                return
            
            print(f"📦 Encontrados {len(products_without_inventory)} produtos sem inventário")
            
            # Criar inventário zerado para cada produto
            created = 0
            for product_id, product_name, tenant_id in products_without_inventory:
                inventory = Inventory(
                    product_id=product_id,
                    tenant_id=tenant_id,
                    quantity=0,
                    min_stock=0,
                    max_stock=100,
                    location="Estoque Principal"
                )
                db.add(inventory)
                created += 1
                print(f"  ➕ Criado inventário para: {product_name} (ID: {product_id})")
            
            await db.commit()
            print(f"\n✅ {created} registros de inventário criados com sucesso!")
            
        except Exception as e:
            await db.rollback()
            print(f"❌ Erro ao criar inventários: {e}")
            raise


async def main():
    """Função principal."""
    print("🚀 Iniciando criação de inventários faltantes...\n")
    await create_missing_inventory()
    await async_engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
