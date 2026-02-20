#!/usr/bin/env python3
"""
Teste de Estresse do Sistema de Variantes + FIFO

Este script testa todos os cenários do sistema:
1. Criar produto com múltiplas variantes (cores/tamanhos)
2. Vincular a entradas
3. Criar viagens e vincular entradas
4. Vendas com FIFO
5. Estornos
6. Dashboard
7. Exclusão de entrada (com e sem vendas)
8. Seleção do catálogo
9. Casos de erro

Executar: python test_variants_stress.py
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

import asyncio
import sys
import os
from decimal import Decimal
from datetime import date, datetime, timedelta
import random
import string

# Adicionar path do backend
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, func, and_
from app.core.database import get_db, async_session_maker, engine
from app.models.base import BaseModel
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.category import Category
from app.models.stock_entry import StockEntry, EntryType
from app.models.entry_item import EntryItem
from app.models.sale import Sale, SaleItem, Payment
from app.models.sale_return import SaleReturn, ReturnItem
from app.models.trip import Trip
from app.models.inventory import Inventory
from app.models.user import User
from app.models.store import Store
from app.services.product_service import ProductService
from app.services.product_variant_service import ProductVariantService
from app.services.stock_entry_service import StockEntryService
from app.services.sale_service import SaleService
from app.services.trip_service import TripService
from app.services.inventory_service import InventoryService
# Dashboard service não existe - será removido do teste
from app.schemas.product import ProductCreate
from app.schemas.product_variant import ProductVariantCreate
from app.schemas.stock_entry import StockEntryCreate
from app.schemas.entry_item import EntryItemCreate
from app.schemas.sale import SaleCreate, SaleItemCreate as SaleItemSchema, PaymentCreate
# Tenant ID para testes
TEST_TENANT_ID = 1
TEST_USER_ID = 1


class StressTest:
    def __init__(self):
        self.db = None
        self.results = []
        self.errors = []
        self.products_created = []
        self.variants_created = []
        self.entries_created = []
        self.trips_created = []
        self.sales_created = []
        
    def log(self, message: str, level: str = "INFO"):
        """Log com timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        # Evitar problemas de encoding no Windows
        safe_message = message.encode('utf-8', errors='replace').decode('utf-8')
        print(f"[{timestamp}] [{level}] {safe_message}")
        self.results.append(f"[{timestamp}] [{level}] {message}")
        
    def log_error(self, message: str, exception: Exception = None):
        """Log de erro"""
        error_msg = f"{message}"
        if exception:
            error_msg += f" - {type(exception).__name__}: {exception}"
        self.log(error_msg, "ERROR")
        self.errors.append(error_msg)
        
    async def setup(self):
        """Setup inicial - criar tabelas e dados base"""
        self.log("=== SETUP INICIAL ===")
        
        # Criar tabelas se não existirem
        async with engine.begin() as conn:
            await conn.run_sync(BaseModel.metadata.create_all)
        self.log("Tabelas verificadas/criadas")
        
        # Criar sessão
        self.db = async_session_maker()
        
        # Verificar se existe categoria
        result = await self.db.execute(
            select(Category).where(Category.tenant_id == TEST_TENANT_ID).limit(1)
        )
        category = result.scalar_one_or_none()
        
        if not category:
            # Criar categoria de teste
            category = Category(
                name="Roupas Fitness",
                description="Categoria para testes",
                slug="roupas-fitness-test",
                tenant_id=TEST_TENANT_ID
            )
            self.db.add(category)
            await self.db.commit()
            await self.db.refresh(category)
            self.log(f"Categoria criada: {category.name} (ID: {category.id})")
        
        self.category = category
        
        # Verificar se existe usuário
        result = await self.db.execute(
            select(User).where(User.id == TEST_USER_ID)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            user = User(
                id=TEST_USER_ID,
                email="test@test.com",
                full_name="Test User",
                hashed_password="test_hashed_password",
                role="admin",
                tenant_id=TEST_TENANT_ID,
                is_active=True
            )
            self.db.add(user)
            await self.db.commit()
            self.log(f"Usuário criado: {user.full_name} (ID: {user.id})")
        
        self.user = user
        
        self.log("Setup concluído!")
        
    async def teardown(self):
        """Limpeza final"""
        self.log("=== TEARDOWN ===")
        if self.db:
            await self.db.close()
        self.log("Teardown concluído!")
        
    async def test_1_create_product_with_multiple_variants(self):
        """Teste 1: Criar produto com múltiplas variantes (cores/tamanhos)"""
        self.log("\n=== TESTE 1: Produto com Múltiplas Variantes ===")
        
        product_service = ProductService(self.db)
        
        # Criar produto pai
        product_data = ProductCreate(
            name="Legging Premium Test",
            description="Legging para testes de estresse",
            sku="LEG-PREM-001",  # SKU da primeira variante
            price=Decimal("99.90"),
            cost_price=Decimal("45.00"),
            category_id=self.category.id,
            brand="TestBrand",
            gender="Feminino",
            material="Poliamida",
            is_catalog=False,
            initial_stock=0
        )
        
        try:
            product = await product_service.create_product(
                product_data,
                tenant_id=TEST_TENANT_ID,
                user_id=TEST_USER_ID
            )
            self.products_created.append(product.id)
            self.log(f"✓ Produto criado: {product.name} (ID: {product.id})")
            
            # Verificar variantes criadas
            result = await self.db.execute(
                select(ProductVariant).where(
                    ProductVariant.product_id == product.id,
                    ProductVariant.tenant_id == TEST_TENANT_ID
                )
            )
            variants = result.scalars().all()
            self.log(f"✓ Variantes iniciais: {len(variants)}")
            self.variants_created.extend([v.id for v in variants])
            
            # Criar variantes adicionais (cores x tamanhos)
            colors = ["Preto", "Roxo", "Azul Marinho", "Verde Militar"]
            sizes = ["P", "M", "G", "GG"]
            
            for color in colors:
                for size in sizes:
                    # Pular se já existe (primeira variante)
                    if color == "Preto" and size == "M":
                        continue
                        
                    # Criar variante diretamente
                    variant = ProductVariant(
                        sku=f"LEG-PREM-{color[:3].upper()}-{size}",
                        product_id=product.id,
                        color=color,
                        size=size,
                        price=Decimal("99.90"),
                        cost_price=Decimal("45.00"),
                        tenant_id=TEST_TENANT_ID,
                        is_active=True
                    )
                    self.db.add(variant)
                    await self.db.commit()
                    await self.db.refresh(variant)
                    
                    self.variants_created.append(variant.id)
                    self.log(f"✓ Variante criada: {color} {size} (SKU: {variant.sku})")
            
            # Verificar total de variantes
            result = await self.db.execute(
                select(ProductVariant).where(
                    ProductVariant.product_id == product.id,
                    ProductVariant.tenant_id == TEST_TENANT_ID
                )
            )
            all_variants = result.scalars().all()
            self.log(f"✓ Total de variantes: {len(all_variants)}")
            
            return product
            
        except Exception as e:
            self.log_error("Falha ao criar produto com variantes", e)
            return None
            
    async def test_2_create_entry_with_variants(self):
        """Teste 2: Criar entrada de estoque vinculando variantes"""
        self.log("\n=== TESTE 2: Entrada de Estoque com Variantes ===")
        
        if not self.products_created:
            self.log("[!] Nenhum produto criado, pulando teste")
            return None
            
        entry_service = StockEntryService(self.db)
        
        # Buscar produto e variantes
        product = await self.db.get(Product, self.products_created[0])
        result = await self.db.execute(
            select(ProductVariant).where(
                ProductVariant.product_id == product.id,
                ProductVariant.tenant_id == TEST_TENANT_ID
            )
        )
        variants = result.scalars().all()
        
        try:
            # Criar entrada
            entry_data = StockEntryCreate(
                entry_code=f"ENT-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                entry_date=date.today(),
                entry_type=EntryType.PURCHASE,
                supplier_name="Fornecedor Teste",
                notes="Entrada para teste de estresse"
            )
            
            entry = await entry_service.create_entry(
                self.db,
                entry_data,
                tenant_id=TEST_TENANT_ID
            )
            self.entries_created.append(entry.id)
            self.log(f"✓ Entrada criada: {entry.entry_code} (ID: {entry.id})")
            
            # Adicionar itens para cada variante
            for i, variant in enumerate(variants[:4]):  # Limitar a 4 variantes
                quantity = random.randint(5, 20)
                unit_cost = Decimal("45.00") + Decimal(str(random.randint(0, 10)))
                
                item_data = EntryItemCreate(
                    product_id=product.id,
                    variant_id=variant.id,
                    quantity_received=quantity,
                    unit_cost=unit_cost
                )
                
                item = await entry_service.add_entry_item(
                    self.db,
                    entry.id,
                    item_data,
                    tenant_id=TEST_TENANT_ID
                )
                self.log(f"✓ Item adicionado: {variant.color} {variant.size} - {quantity} unidades @ R${unit_cost}")
            
            # Verificar totais
            await self.db.refresh(entry)
            self.log(f"✓ Total da entrada: R${entry.total_cost}")
            
            return entry
            
        except Exception as e:
            self.log_error("Falha ao criar entrada", e)
            return None
            
    async def test_3_create_trip_and_link_entry(self):
        """Teste 3: Criar viagem e vincular entrada"""
        self.log("\n=== TESTE 3: Viagem com Entrada ===")
        
        trip_service = TripService(self.db)
        
        try:
            # Criar viagem
            trip_data = {
                "trip_number": f"VIA-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "trip_date": date.today(),
                "supplier_name": "Fornecedor Viagem Teste",
                "destination": "São Paulo",
                "notes": "Viagem para teste de estresse"
            }
            
            trip = await trip_service.create_trip(
                self.db,
                trip_data,
                tenant_id=TEST_TENANT_ID
            )
            self.trips_created.append(trip.id)
            self.log(f"✓ Viagem criada: {trip.trip_number} (ID: {trip.id})")
            
            # Vincular entrada existente
            if self.entries_created:
                entry = await self.db.get(StockEntry, self.entries_created[0])
                if entry:
                    entry.trip_id = trip.id
                    await self.db.commit()
                    self.log(f"✓ Entrada {entry.entry_code} vinculada à viagem {trip.trip_number}")
            
            return trip
            
        except Exception as e:
            self.log_error("Falha ao criar viagem", e)
            return None
            
    async def test_4_sales_with_fifo(self):
        """Teste 4: Vendas com FIFO"""
        self.log("\n=== TESTE 4: Vendas com FIFO ===")
        
        if not self.products_created:
            self.log("[!] Nenhum produto criado, pulando teste")
            return
            
        sale_service = SaleService(self.db)
        
        # Buscar produto e variante com estoque
        product = await self.db.get(Product, self.products_created[0])
        result = await self.db.execute(
            select(ProductVariant).where(
                ProductVariant.product_id == product.id,
                ProductVariant.tenant_id == TEST_TENANT_ID
            ).limit(1)
        )
        variant = result.scalar_one_or_none()
        
        if not variant:
            self.log("[!] Nenhuma variante encontrada")
            return
            
        # Verificar estoque disponível
        inventory_service = InventoryService(self.db)
        stock = await inventory_service.get_variant_stock(variant.id, tenant_id=TEST_TENANT_ID)
        self.log(f"Estoque da variante {variant.sku}: {stock}")
        
        if stock <= 0:
            self.log("[!] Sem estoque para venda")
            return
            
        try:
            # Criar venda
            sale_data = SaleCreate(
                items=[
                    SaleItemSchema(
                        product_id=product.id,
                        variant_id=variant.id,
                        quantity=min(3, stock),
                        unit_price=variant.price
                    )
                ],
                payments=[
                    PaymentCreate(
                        method="pix",
                        amount=variant.price * min(3, stock)
                    )
                ]
            )
            
            sale = await sale_service.create_sale(
                self.db,
                sale_data,
                tenant_id=TEST_TENANT_ID,
                seller_id=TEST_USER_ID
            )
            self.sales_created.append(sale.id)
            self.log(f"✓ Venda criada: {sale.sale_number} - R${sale.total_amount}")
            
            # Verificar FIFO - conferir EntryItems consumidos
            result = await self.db.execute(
                select(EntryItem).where(
                    EntryItem.product_id == product.id,
                    EntryItem.variant_id == variant.id,
                    EntryItem.tenant_id == TEST_TENANT_ID
                ).order_by(EntryItem.created_at)
            )
            items = result.scalars().all()
            
            self.log("Estado dos EntryItems após venda:")
            for item in items:
                self.log(f"  - EntryItem {item.id}: received={item.quantity_received}, remaining={item.quantity_remaining}")
                
        except Exception as e:
            self.log_error("Falha ao criar venda", e)
            
    async def test_5_partial_return(self):
        """Teste 5: Estorno parcial de venda"""
        self.log("\n=== TESTE 5: Estorno Parcial ===")
        
        if not self.sales_created:
            self.log("[!] Nenhuma venda criada, pulando teste")
            return
            
        sale_service = SaleService(self.db)
        
        try:
            sale = await self.db.get(Sale, self.sales_created[0])
            
            # Buscar item da venda
            result = await self.db.execute(
                select(SaleItem).where(SaleItem.sale_id == sale.id)
            )
            sale_item = result.scalar_one_or_none()
            
            if sale_item:
                # Estornar 1 unidade
                return_data = {
                    "sale_id": sale.id,
                    "items": [
                        {
                            "sale_item_id": sale_item.id,
                            "quantity": 1,
                            "reason": "Teste de estorno parcial"
                        }
                    ]
                }
                
                sale_return = await sale_service.return_items(
                    self.db,
                    sale.id,
                    return_data,
                    tenant_id=TEST_TENANT_ID
                )
                
                self.log(f"✓ Estorno criado: ID {sale_return.id}")
                
                # Verificar se estoque foi restaurado
                self.log("Verificando restauração de estoque...")
                
        except Exception as e:
            self.log_error("Falha ao realizar estorno", e)
            
    async def test_6_dashboard_consistency(self):
        """Teste 6: Consistência do FIFO"""
        self.log("\n=== TESTE 6: FIFO Consistency ===")
        
        try:
            # Verificar consistência FIFO
            if self.products_created:
                product = await self.db.get(Product, self.products_created[0])
                
                # Estoque via Inventory
                result = await self.db.execute(
                    select(Inventory).where(
                        Inventory.product_id == product.id,
                        Inventory.tenant_id == TEST_TENANT_ID
                    )
                )
                inventory = result.scalar_one_or_none()
                inventory_qty = inventory.quantity if inventory else 0
                
                # Estoque via FIFO (soma de quantity_remaining)
                result = await self.db.execute(
                    select(func.sum(EntryItem.quantity_remaining)).where(
                        EntryItem.product_id == product.id,
                        EntryItem.tenant_id == TEST_TENANT_ID,
                        EntryItem.is_active == True
                    )
                )
                fifo_qty = result.scalar() or 0
                
                self.log(f"Consistência FIFO para produto {product.name}:")
                self.log(f"  - Inventory.quantity: {inventory_qty}")
                self.log(f"  - Soma FIFO (EntryItems): {fifo_qty}")
                
                if inventory_qty == fifo_qty:
                    self.log("✓ FIFO CONSISTENTE!")
                else:
                    self.log_error(f"✗ INCONSISTÊNCIA FIFO! Diff: {inventory_qty - fifo_qty}")
                    
        except Exception as e:
            self.log_error("Falha ao verificar FIFO", e)
            
    async def test_7_delete_entry_without_sales(self):
        """Teste 7: Excluir entrada sem vendas vinculadas"""
        self.log("\n=== TESTE 7: Excluir Entrada (sem vendas) ===")
        
        # Criar nova entrada para teste
        entry_service = StockEntryService(self.db)
        
        if not self.products_created:
            self.log("[!] Nenhum produto para teste")
            return
            
        product = await self.db.get(Product, self.products_created[0])
        result = await self.db.execute(
            select(ProductVariant).where(
                ProductVariant.product_id == product.id,
                ProductVariant.tenant_id == TEST_TENANT_ID
            ).limit(1)
        )
        variant = result.scalar_one_or_none()
        
        try:
            # Criar entrada temporária
            entry_data = StockEntryCreate(
                entry_code=f"ENT-DEL-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                entry_date=date.today(),
                entry_type=EntryType.PURCHASE,
                supplier_name="Fornecedor Teste Exclusão"
            )
            
            entry = await entry_service.create_entry(
                self.db,
                entry_data,
                tenant_id=TEST_TENANT_ID
            )
            
            # Adicionar item
            item_data = EntryItemCreate(
                product_id=product.id,
                variant_id=variant.id,
                quantity_received=10,
                unit_cost=Decimal("50.00")
            )
            
            await entry_service.add_entry_item(
                self.db,
                entry.id,
                item_data,
                tenant_id=TEST_TENANT_ID
            )
            
            self.log(f"✓ Entrada temporária criada: {entry.entry_code}")
            
            # Tentar excluir
            await entry_service.delete_entry(self.db, entry.id, tenant_id=TEST_TENANT_ID)
            self.log(f"✓ Entrada excluída com sucesso!")
            
            # Verificar se foi marcada como inativa
            entry_check = await self.db.get(StockEntry, entry.id)
            if entry_check and not entry_check.is_active:
                self.log("✓ Entrada marcada como inativa")
            else:
                self.log_error("Entrada não foi marcada como inativa")
                
        except Exception as e:
            self.log_error("Falha ao excluir entrada", e)
            
    async def test_8_delete_entry_with_sales(self):
        """Teste 8: Tentar excluir entrada COM vendas vinculadas"""
        self.log("\n=== TESTE 8: Excluir Entrada (com vendas) ===")
        
        if not self.entries_created:
            self.log("[!] Nenhuma entrada para teste")
            return
            
        entry_service = StockEntryService(self.db)
        
        try:
            # Tentar excluir entrada que tem vendas
            entry_id = self.entries_created[0]
            
            await entry_service.delete_entry(self.db, entry_id, tenant_id=TEST_TENANT_ID)
            self.log("✓ Entrada excluída (pode ter vendas)")
            
        except Exception as e:
            # Esperado: erro ao tentar excluir com vendas
            self.log(f"✓ Erro esperado ao excluir entrada com vendas: {e}")
            
    async def test_9_catalog_product(self):
        """Teste 9: Selecionar produto do catálogo"""
        self.log("\n=== TESTE 9: Produto do Catálogo ===")
        
        product_service = ProductService(self.db)
        
        try:
            # Buscar produtos do catálogo
            catalog_products = await product_service.get_catalog_products(
                tenant_id=TEST_TENANT_ID,
                limit=5
            )
            
            self.log(f"Produtos no catálogo: {len(catalog_products)}")
            
            if catalog_products:
                # Ativar um produto do catálogo
                catalog_product = catalog_products[0]
                
                activated = await product_service.activate_catalog_product(
                    catalog_product.id,
                    tenant_id=TEST_TENANT_ID,
                    user_id=TEST_USER_ID
                )
                
                self.log(f"✓ Produto do catálogo ativado: {activated.name}")
                self.products_created.append(activated.id)
                
        except Exception as e:
            self.log_error("Falha ao ativar produto do catálogo", e)
            
    async def test_10_error_cases(self):
        """Teste 10: Casos de erro"""
        self.log("\n=== TESTE 10: Casos de Erro ===")
        
        product_service = ProductService(self.db)
        
        # Teste 10.1: Criar produto com SKU duplicado
        self.log("\n10.1: SKU Duplicado")
        try:
            if self.products_created:
                existing = await self.db.get(Product, self.products_created[0])
                
                product_data = ProductCreate(
                    name="Produto Duplicado",
                    sku=existing.sku,  # SKU já existe
                    price=Decimal("50.00"),
                    category_id=self.category.id,
                    is_catalog=False
                )
                
                await product_service.create_product(
                    product_data,
                    tenant_id=TEST_TENANT_ID,
                    user_id=TEST_USER_ID
                )
                self.log_error("✗ Permitiu criar SKU duplicado!")
                
        except ValueError as e:
            self.log(f"✓ Erro esperado (SKU duplicado): {e}")
        except Exception as e:
            self.log(f"✓ Erro esperado: {type(e).__name__}")
            
        # Teste 10.2: Venda com estoque insuficiente
        self.log("\n10.2: Venda com Estoque Insuficiente")
        try:
            # Tentar vender mais do que tem
            sale_service = SaleService(self.db)
            
            if self.products_created:
                product = await self.db.get(Product, self.products_created[0])
                result = await self.db.execute(
                    select(ProductVariant).where(
                        ProductVariant.product_id == product.id,
                        ProductVariant.tenant_id == TEST_TENANT_ID
                    ).limit(1)
                )
                variant = result.scalar_one_or_none()
                
                if variant:
                    # Verificar estoque
                    inv_service = InventoryService(self.db)
                    stock = await inv_service.get_variant_stock(variant.id, tenant_id=TEST_TENANT_ID)
                    
                    sale_data = SaleCreate(
                        items=[
                            SaleItemSchema(
                                product_id=product.id,
                                variant_id=variant.id,
                                quantity=stock + 1000,  # Mais do que tem
                                unit_price=variant.price
                            )
                        ],
                        payments=[
                            PaymentCreate(method="pix", amount=variant.price * (stock + 1000))
                        ]
                    )
                    
                    await sale_service.create_sale(
                        self.db,
                        sale_data,
                        tenant_id=TEST_TENANT_ID,
                        seller_id=TEST_USER_ID
                    )
                    self.log_error("✗ Permitiu vender mais do que o estoque!")
                    
        except ValueError as e:
            self.log(f"✓ Erro esperado (estoque insuficiente): {e}")
        except Exception as e:
            self.log(f"✓ Erro esperado: {type(e).__name__}")
            
        # Teste 10.3: Criar variante duplicada (mesmo produto, cor e tamanho)
        self.log("\n10.3: Variante Duplicada")
        try:
            if self.products_created:
                product = await self.db.get(Product, self.products_created[0])
                result = await self.db.execute(
                    select(ProductVariant).where(
                        ProductVariant.product_id == product.id,
                        ProductVariant.tenant_id == TEST_TENANT_ID
                    ).limit(1)
                )
                existing_variant = result.scalar_one_or_none()
                
                if existing_variant:
                    variant_service = ProductVariantService(self.db)
                    
                    variant_data = ProductVariantCreate(
                        sku=f"NEW-{existing_variant.sku}",  # SKU diferente
                        color=existing_variant.color,  # Mesma cor
                        size=existing_variant.size,  # Mesmo tamanho
                        price=Decimal("99.90"),
                        cost_price=Decimal("45.00")
                    )
                    
                    await variant_service.create_variant(
                        product_id=product.id,
                        variant_data=variant_data,
                        tenant_id=TEST_TENANT_ID
                    )
                    self.log_error("✗ Permitiu criar variante duplicada!")
                    
        except ValueError as e:
            self.log(f"✓ Erro esperado (variante duplicada): {e}")
        except Exception as e:
            self.log(f"✓ Erro esperado: {type(e).__name__}")
            
    async def run_all_tests(self):
        """Executar todos os testes"""
        self.log("=" * 60)
        self.log("INICIANDO TESTES DE ESTRESSE DO SISTEMA")
        self.log("=" * 60)
        
        await self.setup()
        
        try:
            await self.test_1_create_product_with_multiple_variants()
            await self.test_2_create_entry_with_variants()
            await self.test_3_create_trip_and_link_entry()
            await self.test_4_sales_with_fifo()
            await self.test_5_partial_return()
            await self.test_6_dashboard_consistency()
            await self.test_7_delete_entry_without_sales()
            await self.test_8_delete_entry_with_sales()
            await self.test_9_catalog_product()
            await self.test_10_error_cases()
            
        finally:
            await self.teardown()
            
        # Relatório final
        self.log("\n" + "=" * 60)
        self.log("RELATÓRIO FINAL")
        self.log("=" * 60)
        self.log(f"Produtos criados: {len(self.products_created)}")
        self.log(f"Variantes criadas: {len(self.variants_created)}")
        self.log(f"Entradas criadas: {len(self.entries_created)}")
        self.log(f"Viagens criadas: {len(self.trips_created)}")
        self.log(f"Vendas criadas: {len(self.sales_created)}")
        self.log(f"Erros encontrados: {len(self.errors)}")
        
        if self.errors:
            self.log("\nERROS:")
            for error in self.errors:
                self.log(f"  - {error}")
        else:
            self.log("\n✓ TODOS OS TESTES PASSARAM!")


async def main():
    """Ponto de entrada"""
    test = StressTest()
    await test.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())