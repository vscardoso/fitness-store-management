#!/usr/bin/env python3
"""
Script de migração para o sistema de variantes de produto.

Este script:
1. Agrupa produtos existentes por nome + marca
2. Cria produtos "pai" para cada grupo
3. Cria variantes para cada combinação tamanho/cor
4. Migra EntryItems, SaleItems, Inventory e ReturnItems para as novas variantes
5. Desativa os produtos originais

Uso:
    python migrate_to_variants.py [--dry-run] [--tenant-id ID]
"""

import asyncio
import argparse
import sys
from datetime import datetime
from decimal import Decimal
from collections import defaultdict
from typing import Optional

# Adicionar o diretório backend ao path
sys.path.insert(0, '/app')

from sqlalchemy import select, update, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models import (
    Product, ProductVariant, EntryItem, SaleItem, 
    Inventory, ReturnItem, Category
)
from app.db.session import async_session_maker


async def get_products_to_migrate(
    db: AsyncSession, 
    tenant_id: Optional[int] = None
) -> list[Product]:
    """Busca todos os produtos ativos para migrar."""
    query = select(Product).where(
        Product.is_active == True,
        Product.is_deleted == False
    ).options(
        selectinload(Product.category),
        selectinload(Product.inventory),
        selectinload(Product.sale_items),
        selectinload(Product.entry_items) if hasattr(Product, 'entry_items') else None
    )
    
    if tenant_id:
        query = query.where(Product.tenant_id == tenant_id)
    
    query = query.order_by(Product.name, Product.brand, Product.color, Product.size)
    
    result = await db.execute(query)
    return list(result.scalars().all())


def group_products(products: list[Product]) -> dict[tuple, list[Product]]:
    """
    Agrupa produtos por nome + marca para criar produtos pai.
    
    Returns:
        Dict com chave (nome, marca) e lista de produtos
    """
    groups = defaultdict(list)
    
    for product in products:
        # Chave de agrupamento: nome normalizado + marca
        name_key = product.name.lower().strip()
        brand_key = (product.brand or '').lower().strip()
        
        groups[(name_key, brand_key)].append(product)
    
    return groups


def generate_variant_sku(product: Product, counter: int = 1) -> str:
    """Gera SKU para a variante baseado no produto original."""
    import re
    
    # Usar SKU original como base
    if product.sku:
        base = product.sku
    else:
        # Gerar base a partir do nome e marca
        brand_prefix = (product.brand or 'PROD')[:3].upper()
        name_prefix = ''.join(re.findall(r'[A-Z]', product.name[:10].upper()))[:3] or 'ITEM'
        base = f"{brand_prefix}-{name_prefix}"
    
    # Adicionar sufixo de tamanho/cor se disponível
    size_suffix = product.size[:2] if product.size else ''
    color_suffix = product.color[:3] if product.color else ''
    
    if size_suffix or color_suffix:
        variant_suffix = f"-{color_suffix}{size_suffix}".upper()
        return f"{base}{variant_suffix}"
    
    return f"{base}-{counter:03d}"


async def create_parent_product(
    db: AsyncSession,
    sample_product: Product,
    tenant_id: int
) -> Product:
    """Cria o produto pai a partir de um produto do grupo."""
    parent = Product(
        tenant_id=tenant_id,
        name=sample_product.name,
        description=sample_product.description,
        brand=sample_product.brand,
        category_id=sample_product.category_id,
        gender=sample_product.gender,
        material=sample_product.material,
        is_digital=sample_product.is_digital,
        is_activewear=sample_product.is_activewear,
        is_catalog=sample_product.is_catalog,
        image_url=sample_product.image_url,
        base_price=sample_product.price,  # Preço base do primeiro produto
        is_active=True,
    )
    
    db.add(parent)
    await db.flush()
    return parent


