"""
Script para popular o banco de dados com dados de exemplo.
Útil para desenvolvimento e testes.

Executar com: python scripts/seed_db.py
"""

import asyncio
import sys
from pathlib import Path

# Adicionar o diretório raiz ao path
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

from app.core.database import async_session_maker, engine
from app.services.product_service import ProductService
from app.services.auth_service import AuthService
from app.repositories.category_repository import CategoryRepository
from app.repositories.customer_repository import CustomerRepository
from app.schemas.product import ProductCreate
from app.schemas.customer import CustomerCreate
from app.schemas.user import UserCreate


async def seed_database():
    """Popula o banco de dados com dados de exemplo."""
    
    print("\n" + "="*70)
    print("🌱 SEED DO BANCO DE DADOS")
    print("="*70)
    
    async with async_session_maker() as db:
        # Criar serviços
        product_service = ProductService(db)
        auth_service = AuthService(db)
        category_repo = CategoryRepository()
        customer_repo = CustomerRepository()
        
        # ========================================
        # CATEGORIAS
        # ========================================
        print("\n📁 Verificando categorias...")
        categories = await category_repo.get_all(db)
        
        if not categories:
            print("  ⚠️  Nenhuma categoria encontrada.")
            print("  → Execute: python create_categories.py")
            return
        
        category_dict = {cat.name: cat.id for cat in categories}
        print(f"  ✓ {len(categories)} categorias encontradas")
        
        # ========================================
        # PRODUTOS
        # ========================================
        print("\n📦 Criando produtos de exemplo...")
        
        products_data = [
            # Roupas Femininas
            {
                "name": "Legging Fitness Preta",
                "sku": "LEG-FIT-001",
                "barcode": "7891234567001",
                "description": "Legging de alta compressão com tecnologia anti-suor",
                "brand": "Nike",
                "category_id": category_dict.get("Roupas Femininas", 1),
                "cost_price": 50.00,
                "price": 120.00,
                "min_stock_threshold": 10
            },
            {
                "name": "Top Esportivo Rosa",
                "sku": "TOP-ESP-002",
                "barcode": "7891234567002",
                "description": "Top esportivo com sustentação média",
                "brand": "Adidas",
                "category_id": category_dict.get("Roupas Femininas", 1),
                "cost_price": 35.00,
                "price": 89.90,
                "min_stock_threshold": 15
            },
            {
                "name": "Conjunto Fitness Azul",
                "sku": "CON-FIT-003",
                "barcode": "7891234567003",
                "description": "Conjunto completo: legging + top",
                "brand": "Puma",
                "category_id": category_dict.get("Roupas Femininas", 1),
                "cost_price": 80.00,
                "price": 189.90,
                "min_stock_threshold": 8
            },
            
            # Roupas Masculinas
            {
                "name": "Regata Dry Fit Preta",
                "sku": "REG-DRY-004",
                "barcode": "7891234567004",
                "description": "Regata com tecnologia de secagem rápida",
                "brand": "Nike",
                "category_id": category_dict.get("Roupas Masculinas", 2),
                "cost_price": 25.00,
                "price": 69.90,
                "min_stock_threshold": 20
            },
            {
                "name": "Shorts de Corrida Azul",
                "sku": "SHO-COR-005",
                "barcode": "7891234567005",
                "description": "Shorts leve para corrida e treinos",
                "brand": "Adidas",
                "category_id": category_dict.get("Roupas Masculinas", 2),
                "cost_price": 30.00,
                "price": 79.90,
                "min_stock_threshold": 15
            },
            
            # Calçados
            {
                "name": "Tênis Running Pro",
                "sku": "TEN-RUN-006",
                "barcode": "7891234567006",
                "description": "Tênis de corrida profissional com amortecimento",
                "brand": "Nike",
                "category_id": category_dict.get("Calçados", 3),
                "cost_price": 180.00,
                "price": 399.90,
                "min_stock_threshold": 5
            },
            {
                "name": "Tênis Crossfit Max",
                "sku": "TEN-CRO-007",
                "barcode": "7891234567007",
                "description": "Tênis para treino funcional e crossfit",
                "brand": "Reebok",
                "category_id": category_dict.get("Calçados", 3),
                "cost_price": 160.00,
                "price": 349.90,
                "min_stock_threshold": 5
            },
            
            # Acessórios
            {
                "name": "Garrafa Térmica 1L",
                "sku": "GAR-TER-008",
                "barcode": "7891234567008",
                "description": "Garrafa térmica de aço inox",
                "brand": "Coleman",
                "category_id": category_dict.get("Acessórios", 4),
                "cost_price": 40.00,
                "price": 89.90,
                "min_stock_threshold": 20
            },
            {
                "name": "Luva de Treino M",
                "sku": "LUV-TRE-009",
                "barcode": "7891234567009",
                "description": "Luva acolchoada para musculação",
                "brand": "Harbinger",
                "category_id": category_dict.get("Acessórios", 4),
                "cost_price": 25.00,
                "price": 59.90,
                "min_stock_threshold": 15
            },
            {
                "name": "Faixa Elástica Kit 3un",
                "sku": "FAI-ELA-010",
                "barcode": "7891234567010",
                "description": "Kit com 3 faixas de resistências diferentes",
                "brand": "Rogue",
                "category_id": category_dict.get("Acessórios", 4),
                "cost_price": 35.00,
                "price": 79.90,
                "min_stock_threshold": 10
            },
            
            # Suplementos
            {
                "name": "Whey Protein 1kg Baunilha",
                "sku": "WHE-PRO-011",
                "barcode": "7891234567011",
                "description": "Whey protein concentrado sabor baunilha",
                "brand": "Optimum Nutrition",
                "category_id": category_dict.get("Suplementos", 5),
                "cost_price": 80.00,
                "price": 159.90,
                "min_stock_threshold": 8
            },
            {
                "name": "Creatina 300g",
                "sku": "CRE-POW-012",
                "barcode": "7891234567012",
                "description": "Creatina monohidratada pura",
                "brand": "Growth",
                "category_id": category_dict.get("Suplementos", 5),
                "cost_price": 45.00,
                "price": 99.90,
                "min_stock_threshold": 10
            },
        ]
        
        created_count = 0
        for product_data in products_data:
            try:
                product = ProductCreate(**product_data)
                await product_service.create_product(product, initial_stock=0)
                created_count += 1
                print(f"  ✓ {product_data['name']}")
            except Exception as e:
                print(f"  ✗ {product_data['name']}: {str(e)}")
        
        print(f"\n  ✅ {created_count} produtos criados")
        
        # ========================================
        # CLIENTES
        # ========================================
        print("\n👥 Criando clientes de exemplo...")
        
        customers_data = [
            {
                "name": "João da Silva",
                "email": "joao.silva@email.com",
                "phone": "(11) 98765-4321",
                "cpf": "123.456.789-00",
                "birth_date": "1990-05-15",
            },
            {
                "name": "Maria Santos",
                "email": "maria.santos@email.com",
                "phone": "(11) 97654-3210",
                "cpf": "987.654.321-00",
                "birth_date": "1985-08-20",
            },
            {
                "name": "Pedro Oliveira",
                "email": "pedro.oliveira@email.com",
                "phone": "(11) 96543-2109",
                "cpf": "456.789.123-00",
                "birth_date": "1995-03-10",
            },
            {
                "name": "Ana Costa",
                "email": "ana.costa@email.com",
                "phone": "(11) 95432-1098",
                "cpf": "789.123.456-00",
                "birth_date": "1992-11-25",
            },
            {
                "name": "Carlos Ferreira",
                "email": "carlos.ferreira@email.com",
                "phone": "(11) 94321-0987",
                "cpf": "321.654.987-00",
                "birth_date": "1988-07-30",
            },
        ]
        
        created_customers = 0
        for customer_data in customers_data:
            try:
                customer = CustomerCreate(**customer_data)
                await customer_repo.create(db, obj_in=customer)
                created_customers += 1
                print(f"  ✓ {customer_data['name']}")
            except Exception as e:
                print(f"  ✗ {customer_data['name']}: {str(e)}")
        
        print(f"\n  ✅ {created_customers} clientes criados")
        
        # ========================================
        # USUÁRIOS
        # ========================================
        print("\n👤 Criando usuários de exemplo...")
        
        users_data = [
            {
                "email": "vendedor@fitnessstore.com",
                "password": "vendedor123",
                "full_name": "Vendedor Teste",
                "role": "employee"
            },
            {
                "email": "gerente@fitnessstore.com",
                "password": "gerente123",
                "full_name": "Gerente Teste",
                "role": "manager"
            },
        ]
        
        created_users = 0
        for user_data in users_data:
            try:
                user = UserCreate(**user_data)
                await auth_service.create_user(user)
                created_users += 1
                print(f"  ✓ {user_data['email']}")
            except Exception as e:
                print(f"  ✗ {user_data['email']}: {str(e)}")
        
        print(f"\n  ✅ {created_users} usuários criados")
        
        # Commit final
        await db.commit()
    
    print("\n" + "="*70)
    print("✅ SEED CONCLUÍDO COM SUCESSO")
    print("="*70)
    print("\n📊 Resumo:")
    print(f"  • Categorias: {len(categories)}")
    print(f"  • Produtos: {created_count}")
    print(f"  • Clientes: {created_customers}")
    print(f"  • Usuários: {created_users}")
    print("\n💡 Credenciais de acesso:")
    print("  • Admin: admin@fitnessstore.com / admin123")
    print("  • Vendedor: vendedor@fitnessstore.com / vendedor123")
    print("  • Gerente: gerente@fitnessstore.com / gerente123")
    print()


async def main():
    """Entry point do script"""
    try:
        await seed_database()
    except KeyboardInterrupt:
        print("\n\n⚠️  Seed cancelado pelo usuário.")
    except Exception as e:
        print(f"\n💥 Erro fatal: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    print("\n⚠️  ATENÇÃO: Este script irá criar dados de exemplo no banco.")
    print("   Se já existirem dados, alguns podem falhar por duplicação.")
    
    response = input("\nDeseja continuar? (s/n): ").strip().lower()
    
    if response in ['s', 'sim', 'y', 'yes']:
        asyncio.run(main())
    else:
        print("\n❌ Operação cancelada.")
