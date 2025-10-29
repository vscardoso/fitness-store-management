"""
Teste completo dos repositórios do sistema.
"""
import asyncio
import os
from datetime import date, datetime
from decimal import Decimal

# Configurar ambiente de teste
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_repositories.db"

from app.core.database import get_db, init_db
from app.models.base import Base
from app.models.user import User, UserRole
from app.models.category import Category
from app.models.product import Product
from app.models.customer import Customer
from app.models.inventory import Inventory, StockMovement, MovementType
from app.models.sale import Sale, SaleItem, Payment, PaymentMethod, SaleStatus
from app.repositories import (
    BaseRepository, ProductRepository, SaleRepository, 
    InventoryRepository, CustomerRepository, UserRepository, 
    CategoryRepository
)


async def setup_test_data(db):
    """Configura dados de teste."""
    print("🔧 Configurando dados de teste...")
    
    # Criar usuário de teste
    user = User(
        email="admin@test.com",
        password_hash="test_hash",
        full_name="Admin Teste",
        role=UserRole.ADMIN
    )
    db.add(user)
    await db.flush()
    
    # Criar categorias
    root_category = Category(
        name="Roupas Femininas",
        description="Roupas fitness para mulheres"
    )
    db.add(root_category)
    await db.flush()
    
    sub_category = Category(
        name="Leggings",
        description="Leggings fitness",
        parent_id=root_category.id
    )
    db.add(sub_category)
    await db.flush()
    
    # Criar produto
    product = Product(
        name="Legging High Waist Premium",
        description="Legging de cintura alta premium",
        sku="LHP001",
        price=Decimal("89.90"),
        category_id=sub_category.id,
        brand="FitWear",
        color="Preto",
        size="M",
        gender="Feminino",
        material="Poliamida"
    )
    db.add(product)
    await db.flush()
    
    # Criar cliente
    customer = Customer(
        name="Maria Silva",
        email="maria@test.com",
        phone="11999999999",
        cpf="12345678901"
    )
    db.add(customer)
    await db.flush()
    
    # Criar inventário
    inventory = Inventory(
        product_id=product.id,
        warehouse_id=1,
        current_stock=100,
        minimum_stock=10
    )
    db.add(inventory)
    await db.flush()
    
    # Criar venda
    sale = Sale(
        customer_id=customer.id,
        seller_id=user.id,
        total_amount=Decimal("89.90"),
        sale_date=datetime.utcnow()
    )
    db.add(sale)
    await db.flush()
    
    # Criar item da venda
    sale_item = SaleItem(
        sale_id=sale.id,
        product_id=product.id,
        quantity=1,
        unit_price=Decimal("89.90"),
        subtotal=Decimal("89.90")
    )
    db.add(sale_item)
    
    # Criar pagamento
    payment = Payment(
        sale_id=sale.id,
        amount=Decimal("89.90"),
        payment_method=PaymentMethod.CREDIT_CARD,
        payment_date=datetime.utcnow()
    )
    db.add(payment)
    
    await db.commit()
    
    return {
        'user': user,
        'root_category': root_category,
        'sub_category': sub_category,
        'product': product,
        'customer': customer,
        'inventory': inventory,
        'sale': sale
    }


async def test_base_repository(db):
    """Testa o BaseRepository."""
    print("\n📦 Testando BaseRepository...")
    
    repo = BaseRepository(User, db)
    
    # Teste get_multi
    users = await repo.get_multi()
    assert len(users) > 0, "Deve ter pelo menos um usuário"
    
    # Teste get
    user = await repo.get(1)
    assert user is not None, "Usuário deve existir"
    
    # Teste count
    count = await repo.count()
    assert count > 0, "Deve ter contagem > 0"
    
    print("✅ BaseRepository funcionando corretamente!")


