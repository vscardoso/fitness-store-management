"""
Script de status: Mostra situação atual do banco de dados

Útil para verificar o estado antes e depois da migração.

Executar com: python scripts/migration_status.py
"""

import sys
import asyncio
from pathlib import Path
from datetime import datetime

# Adicionar o diretório raiz ao path
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

from sqlalchemy import select, func

from app.core.database import async_session_maker, engine
from app.models import Batch, Product, StockEntry, EntryItem


async def get_migration_status():
    """Retorna status completo da migração"""
    
    print("\n" + "="*70)
    print("📊 STATUS DO BANCO DE DADOS")
    print("="*70)
    print(f"Horário: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")
    
    async with async_session_maker() as session:
        # ========== BATCHES ==========
        print("🗃️  SISTEMA ANTIGO (BATCHES)")
        print("-" * 70)
        
        # Batches ativos
        result = await session.execute(
            select(func.count(Batch.id)).where(Batch.is_active == True)
        )
        active_batches = result.scalar()
        
        # Batches inativos
        result = await session.execute(
            select(func.count(Batch.id)).where(Batch.is_active == False)
        )
        inactive_batches = result.scalar()
        
        # Produtos com batch_id
        result = await session.execute(
            select(func.count(Product.id)).where(Product.batch_id.isnot(None))
        )
        products_with_batch = result.scalar()
        
        # Custo total dos batches ativos
        result = await session.execute(
            select(func.sum(Batch.total_cost)).where(Batch.is_active == True)
        )
        total_batch_cost = result.scalar() or 0
        
        print(f"Batches ativos: {active_batches}")
        print(f"Batches inativos: {inactive_batches}")
        print(f"Total de batches: {active_batches + inactive_batches}")
        print(f"Produtos com batch_id: {products_with_batch}")
        print(f"Custo total (batches ativos): R$ {total_batch_cost:,.2f}")
        
        # ========== STOCK ENTRIES ==========
        print("\n📦 SISTEMA NOVO (STOCK ENTRIES)")
        print("-" * 70)
        
        # Stock Entries ativos
        result = await session.execute(
            select(func.count(StockEntry.id)).where(StockEntry.is_active == True)
        )
        active_entries = result.scalar()
        
        # Stock Entries inativos
        result = await session.execute(
            select(func.count(StockEntry.id)).where(StockEntry.is_active == False)
        )
        inactive_entries = result.scalar()
        
        # Entry Items ativos
        result = await session.execute(
            select(func.count(EntryItem.id)).where(EntryItem.is_active == True)
        )
        active_items = result.scalar()
        
        # Entry Items inativos
        result = await session.execute(
            select(func.count(EntryItem.id)).where(EntryItem.is_active == False)
        )
        inactive_items = result.scalar()
        
        # Custo total dos stock_entries ativos
        result = await session.execute(
            select(func.sum(StockEntry.total_cost)).where(StockEntry.is_active == True)
        )
        total_entry_cost = result.scalar() or 0
        
        # Quantidade total recebida
        result = await session.execute(
            select(func.sum(EntryItem.quantity_received))
            .where(EntryItem.is_active == True)
        )
        total_received = result.scalar() or 0
        
        # Quantidade total restante
        result = await session.execute(
            select(func.sum(EntryItem.quantity_remaining))
            .where(EntryItem.is_active == True)
        )
        total_remaining = result.scalar() or 0
        
        print(f"StockEntries ativos: {active_entries}")
        print(f"StockEntries inativos: {inactive_entries}")
        print(f"Total de StockEntries: {active_entries + inactive_entries}")
        print(f"EntryItems ativos: {active_items}")
        print(f"EntryItems inativos: {inactive_items}")
        print(f"Total de EntryItems: {active_items + inactive_items}")
        print(f"Custo total (entries ativos): R$ {total_entry_cost:,.2f}")
        print(f"Quantidade total recebida: {total_received:,}")
        print(f"Quantidade total restante: {total_remaining:,}")
        
        # ========== ANÁLISE ==========
        print("\n🔍 ANÁLISE")
        print("-" * 70)
        
        # Verificar se migração foi feita
        if active_entries == 0 and active_batches > 0:
            print("❌ Status: Migração NÃO realizada")
            print("   → Execute: python scripts/migrate_batch_to_entry.py")
        elif active_entries > 0 and active_batches > 0:
            print("⚠️  Status: Migração realizada, batches ATIVOS")
            print("   → Valide: python scripts/validate_migration.py")
            print("   → Limpe: python scripts/cleanup_batches.py")
        elif active_entries > 0 and active_batches == 0:
            print("✅ Status: Migração COMPLETA e limpa")
            print("   → Sistema usando StockEntries")
        else:
            print("🤔 Status: Banco vazio ou estado desconhecido")
        
        # Comparar custos
        if active_batches > 0 and active_entries > 0:
            cost_diff = abs(total_entry_cost - total_batch_cost)
            if cost_diff > 0.01:
                print(f"\n⚠️  Discrepância de custos: R$ {cost_diff:,.2f}")
                print(f"   Batches: R$ {total_batch_cost:,.2f}")
                print(f"   Entries: R$ {total_entry_cost:,.2f}")
            else:
                print(f"\n✅ Custos correspondentes: R$ {total_entry_cost:,.2f}")
        
        # Verificar produtos órfãos (sem batch e sem entry_item)
        result = await session.execute(
            select(func.count(Product.id))
            .where(Product.batch_id.is_(None))
            .where(Product.is_active == True)
        )
        products_without_batch = result.scalar()
        
        # Produtos com entry_item
        result = await session.execute(
            select(func.count(func.distinct(EntryItem.product_id)))
            .where(EntryItem.is_active == True)
        )
        products_with_items = result.scalar()
        
        orphan_products = products_without_batch - products_with_items
        
        if orphan_products > 0:
            print(f"\n⚠️  Produtos sem batch e sem entry_item: {orphan_products}")
            print("   → Esses produtos não estão rastreados no sistema de estoque")
        
        # ========== DETALHES ==========
        print("\n📋 DETALHES POR TIPO DE ENTRADA")
        print("-" * 70)
        
        # Contar por entry_type
        result = await session.execute(
            select(
                StockEntry.entry_type,
                func.count(StockEntry.id),
                func.sum(StockEntry.total_cost)
            )
            .where(StockEntry.is_active == True)
            .group_by(StockEntry.entry_type)
        )
        
        for entry_type, count, total in result:
            print(f"{entry_type.value:10s}: {count:3d} entradas, R$ {(total or 0):,.2f}")
        
        print("\n" + "="*70)
        print()


async def main():
    """Entry point do script"""
    try:
        await get_migration_status()
    except KeyboardInterrupt:
        print("\n\n⚠️  Cancelado pelo usuário.")
    except Exception as e:
        print(f"\n💥 Erro: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
