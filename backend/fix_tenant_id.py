"""
Script para adicionar coluna tenant_id em tabelas que estão faltando (PostgreSQL).
"""
import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker

async def fix_tenant_id():
    """Adiciona tenant_id em todas as tabelas necessárias."""
    
    # Lista de tabelas que precisam de tenant_id
    tables = [
        "products",
        "categories",
        "customers",
        "sales",
        "sale_items",
        "payments",
        "inventory",
        "inventory_movements",
        "stock_entries",
        "entry_items",
        "trips",
        "users",
    ]
    
    async with async_session_maker() as db:
        # Verificar se stores existe e pegar ID da loja default
        try:
            result = await db.execute(text("SELECT id FROM stores WHERE slug = 'default' LIMIT 1"))
            default_store = result.scalar()
            
            if not default_store:
                print("❌ Loja default não encontrada. Criando...")
                await db.execute(text("""
                    INSERT INTO stores (name, slug, domain, is_default, is_active, created_at, updated_at)
                    VALUES ('Default Store', 'default', NULL, TRUE, TRUE, NOW(), NOW())
                """))
                await db.commit()
                
                result = await db.execute(text("SELECT id FROM stores WHERE slug = 'default' LIMIT 1"))
                default_store = result.scalar()
            
            print(f"✅ Loja default encontrada: ID {default_store}")
            
        except Exception as e:
            print(f"⚠️ Erro ao verificar stores: {e}")
            print("Tentando criar tabela stores...")
            
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS stores (
                    id SERIAL PRIMARY KEY,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    is_active BOOLEAN DEFAULT TRUE,
                    tenant_id INTEGER,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(100) NOT NULL UNIQUE,
                    domain VARCHAR(255),
                    is_default BOOLEAN DEFAULT FALSE,
                    subdomain VARCHAR(100),
                    plan VARCHAR(20) DEFAULT 'free',
                    trial_ends_at TIMESTAMP WITH TIME ZONE
                )
            """))
            await db.commit()
            
            await db.execute(text("""
                INSERT INTO stores (name, slug, domain, is_default, is_active, created_at, updated_at)
                VALUES ('Default Store', 'default', NULL, TRUE, TRUE, NOW(), NOW())
            """))
            await db.commit()
            
            result = await db.execute(text("SELECT id FROM stores WHERE slug = 'default' LIMIT 1"))
            default_store = result.scalar()
            print(f"✅ Stores criada. ID default: {default_store}")
        
        # Para cada tabela, tentar adicionar tenant_id
        for table in tables:
            try:
                # Verificar se coluna já existe
                result = await db.execute(text(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = '{table}' AND column_name = 'tenant_id'
                """))
                
                if result.scalar():
                    print(f"✓ {table}.tenant_id já existe")
                    continue
                
                print(f"⚙️ Adicionando tenant_id em {table}...")
                
                # Adicionar coluna
                await db.execute(text(f"""
                    ALTER TABLE {table}
                    ADD COLUMN tenant_id INTEGER
                """))
                
                # Criar índice
                await db.execute(text(f"""
                    CREATE INDEX IF NOT EXISTS ix_{table}_tenant_id 
                    ON {table} (tenant_id)
                """))
                
                # Adicionar foreign key
                await db.execute(text(f"""
                    ALTER TABLE {table}
                    ADD CONSTRAINT fk_{table}_tenant_id_stores
                    FOREIGN KEY (tenant_id) REFERENCES stores(id)
                    ON DELETE RESTRICT
                """))
                
                # Preencher com loja default
                await db.execute(text(f"""
                    UPDATE {table}
                    SET tenant_id = :tid
                    WHERE tenant_id IS NULL
                """), {"tid": default_store})
                
                await db.commit()
                print(f"✅ {table}.tenant_id adicionado e preenchido")
                
            except Exception as e:
                await db.rollback()
                print(f"❌ Erro em {table}: {e}")
                continue
        
        print("\n✅ Processo concluído!")
        print(f"📊 tenant_id configurado em {len(tables)} tabelas")
        print(f"🏪 Todas apontando para store ID: {default_store}")

if __name__ == "__main__":
    asyncio.run(fix_tenant_id())
