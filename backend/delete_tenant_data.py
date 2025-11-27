"""
Script para deletar (soft delete) todas as entradas e produtos de um tenant específico.
Uso: python delete_tenant_data.py
"""

import asyncio
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.product import Product
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem
from app.models.user import User


async def get_current_tenant() -> int:
    """Pega o primeiro usuário ativo para obter o tenant_id."""
    async with async_session_maker() as db:
        result = await db.execute(
            select(User).where(User.is_active == True).limit(1)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("Nenhum usuário ativo encontrado")
        return user.tenant_id


async def delete_all_entries_and_products(tenant_id: int):
    """
    Deleta (soft delete) todas as entradas de estoque e produtos do tenant.
    
    Args:
        tenant_id: ID do tenant
    """
    async with async_session_maker() as db:
        try:
            print(f"\n🔍 Buscando dados do tenant {tenant_id}...")
            
            # 1. Contar registros antes
            entries_result = await db.execute(
                select(StockEntry).where(
                    StockEntry.tenant_id == tenant_id,
                    StockEntry.is_active == True
                )
            )
            entries_count = len(entries_result.scalars().all())
            
            products_result = await db.execute(
                select(Product).where(
                    Product.tenant_id == tenant_id,
                    Product.is_active == True
                )
            )
            products_count = len(products_result.scalars().all())
            
            print(f"📦 Encontrado:")
            print(f"   - {entries_count} entradas de estoque ativas")
            print(f"   - {products_count} produtos ativos")
            
            if entries_count == 0 and products_count == 0:
                print("✅ Nenhum dado para deletar!")
                return
            
            # Confirmar ação
            print(f"\n⚠️  ATENÇÃO: Esta ação vai desativar (soft delete):")
            print(f"   - Todas as {entries_count} entradas de estoque")
            print(f"   - Todos os {products_count} produtos")
            print(f"   - Do tenant ID: {tenant_id}")
            
            confirm = input("\n❓ Confirma a operação? (digite 'SIM' para confirmar): ")
            if confirm != "SIM":
                print("❌ Operação cancelada!")
                return
            
            # 2. Soft delete das entradas e seus items
            print(f"\n🗑️  Deletando entry_items e entradas de estoque...")
            
            # Soft delete de TODOS os entry_items ativos do tenant (não apenas os de entries ativas)
            entry_items_result = await db.execute(
                update(EntryItem)
                .where(
                    EntryItem.tenant_id == tenant_id,
                    EntryItem.is_active == True
                )
                .values(is_active=False)
            )
            entry_items_updated = entry_items_result.rowcount
            print(f"   ✅ {entry_items_updated} entry_items desativados")
            
            # Soft delete das stock entries
            if entries_count > 0:
                await db.execute(
                    update(StockEntry)
                    .where(
                        StockEntry.tenant_id == tenant_id,
                        StockEntry.is_active == True
                    )
                    .values(is_active=False)
                )
                print(f"   ✅ {entries_count} stock_entries desativadas")
            
            # 3. Soft delete dos produtos
            if products_count > 0:
                print(f"\n🗑️  Deletando produtos...")
                await db.execute(
                    update(Product)
                    .where(
                        Product.tenant_id == tenant_id,
                        Product.is_active == True
                    )
                    .values(is_active=False)
                )
                print(f"   ✅ {products_count} produtos desativados")
            
            # 4. Commit
            await db.commit()
            
            print(f"\n✅ Operação concluída com sucesso!")
            print(f"   - {entries_count} entradas desativadas")
            print(f"   - {products_count} produtos desativados")
            print(f"   - Tenant ID: {tenant_id}")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ Erro ao deletar dados: {e}")
            raise


async def main():
    """Função principal."""
    print("=" * 60)
    print("🗑️  DELETE DE ENTRADAS E PRODUTOS DO TENANT")
    print("=" * 60)
    
    try:
        # Obter tenant_id
        tenant_id = await get_current_tenant()
        print(f"\n🏢 Tenant ID encontrado: {tenant_id}")
        
        # Deletar dados
        await delete_all_entries_and_products(tenant_id)
        
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        return 1
    
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
