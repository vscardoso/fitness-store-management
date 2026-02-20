#!/usr/bin/env python3
"""
Script para aplicar a migração de variantes diretamente via SQLAlchemy.
Funciona tanto localmente quanto em producao.
"""
import asyncio
import sys
import os

# Adicionar o diretorio backend ao path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

# Mudar o diretorio de trabalho para backend
os.chdir(backend_dir)

from sqlalchemy import text
from app.core.database import async_session_maker


# SQL statements para SQLite (executados um por um)
SQL_STATEMENTS = [
    # 1. Criar tabela product_variants
    """
    CREATE TABLE IF NOT EXISTS product_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        sku VARCHAR(50) NOT NULL,
        size VARCHAR(20),
        color VARCHAR(50),
        price NUMERIC(10, 2) NOT NULL,
        cost_price NUMERIC(10, 2),
        image_url VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN NOT NULL DEFAULT 0,
        deleted_at TIMESTAMP
    )
    """,
    # Indices
    "CREATE INDEX IF NOT EXISTS ix_product_variants_sku ON product_variants(sku)",
    "CREATE INDEX IF NOT EXISTS ix_product_variants_product_id ON product_variants(product_id)",
    "CREATE INDEX IF NOT EXISTS ix_product_variants_tenant_id ON product_variants(tenant_id)",
    # Constraints unicas
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_product_size_color ON product_variants(product_id, size, color)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_variants_tenant_sku ON product_variants(tenant_id, sku)",
    # Adicionar colunas nas tabelas existentes
    "ALTER TABLE entry_items ADD COLUMN variant_id INTEGER",
    "ALTER TABLE inventory ADD COLUMN variant_id INTEGER",
    "ALTER TABLE sale_items ADD COLUMN variant_id INTEGER",
    "ALTER TABLE return_items ADD COLUMN variant_id INTEGER",
    "ALTER TABLE products ADD COLUMN base_price NUMERIC(10, 2)",
]


async def apply_migration():
    """Aplica a migracao de variantes."""
    print("=" * 60)
    print("APLICANDO MIGRACAO DE VARIANTES DE PRODUTO")
    print("=" * 60)
    
    async with async_session_maker() as session:
        success_count = 0
        
        for i, sql in enumerate(SQL_STATEMENTS, 1):
            try:
                await session.execute(text(sql))
                await session.commit()
                
                # Extrair tipo de operacao do SQL
                sql_upper = sql.strip().upper()
                if sql_upper.startswith("CREATE TABLE"):
                    msg = "Criando tabela product_variants..."
                elif sql_upper.startswith("CREATE UNIQUE INDEX"):
                    msg = "Adicionando constraint unica..."
                elif sql_upper.startswith("CREATE INDEX"):
                    msg = "Criando indice..."
                elif sql_upper.startswith("ALTER TABLE"):
                    table = sql_upper.split("ALTER TABLE")[1].split("ADD")[0].strip()
                    msg = f"Adicionando coluna em {table}..."
                else:
                    msg = f"Executando statement {i}..."
                
                print(f"  [{i}/{len(SQL_STATEMENTS)}] {msg} [OK]")
                success_count += 1
                
            except Exception as e:
                # Ignorar erros de coluna ja existente
                error_msg = str(e).lower()
                if "duplicate column" in error_msg or "already exists" in error_msg:
                    print(f"  [{i}/{len(SQL_STATEMENTS)}] Ja existe, pulando...")
                    success_count += 1
                else:
                    print(f"  [{i}/{len(SQL_STATEMENTS)}] ERRO: {e}")
                    await session.rollback()
        
        # Verificar resultado
        try:
            result = await session.execute(text("SELECT COUNT(*) FROM product_variants"))
            count = result.scalar()
        except:
            count = 0
        
        print("\n" + "=" * 60)
        print("MIGRACAO CONCLUIDA!")
        print("=" * 60)
        print(f"\nStatements executados: {success_count}/{len(SQL_STATEMENTS)}")
        print(f"Tabela product_variants: {count} registros")
        print("\nColunas adicionadas:")
        print("   - entry_items.variant_id")
        print("   - inventory.variant_id")
        print("   - sale_items.variant_id")
        print("   - return_items.variant_id")
        print("   - products.base_price")


if __name__ == '__main__':
    asyncio.run(apply_migration())