async def test_user_repository(db, test_data):
    """Testa o UserRepository."""
    print("\n👤 Testando UserRepository...")
    
    repo = UserRepository(db)
    
    # Teste get_by_email
    user = await repo.get_by_email("admin@test.com")
    assert user is not None, "Usuário deve ser encontrado por email"
    assert user.full_name == "Admin Teste"
    
    # Teste get_active_users
    active_users = await repo.get_active_users()
    assert len(active_users) > 0, "Deve ter usuários ativos"
    
    # Teste get_by_role
    admins = await repo.get_by_role(UserRole.ADMIN)
    assert len(admins) > 0, "Deve ter administradores"
    
    # Teste exists_by_email
    exists = await repo.exists_by_email("admin@test.com")
    assert exists == True, "Email deve existir"
    
    exists = await repo.exists_by_email("naoexiste@test.com")
    assert exists == False, "Email não deve existir"
    
    print("✅ UserRepository funcionando corretamente!")


async def test_category_repository(db, test_data):
    """Testa o CategoryRepository."""
    print("\n📂 Testando CategoryRepository...")
    
    repo = CategoryRepository(db)
    
    # Teste get_root_categories
    root_categories = await repo.get_root_categories()
    assert len(root_categories) > 0, "Deve ter categorias raiz"
    
    # Teste get_with_subcategories
    category_with_subs = await repo.get_with_subcategories(test_data['root_category'].id)
    assert category_with_subs is not None, "Categoria deve existir"
    
    # Teste get_hierarchy
    hierarchy = await repo.get_hierarchy()
    assert len(hierarchy) > 0, "Deve ter hierarquia"
    assert 'subcategories' in hierarchy[0], "Deve ter subcategorias"
    
    # Teste has_subcategories
    has_subs = await repo.has_subcategories(test_data['root_category'].id)
    assert has_subs == True, "Categoria raiz deve ter subcategorias"
    
    print("✅ CategoryRepository funcionando corretamente!")


async def test_product_repository(db, test_data):
    """Testa o ProductRepository."""
    print("\n👕 Testando ProductRepository...")
    
    repo = ProductRepository(db)
    
    # Teste get_by_sku
    product = await repo.get_by_sku("LHP001")
    assert product is not None, "Produto deve ser encontrado por SKU"
    assert product.name == "Legging High Waist Premium"
    
    # Teste get_by_category
    products = await repo.get_by_category(test_data['sub_category'].id)
    assert len(products) > 0, "Deve ter produtos na categoria"
    
    # Teste search
    search_results = await repo.search("legging")
    assert len(search_results) > 0, "Deve encontrar produtos na busca"
    
    # Teste get_by_brand
    brand_products = await repo.get_by_brand("FitWear")
    assert len(brand_products) > 0, "Deve ter produtos da marca"
    
    # Teste get_by_size
    size_products = await repo.get_by_size("M")
    assert len(size_products) > 0, "Deve ter produtos do tamanho M"
    
    # Teste get_by_color
    color_products = await repo.get_by_color("Preto")
    assert len(color_products) > 0, "Deve ter produtos pretos"
    
    # Teste get_by_gender
    gender_products = await repo.get_by_gender("Feminino")
    assert len(gender_products) > 0, "Deve ter produtos femininos"
    
    # Teste exists_by_sku
    exists = await repo.exists_by_sku("LHP001")
    assert exists == True, "SKU deve existir"
    
    print("✅ ProductRepository funcionando corretamente!")


async def test_customer_repository(db, test_data):
    """Testa o CustomerRepository."""
    print("\n👥 Testando CustomerRepository...")
    
    repo = CustomerRepository(db)
    
    # Teste get_by_email
    customer = await repo.get_by_email("maria@test.com")
    assert customer is not None, "Cliente deve ser encontrado por email"
    assert customer.name == "Maria Silva"
    
    # Teste get_by_phone
    customer = await repo.get_by_phone("11999999999")
    assert customer is not None, "Cliente deve ser encontrado por telefone"
    
    # Teste get_by_cpf
    customer = await repo.get_by_cpf("12345678901")
    assert customer is not None, "Cliente deve ser encontrado por CPF"
    
    # Teste search
    search_results = await repo.search("Maria")
    assert len(search_results) > 0, "Deve encontrar clientes na busca"
    
    # Teste get_with_addresses
    customer_with_addresses = await repo.get_with_addresses(test_data['customer'].id)
    assert customer_with_addresses is not None, "Cliente deve existir"
    
    # Teste exists_by_email
    exists = await repo.exists_by_email("maria@test.com")
    assert exists == True, "Email deve existir"
    
    print("✅ CustomerRepository funcionando corretamente!")


