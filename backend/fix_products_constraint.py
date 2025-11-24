"""Fix products unique constraint"""
import asyncio
from sqlalchemy import text
from app.core.database import engine

async def fix_products_constraint():
    async with engine.begin() as conn:
        print("Verificando constraints em products...")
        result = await conn.execute(text("""
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'products' 
            AND indexname LIKE '%sku%' OR indexname LIKE '%barcode%'
        """))
        
        for row in result:
            print(f"  {row[0]}: {row[1]}")
        
        print("\nRemovendo index incorreto ix_products_sku...")
        await conn.execute(text('DROP INDEX IF EXISTS ix_products_sku'))
        
        print("Criando index correto uq_products_tenant_sku...")
        await conn.execute(text(
            'CREATE UNIQUE INDEX uq_products_tenant_sku ON products (tenant_id, sku)'
        ))
        
        print("\nRemovendo index incorreto ix_products_barcode (se existir)...")
        await conn.execute(text('DROP INDEX IF EXISTS ix_products_barcode'))
        
        print("Criando index correto uq_products_tenant_barcode...")
        await conn.execute(text(
            'CREATE UNIQUE INDEX uq_products_tenant_barcode ON products (tenant_id, barcode) WHERE barcode IS NOT NULL'
        ))
        
        print("\n✅ Constraints de produtos corrigidas!")

asyncio.run(fix_products_constraint())
