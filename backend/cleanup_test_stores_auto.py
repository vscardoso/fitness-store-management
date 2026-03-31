#!/usr/bin/env python3
"""
Script automático para limpar stores de teste duplicadas.
Deleta as Test Store (IDs 1, 3, 5) e mantém apenas Fitness Store (ID 4).
"""
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.models.store import Store
from app.core.config import settings

async def cleanup_test_stores():
    """Remove duplicatas de Test Store automaticamente."""
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # IDs a deletar (soft-delete)
        ids_to_delete = [1, 3, 5]  # Todas as Test Store
        
        print("\n" + "="*80)
        print("🧹 LIMPEZA AUTOMÁTICA DE STORES DE TESTE")
        print("="*80)
        
        for store_id in ids_to_delete:
            stmt = select(Store).where(Store.id == store_id)
            result = await session.execute(stmt)
            store = result.scalar_one_or_none()
            
            if store and store.is_active:
                store.is_active = False
                await session.merge(store)
                print(f"✅ Soft-deleted: Store ID {store_id} - '{store.name}'")
            else:
                print(f"⏭️  Store ID {store_id} já deletada ou não existe")
        
        # Confirma a store válida
        stmt = select(Store).where(Store.id == 4)
        result = await session.execute(stmt)
        fitness_store = result.scalar_one_or_none()
        
        if fitness_store:
            print(f"\n✅ Store válida mantida:")
            print(f"   ID: {fitness_store.id}")
            print(f"   Nome: {fitness_store.name}")
            print(f"   Slug: {fitness_store.slug}")
            print(f"   Status: {'ATIVO' if fitness_store.is_active else 'DELETADO'}")
        
        await session.commit()
        print("\n" + "="*80)
        print("✅ Limpeza concluída! Use 'Fitness Store' para fazer login.")
        print("="*80 + "\n")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(cleanup_test_stores())
