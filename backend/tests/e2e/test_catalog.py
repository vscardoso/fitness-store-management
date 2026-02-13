"""
Script para testar se o catálogo está funcionando corretamente.

Verifica se todos os produtos catálogo são globais e se a API funciona.
"""
import asyncio
import logging
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, get_async_session
from app.models.product import Product
from app.services.product_service import ProductService

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_catalog():
    """Testa se o catálogo global está funcionando."""
    
    logger.info("🧪 Testando catálogo global")
    
    # Teste 1: Verificar produtos catálogo globais no banco
    async with engine.begin() as conn:
        # Contar produtos catálogo
        total_stmt = select(func.count(Product.id)).where(
            and_(Product.is_catalog == True, Product.is_active == True)
        )
        total_result = await conn.execute(total_stmt)
        total_catalog = total_result.scalar()
        
        # Contar produtos catálogo com tenant_id (deveria ser 0)
        with_tenant_stmt = select(func.count(Product.id)).where(
            and_(
                Product.is_catalog == True,
                Product.is_active == True,
                Product.tenant_id.isnot(None)
            )
        )
        with_tenant_result = await conn.execute(with_tenant_stmt)
        with_tenant_count = with_tenant_result.scalar()
        
        # Contar produtos catálogo globais (deveria ser igual ao total)
        global_stmt = select(func.count(Product.id)).where(
            and_(
                Product.is_catalog == True,
                Product.is_active == True,
                Product.tenant_id.is_(None)
            )
        )
        global_result = await conn.execute(global_stmt)
        global_count = global_result.scalar()
        
        logger.info(f"📊 RESULTADO DO TESTE:")
        logger.info(f"   📋 Total produtos catálogo: {total_catalog}")
        logger.info(f"   🌍 Produtos globais (tenant_id=null): {global_count}")
        logger.info(f"   🔒 Produtos com tenant_id: {with_tenant_count}")
        
        if with_tenant_count == 0 and global_count == total_catalog:
            logger.info("✅ SUCESSO: Todos os produtos catálogo são globais!")
        else:
            logger.error("❌ ERRO: Ainda existem produtos catálogo com tenant_id")
    
    # Teste 2: Verificar se o ProductService funciona para diferentes tenants
    logger.info("🧪 Testando ProductService para diferentes tenants")
    
    # Simular requisição de diferentes tenants
    test_tenants = [1, 2, 3, 999]  # IDs diferentes, incluindo um inexistente
    
    for tenant_id in test_tenants:
        async with get_async_session() as db:
            service = ProductService(db)
            try:
                products = await service.get_catalog_products(
                    tenant_id=tenant_id,
                    limit=5  # Pegar apenas 5 para o teste
                )
                logger.info(f"   🏢 Tenant {tenant_id}: {len(products)} produtos no catálogo")
                
                # Verificar se todos são globais
                for prod in products[:2]:  # Verificar os primeiros 2
                    if prod.tenant_id is not None:
                        logger.error(f"      ❌ Produto {prod.sku} tem tenant_id={prod.tenant_id}")
                    else:
                        logger.info(f"      ✅ Produto {prod.sku}: {prod.name} (global)")
                        
            except Exception as e:
                logger.error(f"   ❌ Tenant {tenant_id}: Erro - {e}")
    
    # Teste 3: Verificar se a pesquisa funciona
    logger.info("🧪 Testando pesquisa no catálogo")
    
    async with get_async_session() as db:
        service = ProductService(db)
        search_results = await service.get_catalog_products(
            tenant_id=1,  # Pode ser qualquer tenant
            search="Nike",
            limit=3
        )
        
        logger.info(f"🔍 Pesquisa por 'Nike': {len(search_results)} produtos encontrados")
        for prod in search_results:
            logger.info(f"   📦 {prod.sku}: {prod.name} (marca: {prod.brand})")


async def main():
    """Função principal."""
    try:
        await test_catalog()
        logger.info("🎉 Teste do catálogo concluído!")
    except Exception as e:
        logger.error(f"❌ Erro durante teste: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())