async def create_variant(
    db: AsyncSession,
    product: Product,
    parent_id: int,
    tenant_id: int,
    sku_counter: int
) -> ProductVariant:
    """Cria uma variante a partir de um produto existente."""
    sku = generate_variant_sku(product, sku_counter)
    
    # Verificar se SKU já existe
    existing = await db.execute(
        select(ProductVariant).where(
            ProductVariant.sku == sku,
            ProductVariant.tenant_id == tenant_id
        )
    )
    if existing.scalar_one_or_none():
        # Adicionar contador único
        sku = f"{sku[:45]}-{sku_counter:03d}"
    
    variant = ProductVariant(
        tenant_id=tenant_id,
        product_id=parent_id,
        sku=sku,
        size=product.size,
        color=product.color,
        price=product.price,
        cost_price=product.cost_price,
        image_url=None,  # Imagem específica da variante (pode ser adicionada depois)
        is_active=True,
    )
    
    db.add(variant)
    await db.flush()
    return variant


async def migrate_entry_items(
    db: AsyncSession,
    old_product_id: int,
    new_variant_id: int
) -> int:
    """Migra EntryItems do produto antigo para a variante."""
    result = await db.execute(
        update(EntryItem)
        .where(EntryItem.product_id == old_product_id)
        .values(variant_id=new_variant_id)
    )
    return result.rowcount


async def migrate_sale_items(
    db: AsyncSession,
    old_product_id: int,
    new_variant_id: int
) -> int:
    """Migra SaleItems do produto antigo para a variante."""
    result = await db.execute(
        update(SaleItem)
        .where(SaleItem.product_id == old_product_id)
        .values(variant_id=new_variant_id)
    )
    return result.rowcount


async def migrate_inventory(
    db: AsyncSession,
    old_product_id: int,
    new_variant_id: int
) -> int:
    """Migra Inventory do produto antigo para a variante."""
    result = await db.execute(
        update(Inventory)
        .where(Inventory.product_id == old_product_id)
        .values(variant_id=new_variant_id)
    )
    return result.rowcount


async def migrate_return_items(
    db: AsyncSession,
    old_product_id: int,
    new_variant_id: int
) -> int:
    """Migra ReturnItems do produto antigo para a variante."""
    result = await db.execute(
        update(ReturnItem)
        .where(ReturnItem.product_id == old_product_id)
        .values(variant_id=new_variant_id)
    )
    return result.rowcount


async def deactivate_old_product(db: AsyncSession, product_id: int) -> None:
    """Desativa o produto original após migração."""
    await db.execute(
        update(Product)
        .where(Product.id == product_id)
        .values(is_active=False)
    )


