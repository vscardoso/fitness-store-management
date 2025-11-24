"""Fix categories unique constraint"""
import asyncio
from sqlalchemy import text
from app.core.database import engine

async def fix_constraint():
    async with engine.begin() as conn:
        print("Removendo index incorreto...")
        await conn.execute(text('DROP INDEX IF EXISTS ix_categories_slug'))
        
        print("Criando index correto (tenant_id + slug)...")
        await conn.execute(text(
            'CREATE UNIQUE INDEX uq_categories_tenant_slug ON categories (tenant_id, slug)'
        ))
        
        print("✅ Constraint corrigida! Agora cada tenant pode ter slugs próprios.")

asyncio.run(fix_constraint())
