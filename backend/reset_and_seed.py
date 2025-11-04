"""
Script para resetar banco e popular com dados iniciais.
Execução única para ambiente limpo.
"""
import asyncio
import os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine

# Database path
DB_PATH = Path(__file__).parent / "fitness_store.db"
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"


async def reset_database():
    """Remove banco existente e recria todas as tabelas."""
    from app.models.base import BaseModel
    
    print("🗑️  Removendo banco antigo...")
    if DB_PATH.exists():
        DB_PATH.unlink()
        print("   ✓ Banco removido")
    else:
        print("   ℹ️  Banco não existia")
    
    print("\n📦 Criando tabelas...")
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    
    await engine.dispose()
    print("   ✓ Tabelas criadas")


async def create_admin_user():
    """Cria usuário administrador."""
    from app.core.database import async_session_maker
    from app.core.security import get_password_hash
    from app.models.user import User
    
    print("\n👤 Criando usuário admin...")
    
    async with async_session_maker() as session:
        user = User(
            email="admin@fitness.com",
            hashed_password=get_password_hash("admin123"),
            full_name="Administrador",
            role="admin",
            is_active=True
        )
        session.add(user)
        await session.commit()
    
    print("   ✓ Admin criado: admin@fitness.com / admin123")


async def create_categories():
    """Cria categorias padrão."""
    from app.core.database import async_session_maker
    from app.models.category import Category
    
    print("\n📁 Criando categorias...")
    
    categories_data = [
        {"name": "Suplementos", "slug": "suplementos", "description": "Suplementos alimentares e proteínas"},
        {"name": "Roupas Femininas", "slug": "roupas-femininas", "description": "Roupas fitness femininas"},
        {"name": "Roupas Masculinas", "slug": "roupas-masculinas", "description": "Roupas fitness masculinas"},
        {"name": "Acessórios", "slug": "acessorios", "description": "Acessórios para treino"},
        {"name": "Calçados", "slug": "calcados", "description": "Tênis e calçados esportivos"},
        {"name": "Equipamentos", "slug": "equipamentos", "description": "Equipamentos de treino"},
    ]
    
    async with async_session_maker() as session:
        for cat_data in categories_data:
            category = Category(**cat_data)
            session.add(category)
            print(f"   + {cat_data['name']}")
        
        await session.commit()
    
    print(f"   ✓ {len(categories_data)} categorias criadas")


