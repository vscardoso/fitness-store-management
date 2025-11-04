"""
Script de teste rápido para verificar se a correção do initial_quantity funciona.
Execute: python test_product_fix.py
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models.product import Product
from app.services.product_service import ProductService
from app.schemas.product import ProductCreate


async def test_create_product():
    """Testar criação de produto com initial_quantity."""
    
    # Criar engine de teste
    engine = create_async_engine(
        "sqlite+aiosqlite:///./fitness_store.db",
        echo=True
    )
    
    # Criar sessão
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        # Criar service
        product_service = ProductService(session)
        
        # Dados do produto
        product_data = ProductCreate(
            name="Teste Product Fix",
            sku=f"TEST-FIX-{asyncio.get_event_loop().time()}",
            description="Produto de teste para verificar correção",
            price=19.90,
            cost_price=9.00,
            category_id=2,
            brand="Nike",
            initial_stock=10,
            min_stock=5,
            is_activewear=True
        )
        
        try:
            # Criar produto
            print("\n🧪 Testando criação de produto...")
            product = await product_service.create_product(
                product_data,
                initial_quantity=10,
                min_stock=5
            )
            
            print(f"\n✅ Produto criado com sucesso!")
            print(f"   ID: {product.id}")
            print(f"   Nome: {product.name}")
            print(f"   SKU: {product.sku}")
            print(f"   Initial Quantity: {product.initial_quantity}")
            
            # Commit
            await session.commit()
            
            print("\n✅ CORREÇÃO FUNCIONANDO! O campo initial_quantity foi preenchido.")
            
        except Exception as e:
            print(f"\n❌ ERRO: {str(e)}")
            print("\n⚠️  O backend precisa ser reiniciado para aplicar a correção!")
            await session.rollback()
        
        finally:
            await engine.dispose()


if __name__ == "__main__":
    print("=" * 80)
    print("🔧 TESTE DE CORREÇÃO: products.initial_quantity")
    print("=" * 80)
    
    asyncio.run(test_create_product())
    
    print("\n" + "=" * 80)
    print("Se o teste falhou, REINICIE o backend:")
    print("   1. Ctrl+C no terminal do backend")
    print("   2. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000")
    print("=" * 80)
