"""
Script para migrar produtos catálogo existentes para globais.

Este script corrige produtos que foram criados com is_catalog=True mas
possuem tenant_id específico. O catálogo deve ser global (tenant_id=null).

Execute APENAS UMA VEZ para corrigir a inconsistência.
"""
import asyncio
import logging
from sqlalchemy import update, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine
from app.models.product import Product

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_catalog_to_global():
    """Migra produtos catálogo para terem tenant_id=null (globais)."""
    
    logger.info("🔄 Iniciando migração: produtos catálogo → globais")
    
    async with engine.begin() as conn:
        # 1. Contar produtos catálogo que possuem tenant_id
        count_stmt = select(Product.id).where(
            and_(
                Product.is_catalog == True,
                Product.tenant_id.isnot(None)  # Produtos catálogo com tenant_id
            )
        )
        
        count_result = await conn.execute(count_stmt)
        products_to_migrate = len(list(count_result.scalars().all()))
        
        if products_to_migrate == 0:
            logger.info("✅ Nenhum produto catálogo para migrar")
            return
        
        logger.info(f"📋 Encontrados {products_to_migrate} produtos catálogo para migrar")
        
        # 2. Atualizar produtos catálogo para tenant_id=null
        update_stmt = update(Product).where(
            and_(
                Product.is_catalog == True,
                Product.tenant_id.isnot(None)
            )
        ).values(tenant_id=None)
        
        update_result = await conn.execute(update_stmt)
        
        logger.info(f"✅ {update_result.rowcount} produtos catálogo migrados para globais")
        
        # 3. Verificar resultado final
        final_count_stmt = select(Product.id).where(
            and_(
                Product.is_catalog == True,
                Product.is_active == True
            )
        )
        
        final_result = await conn.execute(final_count_stmt)
        global_catalog_count = len(list(final_result.scalars().all()))
        
        logger.info(f"🌍 Total de produtos no catálogo global: {global_catalog_count}")
        
        # 4. Verificar se ainda existem produtos catálogo com tenant_id
        remaining_stmt = select(Product.id).where(
            and_(
                Product.is_catalog == True,
                Product.tenant_id.isnot(None)
            )
        )
        
        remaining_result = await conn.execute(remaining_stmt)
        remaining_count = len(list(remaining_result.scalars().all()))
        
        if remaining_count == 0:
            logger.info("🎉 Todos os produtos catálogo são agora globais!")
        else:
            logger.warning(f"⚠️  Ainda restam {remaining_count} produtos catálogo com tenant_id")


async def main():
    """Função principal."""
    try:
        await migrate_catalog_to_global()
        logger.info("🎉 Migração concluída com sucesso!")
    except Exception as e:
        logger.error(f"❌ Erro durante migração: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())