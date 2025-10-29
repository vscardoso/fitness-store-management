"""
Script de teste para verificar os modelos SQLAlchemy 2.0.
"""
import asyncio
import sys
from pathlib import Path

# Adicionar o diretório app ao path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from core.database import engine, async_session_maker
from models import (
    BaseModel, User, UserRole, Category, Product, 
    Inventory, Customer, CustomerType, Sale, SaleStatus
)


async def test_models():
    """Testa a criação das tabelas e importação dos modelos."""
    
    print("🔄 Testando importação dos modelos...")
    
    # Testar importação de todos os modelos
    models = [User, Category, Product, Inventory, Customer, Sale]
    for model in models:
        print(f"✅ {model.__name__} importado com sucesso")
    
    print("\n🔄 Criando tabelas no banco de dados...")
    
    # Criar todas as tabelas
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    
    print("✅ Tabelas criadas com sucesso!")
    
    print("\n🔄 Testando criação de registros...")
    
    async with async_session_maker() as session:
        # Criar categoria
        category = Category(
            name="Roupas Femininas",
            description="Roupas fitness para mulheres",
            slug="roupas-femininas"
        )
        session.add(category)
        await session.flush()  # Para obter o ID
        
        # Criar produto
        product = Product(
            name="Legging High Waist",
            description="Legging cintura alta para treino e yoga",
            sku="LEG-001-P-M",
            price=89.90,
            cost_price=45.00,
            color="Preta",
            size="M",
            gender="Feminino",
            material="Poliamida com elastano",
            brand="FitActive",
            category_id=category.id
        )
        session.add(product)
        await session.flush()
        
        # Criar usuário
        user = User(
            email="vendedor@fitstore.com",
            hashed_password="$2b$12$test_hash",
            full_name="Ana Vendedora",
            role=UserRole.SELLER
        )
        session.add(user)
        await session.flush()
        
        # Criar cliente
        customer = Customer(
            full_name="Maria Silva",
            email="maria@email.com",
            phone="11999999999",
            customer_type=CustomerType.VIP
        )
        session.add(customer)
        await session.flush()
        
        # Criar estoque
        inventory = Inventory(
            product_id=product.id,
            quantity=25,
            min_stock=5,
            location="Estoque Loja"
        )
        session.add(inventory)
        
        # Commit das mudanças
        await session.commit()
        
        print("✅ Registros de teste criados com sucesso!")
        
        # Testar consultas e relacionamentos
        print("\n🔄 Testando consultas e relacionamentos...")
        
        # Buscar produto com categoria e inventário
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        
        stmt = select(Product).options(
            selectinload(Product.category),
            selectinload(Product.inventory)
        ).where(Product.sku == "LEG-001-P-M")
        result = await session.execute(stmt)
        produto_teste = result.scalar_one()
        
        print(f"✅ Produto: {produto_teste.get_full_name()}")
        print(f"✅ Categoria: {produto_teste.category.name}")
        print(f"✅ Estoque atual: {produto_teste.get_current_stock()}")
        print(f"✅ Margem de lucro: {produto_teste.calculate_profit_margin()}%")
        print(f"✅ Material: {produto_teste.material}")
        
        # Testar métodos do cliente
        print(f"✅ Cliente: {customer.full_name}")
        print(f"✅ Desconto: {customer.calculate_discount_percentage()}%")
        
        # Testar hierarquia de categorias
        subcategoria = Category(
            name="Leggings",
            description="Leggings e calças para fitness",
            slug="leggings",
            parent_id=category.id
        )
        session.add(subcategoria)
        await session.flush()
        
        print(f"✅ Categoria pai: {category.name}")
        print(f"✅ Caminho completo da subcategoria: {subcategoria.get_full_path()}")
        print(f"✅ Nome completo do produto: {produto_teste.get_full_name()}")
        
        await session.commit()
        
        print("\n🎉 Todos os testes passaram com sucesso!")


if __name__ == "__main__":
    asyncio.run(test_models())