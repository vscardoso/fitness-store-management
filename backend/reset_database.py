"""
Script para limpar todas as tabelas do banco de dados PostgreSQL.
ATENÇÃO: Este script irá APAGAR TODOS OS DADOS!
"""
import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker


async def reset_database():
    """Limpa todas as tabelas do banco de dados."""
    
    async with async_session_maker() as db:
        try:
            print("🗑️  Limpando banco de dados...")
            
            # Lista de tabelas na ordem correta (respeitando foreign keys)
            tables_to_clean = [
                "inventory_movements",
                "inventory",
                "entry_items",
                "stock_entries",
                "payments",
                "sale_items",
                "sales",
                "trips",
                "products",
                "categories",
                "customers",
                "subscriptions",
                "users",
                "stores",
            ]
            
            # Desabilitar checks temporariamente para limpar
            await db.execute(text("SET session_replication_role = 'replica';"))
            
            for table in tables_to_clean:
                try:
                    result = await db.execute(text(f"DELETE FROM {table}"))
                    count = result.rowcount
                    print(f"  ✓ {table}: {count} registros removidos")
                except Exception as e:
                    print(f"  ⚠️ {table}: {e}")
            
            # Reabilitar checks
            await db.execute(text("SET session_replication_role = 'origin';"))
            
            # Resetar sequências (IDs)
            print("\n🔄 Resetando sequências de IDs...")
            for table in tables_to_clean:
                try:
                    await db.execute(text(f"ALTER SEQUENCE {table}_id_seq RESTART WITH 1"))
                    print(f"  ✓ {table}_id_seq resetado")
                except Exception:
                    pass  # Algumas tabelas podem não ter sequence
            
            await db.commit()
            
            print("\n✅ Banco de dados limpo com sucesso!")
            print("📊 Todas as tabelas foram esvaziadas e IDs resetados para 1")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ Erro ao limpar banco: {e}")
            raise


if __name__ == "__main__":
    print("⚠️  ATENÇÃO: Este script irá APAGAR TODOS OS DADOS do banco!")
    print("Você tem 5 segundos para cancelar (Ctrl+C)...")
    
    import time
    for i in range(5, 0, -1):
        print(f"{i}...")
        time.sleep(1)
    
    asyncio.run(reset_database())
