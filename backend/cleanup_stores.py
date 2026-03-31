#!/usr/bin/env python3
"""
Script para limpar stores duplicadas ou inválidas.
Mostra todas as stores, permite deletar as de teste.
"""
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.models.store import Store
from app.core.config import settings

async def list_stores():
    """Lista todas as stores ativas."""
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Pega todos os stores (incluindo soft-deleted)
        stmt = select(Store).order_by(Store.id)
        result = await session.execute(stmt)
        stores = result.scalars().all()
        
        print("\n" + "="*80)
        print("STORES NO BANCO DE DADOS")
        print("="*80)
        for store in stores:
            status = "❌ DELETADO" if not store.is_active else "✅ ATIVO"
            print(f"\nID: {store.id}")
            print(f"  Nome: {store.name}")
            print(f"  Slug: {store.slug}")
            print(f"  Subdomain: {store.subdomain or 'N/A'}")
            print(f"  Plano: {store.plan}")
            print(f"  Status: {status}")
            print(f"  Logo: {store.logo_path or 'Sem logo'}")
        
        print("\n" + "="*80)
        return stores
    
    await engine.dispose()

async def delete_store(store_id: int, hard_delete: bool = False):
    """Soft/hard delete de uma store."""
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        stmt = select(Store).where(Store.id == store_id)
        result = await session.execute(stmt)
        store = result.scalar_one_or_none()
        
        if not store:
            print(f"❌ Store {store_id} não encontrada")
            return
        
        if hard_delete:
            await session.delete(store)
            print(f"🗑️ Store '{store.name}' (ID: {store_id}) deletada permanentemente")
        else:
            store.is_active = False
            await session.merge(store)
            print(f"🗑️ Store '{store.name}' (ID: {store_id}) soft-deleted (is_active=False)")
        
        await session.commit()
    
    await engine.dispose()

async def rename_store(store_id: int, new_name: str):
    """Renomeia uma store."""
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        stmt = select(Store).where(Store.id == store_id)
        result = await session.execute(stmt)
        store = result.scalar_one_or_none()
        
        if not store:
            print(f"❌ Store {store_id} não encontrada")
            return
        
        old_name = store.name
        store.name = new_name
        await session.merge(store)
        await session.commit()
        print(f"✏️ Store renomeada: '{old_name}' → '{new_name}'")
    
    await engine.dispose()

async def main():
    """Menu interativo."""
    import sys
    
    print("\n🏪 LIMPEZA DE STORES - MENU INTERATIVO\n")
    
    # 1. Listar stores
    stores = await list_stores()
    
    if not stores:
        print("Nenhuma store encontrada!")
        return
    
    # Menu de ações
    print("\nOPÇÕES:")
    print("1. Renomear store (ex: Fitness Store)")
    print("2. Soft-delete store (marca is_active=False)")
    print("3. Hard-delete store (remove do banco)")
    print("0. Sair")
    
    while True:
        choice = input("\nEscolha uma opção (0-3): ").strip()
        
        if choice == "0":
            print("Saindo...")
            break
        
        elif choice == "1":
            store_id = input("ID da store: ").strip()
            new_name = input("Novo nome: ").strip()
            if store_id.isdigit():
                await rename_store(int(store_id), new_name)
            else:
                print("❌ ID inválido")
        
        elif choice == "2":
            store_id = input("ID da store para soft-delete: ").strip()
            if store_id.isdigit():
                await delete_store(int(store_id), hard_delete=False)
            else:
                print("❌ ID inválido")
        
        elif choice == "3":
            store_id = input("ID da store para hard-delete (CUIDADO!): ").strip()
            confirm = input(f"Confirmar hard-delete da store {store_id}? (sim/não): ").strip().lower()
            if confirm == "sim" and store_id.isdigit():
                await delete_store(int(store_id), hard_delete=True)
            else:
                print("❌ Cancelado")
        
        else:
            print("❌ Opção inválida")
        
        # Re-listar após mudanças
        if choice in ["1", "2", "3"]:
            print("\n--- Stores após mudanças ---")
            await list_stores()

if __name__ == "__main__":
    asyncio.run(main())