async def create_sample_products():
    """Cria produtos de exemplo com estoque."""
    from app.core.database import async_session_maker
    from app.models.product import Product
    from app.models.inventory import Inventory
    from app.models.category import Category
    from sqlalchemy import select
    
    print("\n📦 Criando produtos de exemplo...")
    
    async with async_session_maker() as session:
        # Buscar categorias
        result = await session.execute(select(Category))
        categories = {cat.name: cat.id for cat in result.scalars().all()}
        
        products_data = [
            # Roupas Femininas (2 com estoque baixo, 1 OK)
            {
                "name": "Legging Fitness Preta",
                "sku": "LEG-FIT-001",
                "barcode": "7891234567001",
                "description": "Legging de alta compressão",
                "brand": "Nike",
                "category_id": categories.get("Roupas Femininas", 1),
                "cost_price": 50.00,
                "price": 120.00,
                "stock": 3,  # Baixo (min = 10)
                "min_stock": 10
            },
            {
                "name": "Top Esportivo Rosa",
                "sku": "TOP-ESP-002",
                "barcode": "7891234567002",
                "description": "Top esportivo com sustentação média",
                "brand": "Adidas",
                "category_id": categories.get("Roupas Femininas", 1),
                "cost_price": 35.00,
                "price": 89.90,
                "stock": 5,  # Baixo (min = 15)
                "min_stock": 15
            },
            {
                "name": "Conjunto Fitness Azul",
                "sku": "CON-FIT-003",
                "barcode": "7891234567003",
                "description": "Conjunto completo: legging + top",
                "brand": "Puma",
                "category_id": categories.get("Roupas Femininas", 1),
                "cost_price": 80.00,
                "price": 189.90,
                "stock": 25,  # OK (min = 8)
                "min_stock": 8
            },
            
            # Roupas Masculinas (1 baixo, 1 OK)
            {
                "name": "Regata Dry Fit Preta",
                "sku": "REG-DRY-004",
                "barcode": "7891234567004",
                "description": "Regata com tecnologia de secagem rápida",
                "brand": "Nike",
                "category_id": categories.get("Roupas Masculinas", 2),
                "cost_price": 25.00,
                "price": 69.90,
                "stock": 8,  # Baixo (min = 20)
                "min_stock": 20
            },
            {
                "name": "Shorts de Corrida Azul",
                "sku": "SHO-COR-005",
                "barcode": "7891234567005",
                "description": "Shorts leve para corrida e treinos",
                "brand": "Adidas",
                "category_id": categories.get("Roupas Masculinas", 2),
                "cost_price": 30.00,
                "price": 79.90,
                "stock": 18,  # OK (min = 15)
                "min_stock": 15
            },
            
            # Calçados (todos OK)
            {
                "name": "Tênis Running Pro",
                "sku": "TEN-RUN-006",
                "barcode": "7891234567006",
                "description": "Tênis de corrida profissional",
                "brand": "Nike",
                "category_id": categories.get("Calçados", 3),
                "cost_price": 180.00,
                "price": 399.90,
                "stock": 10,  # OK (min = 5)
                "min_stock": 5
            },
            
            # Acessórios (1 baixo)
            {
                "name": "Garrafa Térmica 1L",
                "sku": "GAR-TER-008",
                "barcode": "7891234567008",
                "description": "Garrafa térmica de aço inox",
                "brand": "Coleman",
                "category_id": categories.get("Acessórios", 4),
                "cost_price": 40.00,
                "price": 89.90,
                "stock": 12,  # Baixo (min = 20)
                "min_stock": 20
            },
            
            # Suplementos (1 OK)
            {
                "name": "Whey Protein 1kg Baunilha",
                "sku": "WHE-PRO-011",
                "barcode": "7891234567011",
                "description": "Whey protein concentrado",
                "brand": "Optimum Nutrition",
                "category_id": categories.get("Suplementos", 5),
                "cost_price": 80.00,
                "price": 159.90,
                "stock": 15,  # OK (min = 8)
                "min_stock": 8
            },
        ]
        
        created = 0
        low_stock_count = 0
        
        for prod_data in products_data:
            # Extrair dados de estoque
            stock_qty = prod_data.pop("stock")
            min_stock = prod_data.pop("min_stock")
            
            # Criar produto
            product = Product(**prod_data)
            session.add(product)
            await session.flush()  # Gera o ID
            
            # Criar inventário
            inventory = Inventory(
                product_id=product.id,
                quantity=stock_qty,
                min_stock=min_stock,
                max_stock=min_stock * 3
            )
            session.add(inventory)
            
            created += 1
            status_icon = "⚠️" if stock_qty <= min_stock else "✓"
            print(f"   {status_icon} {prod_data['name']} (estoque: {stock_qty}/{min_stock})")
            
            if stock_qty <= min_stock:
                low_stock_count += 1
        
        await session.commit()
        
        print(f"\n   ✅ {created} produtos criados")
        print(f"   📊 {low_stock_count} produtos com estoque baixo (vão aparecer na tela)")


async def main():
    """Executa todo o processo de reset e seed."""
    print("=" * 60)
    print("🚀 RESET E SEED DO BANCO DE DADOS")
    print("=" * 60)
    
    try:
        await reset_database()
        await create_admin_user()
        await create_categories()
        await create_sample_products()
        
        print("\n" + "=" * 60)
        print("✅ BANCO RESETADO E POPULADO COM SUCESSO!")
        print("=" * 60)
        print("\n📱 No app mobile:")
        print("   1. Login: admin@fitness.com / admin123")
        print("   2. Vá em Produtos → verá 8 produtos")
        print("   3. Vá em Inventário → verá KPIs e alertas")
        print("   4. Na home, 'Estoque Baixo' mostrará 4 produtos")
        print("\n🔧 Agora pode testar:")
        print("   • Criar novos produtos")
        print("   • Criar entradas de estoque")
        print("   • Cadastrar clientes")
        print("   • Fazer vendas (próximo passo)")
        print()
        
    except Exception as e:
        print(f"\n❌ ERRO: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
