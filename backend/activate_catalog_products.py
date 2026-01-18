"""
Script para ativar produtos do catálogo (mudar is_catalog de True para False)
Isso permite que os produtos apareçam no PDV e em envios condicionais
"""
import asyncio
from sqlalchemy import select, update
from app.core.database import async_session_maker
from app.models.product import Product

async def activate_products():
    async with async_session_maker() as db:
        # Buscar produtos do catálogo
        result = await db.execute(
            select(Product).where(Product.is_catalog == True)
        )
        catalog_products = result.scalars().all()
        
        if not catalog_products:
            print('❌ Nenhum produto de catálogo encontrado')
            return
        
        print(f'📦 Encontrados {len(catalog_products)} produtos de catálogo')
        print('🔄 Ativando produtos...\n')
        
        # Atualizar todos para is_catalog=False
        await db.execute(
            update(Product)
            .where(Product.is_catalog == True)
            .values(is_catalog=False)
        )
        await db.commit()
        
        # Verificar resultados
        result_after = await db.execute(
            select(Product).where(Product.is_catalog == False, Product.is_active == True)
        )
        active_products = result_after.scalars().all()
        
        print(f'✅ {len(active_products)} produtos agora disponíveis para venda!')
        print('\nPrimeiros 10 produtos ativados:')
        for product in active_products[:10]:
            print(f'  - {product.id}: {product.name}')

if __name__ == '__main__':
    print('🚀 Iniciando ativação de produtos do catálogo...\n')
    asyncio.run(activate_products())
    print('\n✅ Processo concluído!')
