"""
Teste completo da camada de serviços.
"""
import asyncio
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker, engine
from app.models.base import BaseModel
from app.services import (
    AuthService,
    ProductService,
    InventoryService,
    SaleService,
    CustomerService
)
from app.models.user import UserRole
from app.models.customer import CustomerType
from app.models.sale import PaymentMethod
from app.models.inventory import MovementType


class ServiceTester:
    """Testa todos os serviços da aplicação."""
    
    def __init__(self):
        self.db: AsyncSession = None
        self.test_data = {}
        self.passed_tests = 0
        self.failed_tests = 0
    
    def assert_test(self, condition: bool, test_name: str):
        """Valida um teste."""
        if condition:
            print(f"✅ {test_name}")
            self.passed_tests += 1
        else:
            print(f"❌ {test_name}")
            self.failed_tests += 1
            raise AssertionError(f"Teste falhou: {test_name}")
    
    async def setup_database(self):
        """Configura o banco de dados."""
        print("🔧 Configurando banco de dados...")
        async with engine.begin() as conn:
            await conn.run_sync(BaseModel.metadata.drop_all)
            await conn.run_sync(BaseModel.metadata.create_all)
        
        self.db = async_session_maker()
        print("✅ Banco de dados configurado\n")
    
    async def test_1_auth_service(self):
        """Testa AuthService."""
        print("1️⃣  TESTANDO AUTH SERVICE")
        print("=" * 60)
        
        auth_service = AuthService(self.db)
        
        # Criar usuário admin
        from app.schemas.user import UserCreate
        admin_data = UserCreate(
            email="admin@test.com",
            password="Admin123!",
            full_name="Admin Test",
            role=UserRole.ADMIN,
            phone="(11) 99999-0001"
        )
        
        admin = await auth_service.register_user(admin_data)
        self.test_data['admin'] = admin
        self.assert_test(admin.email == "admin@test.com", "Admin criado")
        self.assert_test(admin.role == UserRole.ADMIN, "Role admin correto")
        
        # Criar vendedor
        seller_data = UserCreate(
            email="seller@test.com",
            password="Seller123!",
            full_name="Seller Test",
            role=UserRole.SELLER,
            phone="(11) 99999-0002"
        )
        
        seller = await auth_service.register_user(seller_data)
        self.test_data['seller'] = seller
        self.assert_test(seller.role == UserRole.SELLER, "Seller criado")
        
        # Autenticar
        authenticated = await auth_service.authenticate("admin@test.com", "Admin123!")
        self.assert_test(authenticated is not None, "Autenticação com sucesso")
        
        # Criar token
        token = await auth_service.create_token(admin)
        self.assert_test(len(token) > 20, "Token JWT criado")
        
        # Testar senha incorreta
        failed_auth = await auth_service.authenticate("admin@test.com", "wrong_password")
        self.assert_test(failed_auth is None, "Senha incorreta rejeitada")
        
        # Testar email duplicado
        try:
            await auth_service.register_user(admin_data)
            self.assert_test(False, "Email duplicado deveria falhar")
        except ValueError:
            self.assert_test(True, "Email duplicado rejeitado")
        
        await self.db.commit()
        print("✅ Auth Service funcionando!\n")
    
    async def test_2_product_service(self):
        """Testa ProductService."""
        print("2️⃣  TESTANDO PRODUCT SERVICE")
        print("=" * 60)
        
        from app.schemas.product import ProductCreate
        from app.repositories.category_repository import CategoryRepository
        
        # Criar categoria primeiro
        category_repo = CategoryRepository(self.db)
        category = await category_repo.create({
            'name': 'Roupas Fitness',
            'slug': 'roupas-fitness',
            'is_active': True
        })
        await self.db.commit()
        
        product_service = ProductService(self.db)
        
        # Criar produto
        product_data = ProductCreate(
            name="Legging Premium",
            sku="LEG-001",
            barcode="7891234567890",
            price=89.90,
            cost_price=45.00,
            category_id=category.id,
            brand="FitWear",
            color="Preto",
            size="M",
            gender="Feminino",
            material="Poliamida",
            is_digital=False,
            is_activewear=True
        )
        
        product = await product_service.create_product(product_data, initial_quantity=0)
        self.test_data['product1'] = product
        self.assert_test(product.sku == "LEG-001", "Produto criado")
        
        # Testar SKU duplicado
        try:
            await product_service.create_product(product_data)
            self.assert_test(False, "SKU duplicado deveria falhar")
        except ValueError:
            self.assert_test(True, "SKU duplicado rejeitado")
        
        # Buscar produto
        found = await product_service.get_product(product.id)
        self.assert_test(found is not None, "Produto encontrado por ID")
        
        # Buscar por SKU
        by_sku = await product_service.get_product_by_sku("LEG-001")
        self.assert_test(by_sku is not None, "Produto encontrado por SKU")
        
        # Buscar por barcode
        by_barcode = await product_service.get_product_by_barcode("7891234567890")
        self.assert_test(by_barcode is not None, "Produto encontrado por barcode")
        
        # Atualizar preço
        updated = await product_service.update_product_price(product.id, 99.90, 50.00)
        self.assert_test(float(updated.price) == 99.90, "Preço atualizado")
        
        await self.db.commit()
        print("✅ Product Service funcionando!\n")
    
    async def test_3_inventory_service(self):
        """Testa InventoryService."""
        print("3️⃣  TESTANDO INVENTORY SERVICE")
        print("=" * 60)
        
        inventory_service = InventoryService(self.db)
        product = self.test_data['product1']
        
        # Adicionar estoque
        inventory = await inventory_service.add_stock(
            product_id=product.id,
            quantity=100,
            movement_type=MovementType.PURCHASE,
            reference_id="NF-001",
            notes="Compra inicial"
        )
        self.test_data['inventory'] = inventory
        self.assert_test(inventory.quantity == 100, "Estoque adicionado")
        
        # Verificar disponibilidade
        available = await inventory_service.check_availability(product.id, 50)
        self.assert_test(available is True, "Estoque disponível")
        
        unavailable = await inventory_service.check_availability(product.id, 200)
        self.assert_test(unavailable is False, "Estoque insuficiente detectado")
        
        # Remover estoque
        inventory = await inventory_service.remove_stock(
            product_id=product.id,
            quantity=10,
            movement_type=MovementType.ADJUSTMENT,
            notes="Ajuste de inventário"
        )
        self.assert_test(inventory.quantity == 90, "Estoque removido")
        
        # Ajustar estoque
        inventory = await inventory_service.adjust_stock(
            product_id=product.id,
            new_quantity=100,
            reason="Contagem física"
        )
        self.assert_test(inventory.quantity == 100, "Estoque ajustado")
        
        # Obter nível de estoque
        level = await inventory_service.get_stock_level(product.id)
        self.assert_test(level['quantity'] == 100, "Nível de estoque correto")
        self.assert_test(level['status'] == 'ok', "Status ok")
        
        # Histórico de movimentações
        history = await inventory_service.get_movement_history(product.id)
        self.assert_test(len(history) >= 3, "Histórico de movimentações registrado")
        
        await self.db.commit()
        print("✅ Inventory Service funcionando!\n")
    
    async def test_4_customer_service(self):
        """Testa CustomerService."""
        print("4️⃣  TESTANDO CUSTOMER SERVICE")
        print("=" * 60)
        
        from app.schemas.customer import CustomerCreate
        
        customer_service = CustomerService(self.db)
        
        # Criar cliente
        customer_data = CustomerCreate(
            full_name="Maria Silva",
            email="maria@test.com",
            phone="(11) 98765-4321",
            document_number="123.456.789-00",
            birth_date=date(1990, 5, 15),
            customer_type=CustomerType.REGULAR,
            marketing_consent=True
        )
        
        customer = await customer_service.create_customer(customer_data)
        self.test_data['customer'] = customer
        self.assert_test(customer.full_name == "Maria Silva", "Cliente criado")
        self.assert_test(customer.loyalty_points == 0, "Pontos iniciais zerados")
        
        # Testar email duplicado
        try:
            await customer_service.create_customer(customer_data)
            self.assert_test(False, "Email duplicado deveria falhar")
        except ValueError:
            self.assert_test(True, "Email duplicado rejeitado")
        
        # Buscar por email
        by_email = await customer_service.get_customer_by_email("maria@test.com")
        self.assert_test(by_email is not None, "Cliente encontrado por email")
        
        # Buscar por CPF
        by_cpf = await customer_service.get_customer_by_cpf("123.456.789-00")
        self.assert_test(by_cpf is not None, "Cliente encontrado por CPF")
        
        # Adicionar pontos
        updated = await customer_service.add_loyalty_points(customer.id, 50, "Bônus")
        self.assert_test(updated.loyalty_points == 50, "Pontos adicionados")
        
        # Resgatar pontos
        updated = await customer_service.redeem_loyalty_points(customer.id, 20)
        self.assert_test(updated.loyalty_points == 30, "Pontos resgatados")
        
        # Buscar com histórico
        with_history = await customer_service.get_customer_with_history(customer.id)
        self.assert_test('statistics' in with_history, "Histórico completo retornado")
        
        await self.db.commit()
        print("✅ Customer Service funcionando!\n")
    
    async def test_5_sale_service(self):
        """Testa SaleService."""
        print("5️⃣  TESTANDO SALE SERVICE")
        print("=" * 60)
        
        from app.schemas.sale import SaleCreate, SaleItemCreate, PaymentCreate
        
        # Refresh dos objetos para garantir que estão anexados à sessão
        await self.db.refresh(self.test_data['product1'])
        await self.db.refresh(self.test_data['customer'])
        await self.db.refresh(self.test_data['seller'])
        
        sale_service = SaleService(self.db)
        product = self.test_data['product1']
        customer = self.test_data['customer']
        seller = self.test_data['seller']
        
        # Criar venda
        sale_data = SaleCreate(
            customer_id=customer.id,
            payment_method=PaymentMethod.CREDIT_CARD,
            discount_amount=5.00,
            tax_amount=0.00,
            notes="Venda teste",
            items=[
                SaleItemCreate(
                    product_id=product.id,
                    quantity=2,
                    unit_price=99.90,
                    discount_amount=0.00
                )
            ],
            payments=[
                PaymentCreate(
                    amount=194.80,  # 2 * 99.90 - 5.00
                    payment_method=PaymentMethod.CREDIT_CARD,
                    payment_reference="CARD-123456"
                )
            ]
        )
        
        sale = await sale_service.create_sale(sale_data, seller_id=seller.id)
        self.test_data['sale'] = sale
        self.assert_test(float(sale.total_amount) == 194.80, "Venda criada")
        self.assert_test(sale.status.upper() == "COMPLETED", "Venda completa")
        
        # Verificar estoque após venda
        inventory_service = InventoryService(self.db)
        level = await inventory_service.get_stock_level(product.id)
        self.assert_test(level['quantity'] == 98, "Estoque decrementado")
        
        # Verificar pontos do cliente
        customer_service = CustomerService(self.db)
        updated_customer = await customer_service.get_customer(customer.id)
        self.assert_test(
            updated_customer.loyalty_points > 30,
            "Pontos de fidelidade atualizados"
        )
        self.assert_test(
            updated_customer.total_spent == 194.80,
            "Total gasto atualizado"
        )
        
        # Buscar venda
        found = await sale_service.get_sale(sale.id)
        self.assert_test(found is not None, "Venda encontrada")
        
        # Relatório diário
        daily_total = await sale_service.get_daily_total()
        self.assert_test(daily_total >= Decimal('194.80'), "Total diário calculado")
        
        # Cancelar venda
        cancelled = await sale_service.cancel_sale(
            sale.id,
            reason="Teste de cancelamento",
            user_id=seller.id
        )
        self.assert_test(cancelled.status.upper() == "CANCELLED", "Venda cancelada")
        
        # Verificar estoque após cancelamento
        level = await inventory_service.get_stock_level(product.id)
        self.assert_test(level['quantity'] == 100, "Estoque revertido")
        
        # Verificar pontos após cancelamento
        updated_customer = await customer_service.get_customer(customer.id)
        self.assert_test(
            updated_customer.total_spent == 0,
            "Total gasto revertido"
        )
        
        await self.db.commit()
        print("✅ Sale Service funcionando!\n")
    
    async def test_6_integration(self):
        """Testa integração entre serviços."""
        print("6️⃣  TESTANDO INTEGRAÇÃO")
        print("=" * 60)
        
        customer_service = CustomerService(self.db)
        inventory_service = InventoryService(self.db)
        
        # Estatísticas de clientes
        stats = await customer_service.get_customer_stats()
        self.assert_test(stats['total_customers'] >= 1, "Estatísticas de clientes")
        
        # Alertas de estoque (não deve ter pois estoque está ok)
        alerts = await inventory_service.get_stock_alerts()
        self.assert_test(isinstance(alerts, list), "Alertas de estoque retornados")
        
        # Top clientes
        top_customers = await customer_service.get_top_customers(limit=5)
        self.assert_test(isinstance(top_customers, list), "Top clientes retornado")
        
        print("✅ Integração funcionando!\n")
    
    async def run_all_tests(self):
        """Executa todos os testes."""
        print("🚀 INICIANDO TESTE COMPLETO DOS SERVIÇOS")
        print("=" * 60)
        print()
        
        try:
            await self.setup_database()
            
            await self.test_1_auth_service()
            await self.test_2_product_service()
            await self.test_3_inventory_service()
            await self.test_4_customer_service()
            await self.test_5_sale_service()
            await self.test_6_integration()
            
            print("=" * 60)
            print("🎉 TESTE COMPLETO DOS SERVIÇOS FINALIZADO!")
            print("=" * 60)
            print(f"✅ RESULTADO: {self.passed_tests}/{self.passed_tests + self.failed_tests} testes passaram")
            
            if self.failed_tests > 0:
                print(f"❌ {self.failed_tests} testes falharam")
                return False
            
            print("\n🎯 TODOS OS SERVIÇOS ESTÃO FUNCIONANDO CORRETAMENTE!")
            return True
            
        except Exception as e:
            print(f"\n❌ ERRO CRÍTICO NO TESTE: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
        
        finally:
            if self.db:
                await self.db.close()


async def main():
    """Função principal."""
    tester = ServiceTester()
    success = await tester.run_all_tests()
    return 0 if success else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
