"""
Script para aplicar migrations e adicionar as novas tabelas ao banco.
"""
import sys
import asyncio
from pathlib import Path

# Adicionar diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text
from app.core.database import engine, async_session_maker
from app.models.base import Base
from app.models.trip import Trip
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem


async def create_tables():
    """Cria as novas tabelas no banco."""
    print("🔄 Criando tabelas...")
    
    async with engine.begin() as conn:
        # Criar apenas as novas tabelas
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
    
    print("✅ Tabelas criadas com sucesso!")


async def verify_tables():
    """Verifica se as tabelas foram criadas."""
    print("\n🔍 Verificando tabelas...")
    
    async with async_session_maker() as session:
        try:
            # Verificar trips
            result = await session.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='trips'"))
            if result.scalar():
                print("✅ Tabela 'trips' criada")
            else:
                print("❌ Tabela 'trips' não encontrada")
            
            # Verificar stock_entries
            result = await session.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_entries'"))
            if result.scalar():
                print("✅ Tabela 'stock_entries' criada")
            else:
                print("❌ Tabela 'stock_entries' não encontrada")
            
            # Verificar entry_items
            result = await session.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='entry_items'"))
            if result.scalar():
                print("✅ Tabela 'entry_items' criada")
            else:
                print("❌ Tabela 'entry_items' não encontrada")
                
        except Exception as e:
            print(f"❌ Erro ao verificar tabelas: {e}")


async def main():
    """Função principal."""
    print("=" * 60)
    print("MIGRATION: Adicionar Trip System")
    print("=" * 60)
    
    try:
        await create_tables()
        await verify_tables()
        
        print("\n" + "=" * 60)
        print("✅ Migration concluída com sucesso!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Erro durante migration: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