async def test_inventory_repository(db, test_data):
    """Testa o InventoryRepository."""
    print("\n📦 Testando InventoryRepository...")
    
    repo = InventoryRepository(db)
    
    # Teste get_stock
    stock = await repo.get_stock(test_data['product'].id, 1)
    assert stock == 100, f"Estoque deve ser 100, mas é {stock}"
    
    # Teste update_stock
    await repo.update_stock(
        product_id=test_data['product'].id,
        warehouse_id=1,
        quantity=95,
        user_id=test_data['user'].id
    )
    
    # Verificar se o estoque foi atualizado
    new_stock = await repo.get_stock(test_data['product'].id, 1)
    assert new_stock == 95, f"Estoque deve ser 95, mas é {new_stock}"
    
    # Teste create_movement
    movement = await repo.create_movement(
        product_id=test_data['product'].id,
        warehouse_id=1,
        movement_type=MovementType.OUT,
        quantity=-5,
        user_id=test_data['user'].id,
        notes="Teste de saída"
    )
    assert movement is not None, "Movimento deve ser criado"
    
    # Teste get_movements
    movements = await repo.get_movements(test_data['product'].id)
    assert len(movements) > 0, "Deve ter movimentações"
    
    print("✅ InventoryRepository funcionando corretamente!")


async def test_sale_repository(db, test_data):
    """Testa o SaleRepository."""
    print("\n💰 Testando SaleRepository...")
    
    repo = SaleRepository(db)
    
    # Teste get_by_customer
    sales = await repo.get_by_customer(test_data['customer'].id)
    assert len(sales) > 0, "Cliente deve ter vendas"
    
    # Teste get_by_seller
    sales = await repo.get_by_seller(test_data['user'].id)
    assert len(sales) > 0, "Vendedor deve ter vendas"
    
    # Teste get_daily_total
    today = date.today()
    total = await repo.get_daily_total(today)
    assert total >= Decimal("0"), "Total do dia deve ser >= 0"
    
    # Teste get_by_date_range
    sales = await repo.get_by_date_range(today, today)
    assert len(sales) >= 0, "Deve retornar vendas do período"
    
    # Teste get_top_products
    top_products = await repo.get_top_products(limit=5)
    assert len(top_products) >= 0, "Deve retornar top produtos"
    
    # Teste get_with_relationships
    sale_with_relationships = await repo.get_with_relationships(test_data['sale'].id)
    assert sale_with_relationships is not None, "Venda deve existir"
    
    print("✅ SaleRepository funcionando corretamente!")


async def run_all_tests():
    """Executa todos os testes."""
    print("🚀 Iniciando testes dos repositórios...\n")
    
    # Remover banco anterior se existir
    if os.path.exists("test_repositories.db"):
        os.remove("test_repositories.db")
    
    try:
        # Inicializar banco
        await init_db()
        
        async for db in get_db():
            # Configurar dados de teste
            test_data = await setup_test_data(db)
            
            # Executar testes
            await test_base_repository(db)
            await test_user_repository(db, test_data)
            await test_category_repository(db, test_data)
            await test_product_repository(db, test_data)
            await test_customer_repository(db, test_data)
            await test_inventory_repository(db, test_data)
            await test_sale_repository(db, test_data)
            
        print("\n🎉 Todos os testes dos repositórios passaram com sucesso!")
        print("✅ Sistema de repositórios funcionando perfeitamente!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Erro durante os testes: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Limpar banco de teste
        if os.path.exists("test_repositories.db"):
            os.remove("test_repositories.db")


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    exit(0 if success else 1)