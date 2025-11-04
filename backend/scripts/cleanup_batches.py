"""
Script de limpeza: Remove batches após validação da migração

⚠️  EXECUTAR APENAS APÓS VALIDAR que a migração funcionou corretamente!

Este script:
1. Remove referências batch_id dos produtos
2. Faz soft delete dos batches
3. Mantém dados históricos (não deleta fisicamente)

Executar com: python scripts/cleanup_batches.py
"""

import sys
import asyncio
from pathlib import Path
from datetime import datetime

# Adicionar o diretório raiz ao path
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

from sqlalchemy import select, func, update

from app.core.database import async_session_maker, engine
from app.models import Batch, Product, StockEntry


async def cleanup_batches():
    """Remove referências de batches após migração validada"""
    
    print("\n" + "="*70)
    print("🧹 SCRIPT DE LIMPEZA: REMOÇÃO DE BATCHES")
    print("="*70)
    print("\n⚠️  ATENÇÃO:")
    print("  • Este script irá remover as referências de batches")
    print("  • Os dados serão apenas desativados (soft delete)")
    print("  • As referências batch_id nos produtos serão removidas")
    print("  • EXECUTE APENAS se a migração foi validada e está funcionando!")
    print("\n" + "="*70 + "\n")
    
    # Verificar se existem stock_entries
    async with async_session_maker() as session:
        result = await session.execute(select(func.count(StockEntry.id)))
        entry_count = result.scalar()
        
        if entry_count == 0:
            print("❌ ERRO: Nenhum StockEntry encontrado!")
            print("   Execute a migração primeiro: python scripts/migrate_batch_to_entry.py")
            return
        
        print(f"✓ Encontrados {entry_count} StockEntries migrados\n")
    
    # Confirmar múltiplas vezes (segurança)
    response = input("⚠️  Tem certeza que validou a migração? (digite 'SIM' para confirmar): ").strip()
    if response != "SIM":
        print("\n❌ Limpeza cancelada.")
        return
    
    response = input("\n⚠️  ÚLTIMA CONFIRMAÇÃO - Deseja realmente limpar os batches? (s/n): ").strip().lower()
    if response != 's':
        print("\n❌ Limpeza cancelada.")
        return
    
    print("\n🚀 Iniciando limpeza...\n")
    
    async with async_session_maker() as session:
        try:
            # 1. Contar produtos com batch_id
            result = await session.execute(
                select(func.count(Product.id)).where(Product.batch_id.isnot(None))
            )
            product_count = result.scalar()
            
            print(f"📦 Produtos com batch_id: {product_count}")
            
            # 2. Remover batch_id dos produtos
            if product_count > 0:
                await session.execute(
                    update(Product)
                    .where(Product.batch_id.isnot(None))
                    .values(batch_id=None, updated_at=datetime.utcnow())
                )
                print(f"  ✓ batch_id removido de {product_count} produtos")
            
            # 3. Contar batches ativos
            result = await session.execute(
                select(func.count(Batch.id)).where(Batch.is_active == True)
            )
            batch_count = result.scalar()
            
            print(f"\n🗑️  Batches ativos: {batch_count}")
            
            # 4. Desativar batches (soft delete)
            if batch_count > 0:
                await session.execute(
                    update(Batch)
                    .where(Batch.is_active == True)
                    .values(is_active=False, updated_at=datetime.utcnow())
                )
                print(f"  ✓ {batch_count} batches desativados")
            
            # Commit
            await session.commit()
            
            print("\n" + "="*70)
            print("✅ LIMPEZA CONCLUÍDA COM SUCESSO!")
            print("="*70)
            print("\n📊 Resumo:")
            print(f"  • Produtos atualizados: {product_count}")
            print(f"  • Batches desativados: {batch_count}")
            print(f"  • StockEntries mantidos: {entry_count}")
            print("\n💡 Os dados de batches ainda existem no banco (soft delete)")
            print("   Podem ser recuperados se necessário alterando is_active para True")
            print()
            
        except Exception as e:
            await session.rollback()
            print(f"\n❌ ERRO: {e}")
            print("   Operação revertida (rollback)")
            raise


async def main():
    """Entry point do script"""
    try:
        await cleanup_batches()
    except KeyboardInterrupt:
        print("\n\n⚠️  Limpeza cancelada pelo usuário.")
    except Exception as e:
        print(f"\n💥 Erro fatal: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
