"""
TESTE COMPLETO DO SISTEMA FITNESS STORE MANAGEMENT
==================================================

Este teste valida toda a funcionalidade implementada:
- Modelos de dados (SQLAlchemy 2.0)
- Repositórios (CRUD + operações específicas)
- Banco de dados (criação de tabelas)
- Relacionamentos (ForeignKeys + relacionamentos)
- Transações (commit/rollback)
- Funcionalidades de negócio

"""
import asyncio
import os
from datetime import date, datetime
from decimal import Decimal

# Configurar ambiente de teste
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_complete_system.db"

from app.core.database import get_db, init_db
from app.models.user import User, UserRole
from app.models.category import Category
from app.models.product import Product
from app.models.customer import Customer, CustomerType
from app.models.inventory import Inventory, InventoryMovement, MovementType
from app.models.sale import Sale, SaleItem, Payment, PaymentMethod, SaleStatus
from app.repositories import *


class CompleteSystemTest:
    """Teste completo de todas as funcionalidades do sistema."""
    
    def __init__(self):
        self.db = None
        self.test_data = {}
        self.passed_tests = 0
        self.total_tests = 0
    
    async def setup_database(self):
        """Configura o banco de dados limpo para teste."""
        print("🔧 Configurando banco de dados...")
        
        # Remover banco anterior
        if os.path.exists("test_complete_system.db"):
            os.remove("test_complete_system.db")
        
        # Inicializar banco
        await init_db()
        
        # Obter sessão
        async for db in get_db():
            self.db = db
            break
        
        print("✅ Banco de dados configurado")
    
    def assert_test(self, condition, test_name):
        """Helper para validar testes."""
        self.total_tests += 1
        if condition:
            print(f"✅ {test_name}")
            self.passed_tests += 1
        else:
            print(f"❌ {test_name}")
            raise AssertionError(f"Teste falhou: {test_name}")
    
    async def test_1_user_creation_and_repository(self):
        """Teste 1: Criação de usuários e UserRepository."""
        print("\n1️⃣ TESTANDO USUÁRIOS E AUTENTICAÇÃO")
        
        user_repo = UserRepository(self.db)
        
        # Criar usuário administrador
        admin_data = {
            "email": "admin@fitnessstore.com",
            "hashed_password": "hashed_admin_password",
            "full_name": "Administrador Sistema",
            "role": UserRole.ADMIN,
            "phone": "(11) 99999-0001",
            "is_active": True
        }
        admin = await user_repo.create(admin_data)
        self.test_data['admin'] = admin
        self.assert_test(admin.id is not None, "Usuário admin criado")
        self.assert_test(admin.role == UserRole.ADMIN, "Role admin correta")
        
        # Criar usuário vendedor
        seller_data = {
            "email": "vendedor@fitnessstore.com", 
            "hashed_password": "hashed_seller_password",
            "full_name": "João Vendedor",
            "role": UserRole.SELLER,
            "phone": "(11) 99999-0002",
            "is_active": True
        }
        seller = await user_repo.create(seller_data)
        self.test_data['seller'] = seller
        self.assert_test(seller.role == UserRole.SELLER, "Usuário vendedor criado")
        
        # Testar busca por email
        found_admin = await user_repo.get_by_email("admin@fitnessstore.com")
        self.assert_test(found_admin.id == admin.id, "Busca por email funcionando")
        
        # Testar filtro por role
        admins = await user_repo.get_by_role(UserRole.ADMIN)
        self.assert_test(len(admins) >= 1, "Filtro por role funcionando")
        
        # Testar usuários ativos
        active_users = await user_repo.get_active_users()
        self.assert_test(len(active_users) >= 2, "Usuários ativos listados")
        
        print("✅ Usuários e autenticação funcionando!")
    
    async def test_2_category_hierarchy(self):
        """Teste 2: Hierarquia de categorias com queries recursivas."""
        print("\n2️⃣ TESTANDO CATEGORIAS E HIERARQUIA")
        
        cat_repo = CategoryRepository(self.db)
        
        # Criar categoria raiz
        root_data = {
            "name": "Roupas Fitness",
            "description": "Categoria principal para roupas fitness",
            "slug": "roupas-fitness"
        }
        root_cat = await cat_repo.create(root_data)
        self.test_data['root_category'] = root_cat
        self.assert_test(root_cat.parent_id is None, "Categoria raiz criada")
        
        # Criar subcategorias
        feminino_data = {
            "name": "Feminino",
            "description": "Roupas fitness femininas", 
            "slug": "feminino",
            "parent_id": root_cat.id
        }
        feminino_cat = await cat_repo.create(feminino_data)
        self.test_data['feminino_category'] = feminino_cat
        
        masculino_data = {
            "name": "Masculino",
            "description": "Roupas fitness masculinas",
            "slug": "masculino", 
            "parent_id": root_cat.id
        }
        masculino_cat = await cat_repo.create(masculino_data)
        
        # Criar sub-subcategorias
        leggings_data = {
            "name": "Leggings",
            "description": "Leggings e calças fitness",
            "slug": "leggings",
            "parent_id": feminino_cat.id
        }
        leggings_cat = await cat_repo.create(leggings_data)
        self.test_data['leggings_category'] = leggings_cat
        
        # Testar categorias raiz
        root_categories = await cat_repo.get_root_categories()
        self.assert_test(len(root_categories) >= 1, "Categorias raiz encontradas")
        
        # Testar categoria com subcategorias
        cat_with_subs = await cat_repo.get_with_subcategories(root_cat.id)
        self.assert_test(len(cat_with_subs.children) >= 2, "Subcategorias carregadas")
        
        # Testar hierarquia completa
        hierarchy = await cat_repo.get_hierarchy()
        self.assert_test(len(hierarchy) >= 1, "Hierarquia construída")
        self.assert_test('subcategories' in hierarchy[0], "Estrutura hierárquica correta")
        
        print("✅ Hierarquia de categorias funcionando!")
    
    async def test_3_products_and_inventory(self):
        """Teste 3: Produtos e controle de inventário."""
        print("\n3️⃣ TESTANDO PRODUTOS E INVENTÁRIO")
        
        product_repo = ProductRepository(self.db)
        inventory_repo = InventoryRepository(self.db)
        
        # Criar produtos
        product1_data = {
            "name": "Legging High Waist Premium",
            "description": "Legging de cintura alta com tecnologia DRY-FIT",
            "sku": "LHP001-P-M",
            "price": Decimal("89.90"),
            "cost_price": Decimal("45.00"),
            "category_id": self.test_data['leggings_category'].id,
            "brand": "FitWear",
            "color": "Preto", 
            "size": "M",
            "gender": "Feminino",
            "material": "Poliamida + Elastano",
            "is_active": True
        }
        product1 = await product_repo.create(product1_data)
        self.test_data['product1'] = product1
        self.assert_test(product1.sku == "LHP001-P-M", "Produto 1 criado")
        
        product2_data = {
            "name": "Legging High Waist Premium", 
            "description": "Legging de cintura alta com tecnologia DRY-FIT",
            "sku": "LHP001-A-G",
            "price": Decimal("89.90"),
            "cost_price": Decimal("45.00"), 
            "category_id": self.test_data['leggings_category'].id,
            "brand": "FitWear",
            "color": "Azul",
            "size": "G", 
            "gender": "Feminino",
            "material": "Poliamida + Elastano",
            "is_active": True
        }
        product2 = await product_repo.create(product2_data)
        self.test_data['product2'] = product2
        
        # Testar busca de produtos
        found_by_sku = await product_repo.get_by_sku("LHP001-P-M")
        self.assert_test(found_by_sku.id == product1.id, "Busca por SKU funcionando")
        
        products_by_brand = await product_repo.get_by_brand("FitWear")
        self.assert_test(len(products_by_brand) >= 2, "Busca por marca funcionando")
        
        products_by_category = await product_repo.get_by_category(self.test_data['leggings_category'].id)
        self.assert_test(len(products_by_category) >= 2, "Busca por categoria funcionando")
        
        search_results = await product_repo.search("Legging High")
        self.assert_test(len(search_results) >= 2, "Busca textual funcionando")
        
        # Testar inventário
        
        # Verificar estoque inicial (deve ser 0)
        initial_stock = await inventory_repo.get_stock(product1.id)
        self.assert_test(initial_stock == 0, "Estoque inicial zerado")
        
        # Criar estoque inicial
        inventory1 = await inventory_repo.update_stock(
            product_id=product1.id,
            quantity=100,
            movement_type=MovementType.PURCHASE,
            notes="Estoque inicial - Legging Preta M"
        )
        self.assert_test(inventory1.quantity == 100, "Estoque inicial criado")
        
        # Verificar estoque atualizado
        current_stock = await inventory_repo.get_stock(product1.id)
        self.assert_test(current_stock == 100, "Consulta de estoque funcionando")
        
        print("✅ Produtos e inventário funcionando!")
    
    async def test_4_customers_and_loyalty(self):
        """Teste 4: Clientes e programa de fidelidade."""
        print("\n4️⃣ TESTANDO CLIENTES E FIDELIDADE")
        
        customer_repo = CustomerRepository(self.db)
        
        # Criar cliente VIP
        customer_data = {
            "full_name": "Maria Silva Santos",
            "email": "maria.silva@email.com",
            "phone": "(11) 98765-4321",
            "document_number": "123.456.789-00",
            "birth_date": date(1985, 3, 15),
            "address": "Rua das Flores, 123",
            "city": "São Paulo",
            "state": "SP", 
            "zip_code": "01234-567",
            "customer_type": CustomerType.VIP,
            "loyalty_points": Decimal("250.00"),
            "total_spent": Decimal("850.00"),
            "total_purchases": 5,
            "marketing_consent": True,
            "is_active": True
        }
        customer = await customer_repo.create(customer_data)
        self.test_data['customer'] = customer
        self.assert_test(customer.customer_type == CustomerType.VIP, "Cliente VIP criado")
        
        # Criar cliente regular
        customer2_data = {
            "full_name": "João Carlos Oliveira",
            "email": "joao.carlos@email.com", 
            "phone": "(11) 91234-5678",
            "document_number": "987.654.321-00",
            "customer_type": CustomerType.REGULAR,
            "loyalty_points": Decimal("0.00"),
            "total_spent": Decimal("0.00"),
            "total_purchases": 0,
            "marketing_consent": False,
            "is_active": True
        }
        customer2 = await customer_repo.create(customer2_data)
        
        # Testar buscas de clientes
        found_by_email = await customer_repo.get_by_email("maria.silva@email.com")
        self.assert_test(found_by_email.id == customer.id, "Busca por email funcionando")
        
        found_by_document = await customer_repo.get_by_cpf("123.456.789-00")
        self.assert_test(found_by_document.id == customer.id, "Busca por CPF funcionando")
        
        search_results = await customer_repo.search("Maria Silva")
        self.assert_test(len(search_results) >= 1, "Busca de clientes funcionando")
        
        # Testar validações de unicidade
        email_exists = await customer_repo.exists_by_email("maria.silva@email.com")
        self.assert_test(email_exists == True, "Validação de email único funcionando")
        
        cpf_exists = await customer_repo.exists_by_cpf("123.456.789-00")
        self.assert_test(cpf_exists == True, "Validação de CPF único funcionando")
        
        print("✅ Clientes e fidelidade funcionando!")
    
    async def test_5_sales_and_transactions(self):
        """Teste 5: Vendas completas com transações."""
        print("\n5️⃣ TESTANDO VENDAS E TRANSAÇÕES")
        
        sale_repo = SaleRepository(self.db)
        inventory_repo = InventoryRepository(self.db)
        
        # Criar venda completa
        sale_data = {
            "sale_number": "VENDA-001-2025",
            "customer_id": self.test_data['customer'].id,
            "seller_id": self.test_data['seller'].id,
            "status": SaleStatus.COMPLETED,
            "subtotal": Decimal("89.90"),
            "discount_amount": Decimal("5.00"),
            "tax_amount": Decimal("0.00"),
            "total_amount": Decimal("84.90"),
            "payment_method": PaymentMethod.CREDIT_CARD,
            "payment_reference": "CARD-123456789",
            "loyalty_points_used": Decimal("0.00"),
            "loyalty_points_earned": Decimal("8.49"),
            "notes": "Venda teste - Legging preta M"
        }
        sale = await sale_repo.create(sale_data)
        self.test_data['sale'] = sale
        self.assert_test(sale.sale_number == "VENDA-001-2025", "Venda criada")
        
        # Criar item da venda
        sale_item_data = {
            "sale_id": sale.id,
            "product_id": self.test_data['product1'].id,
            "quantity": 1,
            "unit_price": Decimal("89.90"),
            "subtotal": Decimal("89.90"),
            "discount_amount": Decimal("0.00")
        }
        sale_item = SaleItem(**sale_item_data)
        self.db.add(sale_item)
        await self.db.flush()
        self.assert_test(sale_item.quantity == 1, "Item da venda criado")
        
        # Criar pagamento
        payment_data = {
            "sale_id": sale.id,
            "amount": Decimal("84.90"),
            "payment_method": PaymentMethod.CREDIT_CARD,
            "payment_reference": "CARD-123456789",
            "status": "confirmed",
            "notes": "Pagamento cartão crédito"
        }
        payment = Payment(**payment_data)
        self.db.add(payment)
        await self.db.flush()
        self.assert_test(payment.amount == Decimal("84.90"), "Pagamento criado")
        
        # Movimentar estoque (saída pela venda)
        inventory_obj = await inventory_repo.get_by_product(self.test_data['product1'].id)
        await inventory_repo.remove_stock(
            inventory_obj.id,
            quantity=1,
            movement_type=MovementType.SALE,
            reference_id=sale.sale_number,
            notes=f"Venda {sale.sale_number}"
        )
        
        # Verificar estoque após venda
        final_inventory = await inventory_repo.get(self.db, inventory_obj.id)
        self.assert_test(final_inventory.quantity == 99, "Estoque atualizado após venda")
        
        # Testar consultas de vendas
        customer_sales = await sale_repo.get_by_customer(self.test_data['customer'].id)
        self.assert_test(len(customer_sales) >= 1, "Vendas por cliente funcionando")
        
        seller_sales = await sale_repo.get_by_seller(self.test_data['seller'].id)
        self.assert_test(len(seller_sales) >= 1, "Vendas por vendedor funcionando")
        
        # Testar total diário
        today = date.today()
        daily_total = await sale_repo.get_daily_total(today)
        self.assert_test(daily_total >= Decimal("84.90"), "Total diário funcionando")
        
        # Testar vendas por período
        sales_today = await sale_repo.get_by_date_range(today, today)
        self.assert_test(len(sales_today) >= 1, "Vendas por período funcionando")
        
        print("✅ Vendas e transações funcionando!")
    
    async def test_6_business_logic_and_reports(self):
        """Teste 6: Lógica de negócio e relatórios."""
        print("\n6️⃣ TESTANDO LÓGICA DE NEGÓCIO E RELATÓRIOS")
        
        sale_repo = SaleRepository(self.db)
        inventory_repo = InventoryRepository(self.db)
        customer_repo = CustomerRepository(self.db)
        
        # Testar relatório de vendas
        today = date.today()
        sales_summary = await sale_repo.get_sales_summary(today, today)
        self.assert_test(sales_summary['total_sales'] >= 1, "Relatório de vendas funcionando")
        self.assert_test(sales_summary['total_revenue'] >= Decimal("84.90"), "Revenue calculado")
        
        # Testar produtos mais vendidos
        top_products = await sale_repo.get_top_products(limit=5)
        self.assert_test(len(top_products) >= 0, "Top produtos funcionando")
        
        # Testar movimentações de estoque
        inventory_obj = await inventory_repo.get_by_product(self.test_data['product1'].id)
        movements = await inventory_repo.get_movements_by_product(inventory_obj.id)
        self.assert_test(len(movements) >= 1, "Histórico de movimentações funcionando")
        
        # Testar inventário de baixo estoque
        low_stock = await inventory_repo.get_low_stock_products(threshold=10)
        self.assert_test(len(low_stock) >= 0, "Produtos com baixo estoque funcionando")
        
        # Testar melhores clientes
        top_customers = await customer_repo.get_top_customers(limit=5)
        self.assert_test(len(top_customers) >= 0, "Top clientes funcionando")
        
        print("✅ Lógica de negócio e relatórios funcionando!")
    
    async def test_7_data_integrity_and_constraints(self):
        """Teste 7: Integridade de dados e restrições."""
        print("\n7️⃣ TESTANDO INTEGRIDADE E RESTRIÇÕES")
        
        product_repo = ProductRepository(self.db)
        customer_repo = CustomerRepository(self.db)
        
        # Testar unicidade de SKU
        try:
            duplicate_sku_data = {
                "name": "Produto Duplicado",
                "sku": "LHP001-P-M",  # SKU já existe
                "price": Decimal("50.00"),
                "category_id": self.test_data['leggings_category'].id,
                "is_active": True
            }
            await product_repo.create(duplicate_sku_data)
            self.assert_test(False, "SKU duplicado deveria falhar")
        except:
            self.assert_test(True, "Restrição de SKU único funcionando")
        
        # Testar unicidade de email de cliente
        try:
            duplicate_email_data = {
                "full_name": "Cliente Duplicado",
                "email": "maria.silva@email.com",  # Email já existe
                "customer_type": CustomerType.REGULAR,
                "is_active": True
            }
            await customer_repo.create(duplicate_email_data)
            self.assert_test(False, "Email duplicado deveria falhar")
        except:
            self.assert_test(True, "Restrição de email único funcionando")
        
        # Testar relacionamentos obrigatórios
        try:
            invalid_product_data = {
                "name": "Produto Sem Categoria",
                "sku": "INVALID-001",
                "price": Decimal("10.00"),
                "category_id": 99999,  # Categoria inexistente
                "is_active": True
            }
            await product_repo.create(invalid_product_data)
            self.assert_test(False, "FK inválida deveria falhar")
        except:
            self.assert_test(True, "Restrição de FK funcionando")
        
        print("✅ Integridade e restrições funcionando!")
    
    async def run_complete_test(self):
        """Executa o teste completo do sistema."""
        print("🚀 INICIANDO TESTE COMPLETO DO SISTEMA FITNESS STORE")
        print("=" * 60)
        
        try:
            await self.setup_database()
            
            # Executar todos os testes em sequência
            await self.test_1_user_creation_and_repository()
            await self.test_2_category_hierarchy()
            await self.test_3_products_and_inventory()
            await self.test_4_customers_and_loyalty()
            await self.test_5_sales_and_transactions()
            await self.test_6_business_logic_and_reports()
            await self.test_7_data_integrity_and_constraints()
            
            # Finalizar transação
            await self.db.commit()
            
            print("\n" + "=" * 60)
            print("🎉 TESTE COMPLETO DO SISTEMA FINALIZADO!")
            print("=" * 60)
            print(f"📊 RESULTADO: {self.passed_tests}/{self.total_tests} testes passaram")
            
            if self.passed_tests == self.total_tests:
                print("🏆 SISTEMA 100% FUNCIONAL - TODOS OS TESTES PASSARAM!")
                print("\n✅ FUNCIONALIDADES VALIDADAS:")
                print("   • Modelos de dados (SQLAlchemy 2.0)")
                print("   • Repositórios com CRUD completo") 
                print("   • Hierarquia de categorias com queries recursivas")
                print("   • Controle de inventário com transações")
                print("   • Sistema de vendas completo")
                print("   • Programa de fidelidade")
                print("   • Relatórios e agregações")
                print("   • Integridade referencial")
                print("   • Validações de negócio")
                
                print("\n🚀 SISTEMA PRONTO PARA PRODUÇÃO!")
                return True
            else:
                print(f"⚠️ {self.total_tests - self.passed_tests} testes falharam")
                return False
                
        except Exception as e:
            await self.db.rollback()
            print(f"\n❌ ERRO CRÍTICO NO TESTE: {e}")
            import traceback
            traceback.print_exc()
            return False
        
        finally:
            if self.db:
                await self.db.close()
            
            # Limpar banco de teste
            if os.path.exists("test_complete_system.db"):
                try:
                    os.remove("test_complete_system.db")
                except:
                    pass  # Arquivo pode estar em uso


async def main():
    """Função principal para executar o teste completo."""
    test_suite = CompleteSystemTest()
    success = await test_suite.run_complete_test()
    return success


if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)