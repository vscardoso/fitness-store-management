#!/usr/bin/env python3
"""
Script para migrar produtos existentes para o sistema de variantes.

Para cada produto existente, cria uma variante com os dados do produto.
"""
import asyncio
import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from sqlalchemy import text, select
from app.core.database import async_session_maker
from app.models.product import Product
from app.models.product_variant import ProductVariant
from decimal import Decimal


async def migrate_products_to_variants():
    """Migra produtos existentes para o sistema de variantes."""
    print("=" * 60)
    print("MIGRANDO PRODUTOS PARA SISTEMA DE VARIANTES")
    print("=" * 60)
    
    async with async_session_maker() as session:
        # Buscar todos os produtos
        result = await session.execute(
            select(Product).where(Product.is_active == True)
        )
        products = result.scalars().all()
        
        print(f"\nEncontrados {len(products)} produtos ativos")
        
        migrated = 0
        skipped = 0
        
        for product in products:
            # Verificar se já tem variantes
            existing_variants = await session.execute(
                select(ProductVariant).where(
                    ProductVariant.product_id == product.id,
                    ProductVariant.is_active == True
                )
            )
            if existing_variants.scalars().first():
                skipped += 1
                continue
            
            # Criar variante a partir dos dados do produto
            # Usar valores padrão já que os campos foram movidos
            # Usar tenant_id do produto ou 1 como padrão
            tenant_id = product.tenant_id or 1
            
            variant = ProductVariant(
                tenant_id=tenant_id,
                product_id=product.id,
                sku=f"PROD-{product.id:06d}",  # SKU gerado
                size=None,
                color=None,
                price=product.base_price or Decimal("0.00"),
                cost_price=None,
                image_url=product.image_url,
                is_active=True,
            )
            
            session.add(variant)
            migrated += 1
            print(f"  [OK] Produto {product.id} - {product.name}")
        
        await session.commit()
        
        print("\n" + "=" * 60)
        print("MIGRACAO CONCLUIDA!")
        print("=" * 60)
        print(f"Produtos migrados: {migrated}")
        print(f"Produtos com variantes: {skipped}")


if __name__ == '__main__':
    asyncio.run(migrate_products_to_variants())