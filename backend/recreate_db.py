"""Script para recriar o banco de dados com o schema atualizado."""
import asyncio
import os
from pathlib import Path

async def recreate_database():
    """Recria o banco de dados deletando o antigo."""
    
    # Deletar banco antigo
    db_path = Path("fitness_store.db")
    if db_path.exists():
        print(f"🗑️  Deletando banco antigo: {db_path}")
        db_path.unlink()
    
    # Importar após deletar para não ter lock
    from app.core.database import engine, init_db
    from app.models.base import BaseModel
    
    print("📦 Criando novo banco com schema atualizado...")
    
    # Criar todas as tabelas
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    
    print("✅ Banco de dados recriado com sucesso!")
    print("\n📋 Tabelas criadas:")
    print("  - users")
    print("  - categories")
    print("  - products (COM todas as colunas: gender, material, etc.)")
    print("  - inventory")
    print("  - inventory_movements")
    print("  - customers")
    print("  - sales")
    print("  - sale_items")
    print("  - payments")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(recreate_database())
