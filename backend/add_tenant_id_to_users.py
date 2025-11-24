"""
Add tenant_id column to users table manually
"""
import asyncio
from app.core.database import engine


async def add_tenant_id_column():
    print("\n🔧 Adicionando coluna tenant_id na tabela users...")
    
    async with engine.begin() as conn:
        # Add column
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER"
        )
        print("✅ Coluna tenant_id adicionada")
        
        # Add foreign key
        try:
            await conn.exec_driver_sql(
                "ALTER TABLE users ADD CONSTRAINT fk_users_tenant_id "
                "FOREIGN KEY (tenant_id) REFERENCES stores(id)"
            )
            print("✅ Foreign key adicionada")
        except Exception as e:
            if 'already exists' in str(e).lower():
                print("ℹ️  Foreign key já existe")
            else:
                print(f"⚠️  Erro ao adicionar foreign key: {e}")
        
        # Add index
        try:
            await conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users(tenant_id)"
            )
            print("✅ Índice adicionado")
        except Exception as e:
            print(f"⚠️  Erro ao adicionar índice: {e}")
    
    print("\n✅ Concluído!\n")


if __name__ == "__main__":
    asyncio.run(add_tenant_id_column())