async def migrate_tenant(
    db: AsyncSession,
    tenant_id: int,
    dry_run: bool = False
) -> dict:
    """
    Migra todos os produtos de um tenant para o sistema de variantes.
    
    Returns:
        Estatísticas da migração
    """
    stats = {
        'products_found': 0,
        'groups_created': 0,
        'variants_created': 0,
        'entry_items_migrated': 0,
        'sale_items_migrated': 0,
        'inventory_migrated': 0,
        'return_items_migrated': 0,
        'products_deactivated': 0,
        'errors': [],
    }
    
    print(f"\n{'='*60}")
    print(f"Migrando tenant {tenant_id}")
    print(f"{'='*60}")
    
    # 1. Buscar produtos
    products = await get_products_to_migrate(db, tenant_id)
    stats['products_found'] = len(products)
    print(f"\n📦 Produtos encontrados: {len(products)}")
    
    if not products:
        print("Nenhum produto para migrar.")
        return stats
    
    # 2. Agrupar produtos
    groups = group_products(products)
    print(f"📊 Grupos identificados: {len(groups)}")
    
    # 3. Processar cada grupo
    for (name_key, brand_key), group_products in groups.items():
        sample = group_products[0]
        group_name = f"{sample.brand + ' - ' if sample.brand else ''}{sample.name}"
        
        print(f"\n🔄 Processando grupo: {group_name}")
        print(f"   Produtos no grupo: {len(group_products)}")
        
        if dry_run:
            print("   [DRY RUN] Simulando criação do produto pai e variantes...")
            stats['groups_created'] += 1
            stats['variants_created'] += len(group_products)
            continue
        
        try:
            # Criar produto pai
            parent = await create_parent_product(db, sample, tenant_id)
            stats['groups_created'] += 1
            print(f"   ✅ Produto pai criado: ID {parent.id}")
            
            # Criar variantes para cada produto do grupo
            for idx, product in enumerate(group_products, 1):
                variant = await create_variant(
                    db, product, parent.id, tenant_id, idx
                )
                stats['variants_created'] += 1
                
                variant_label = f"{product.color or ''} {product.size or ''}".strip()
                print(f"   ✅ Variante criada: {variant.sku} ({variant_label or 'Único'})")
                
                # Migrar relacionamentos
                entry_count = await migrate_entry_items(db, product.id, variant.id)
                stats['entry_items_migrated'] += entry_count
                
                sale_count = await migrate_sale_items(db, product.id, variant.id)
                stats['sale_items_migrated'] += sale_count
                
                inv_count = await migrate_inventory(db, product.id, variant.id)
                stats['inventory_migrated'] += inv_count
                
                return_count = await migrate_return_items(db, product.id, variant.id)
                stats['return_items_migrated'] += return_count
                
                # Desativar produto original
                await deactivate_old_product(db, product.id)
                stats['products_deactivated'] += 1
                
                if entry_count or sale_count or inv_count:
                    print(f"      📈 Migrado: {entry_count} entradas, {sale_count} vendas, {inv_count} estoque")
            
            await db.commit()
            print(f"   💾 Grupo migrado com sucesso!")
            
        except Exception as e:
            await db.rollback()
            error_msg = f"Erro ao migrar grupo '{group_name}': {str(e)}"
            print(f"   ❌ {error_msg}")
            stats['errors'].append(error_msg)
    
    return stats


async def main():
    parser = argparse.ArgumentParser(
        description='Migra produtos para o sistema de variantes'
    )
    parser.add_argument(
        '--dry-run', 
        action='store_true',
        help='Simula a migração sem fazer alterações'
    )
    parser.add_argument(
        '--tenant-id',
        type=int,
        help='ID do tenant específico (migra todos se não informado)'
    )
    
    args = parser.parse_args()
    
    print("\n" + "="*60)
    print("MIGRAÇÃO PARA SISTEMA DE VARIANTES DE PRODUTO")
    print("="*60)
    
    if args.dry_run:
        print("\n⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    
    async with async_session_maker() as db:
        try:
            stats = await migrate_tenant(db, args.tenant_id or 1, args.dry_run)
            
            print("\n" + "="*60)
            print("RESUMO DA MIGRAÇÃO")
            print("="*60)
            print(f"Produtos encontrados:     {stats['products_found']}")
            print(f"Produtos pai criados:     {stats['groups_created']}")
            print(f"Variantes criadas:        {stats['variants_created']}")
            print(f"EntryItems migrados:      {stats['entry_items_migrated']}")
            print(f"SaleItems migrados:       {stats['sale_items_migrated']}")
            print(f"Inventory migrados:       {stats['inventory_migrated']}")
            print(f"ReturnItems migrados:     {stats['return_items_migrated']}")
            print(f"Produtos desativados:     {stats['products_deactivated']}")
            
            if stats['errors']:
                print(f"\n❌ Erros encontrados: {len(stats['errors'])}")
                for error in stats['errors']:
                    print(f"   - {error}")
            
            print("\n✅ Migração concluída!")
            
        except Exception as e:
            print(f"\n❌ Erro fatal: {e}")
            await db.rollback()
            raise


if __name__ == '__main__':
    asyncio.run(main())