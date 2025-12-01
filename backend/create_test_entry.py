"""
Script para criar uma entrada de teste com vendas simuladas.
"""
import asyncio
from datetime import date
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.services.stock_entry_service import StockEntryService
from app.services.product_service import ProductService
from app.repositories.product_repository import ProductRepository
from app.repositories.entry_item_repository import EntryItemRepository
from app.schemas.stock_entry import StockEntryCreate
from app.schemas.entry_item import EntryItemCreate
from app.models.stock_entry import EntryType


async def create_test_data():
    """Cria dados de teste: entrada com produtos e simula venda."""
    DATABASE_URL = "sqlite+aiosqlite:///./fitness_store.db"
    engine = create_async_engine(DATABASE_URL, echo=False)

    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False
    )

    async with async_session() as db:
        tenant_id = 1
        user_id = 1

        print("\n" + "="*80)
        print("CRIACAO DE DADOS DE TESTE")
        print("="*80)

        # 1. Verificar/Criar produto
        product_repo = ProductRepository(db)
        products = await product_repo.get_multi(db, limit=1, tenant_id=tenant_id)

        if not products:
            print("\n[INFO] Criando produto de teste...")
            product_service = ProductService(db)
            from app.schemas.product import ProductCreate

            product_data = ProductCreate(
                name="Whey Protein Test",
                sku="WHY-TEST-001",
                barcode="7891234567890",
                cost_price=Decimal("45.00"),
                sale_price=Decimal("89.90"),
                description="Produto de teste para validacao",
                category_id=1,
                initial_stock=0,  # Sem estoque inicial
                min_stock=5,
            )

            try:
                product = await product_service.create_product(
                    product_data,
                    user_id=user_id,
                    tenant_id=tenant_id
                )
                print(f"[OK] Produto criado: {product.name} (ID: {product.id})")
            except Exception as e:
                print(f"[ERRO] Falha ao criar produto: {e}")
                return
        else:
            product = products[0]
            print(f"[INFO] Usando produto existente: {product.name} (ID: {product.id})")

        # 2. Criar entrada de estoque
        print("\n[INFO] Criando entrada de estoque...")
        entry_service = StockEntryService(db)

        entry_data = StockEntryCreate(
            entry_code="TEST-ENTRY-001",
            entry_date=date.today(),
            entry_type=EntryType.ONLINE,
            supplier_name="Fornecedor Teste",
            supplier_cnpj="12.345.678/0001-90",
            invoice_number="NF-TEST-001",
            notes="Entrada de teste para validacao de exclusao",
        )

        items = [
            EntryItemCreate(
                product_id=product.id,
                quantity_received=100,
                unit_cost=Decimal("45.00"),
                notes="Item de teste"
            )
        ]

        try:
            entry = await entry_service.create_entry(
                entry_data,
                items,
                user_id=user_id,
                tenant_id=tenant_id
            )
            print(f"[OK] Entrada criada: {entry.entry_code} (ID: {entry.id})")
            print(f"     Itens: {len(entry.entry_items)}")
            print(f"     Custo total: R$ {entry.total_cost}")

        except Exception as e:
            print(f"[ERRO] Falha ao criar entrada: {e}")
            await db.rollback()
            return

        # 3. Simular venda (reduzir quantity_remaining)
        print("\n[INFO] Simulando venda de produtos...")
        item_repo = EntryItemRepository()
        # TODO: Adicionar tenant_id quando executar em ambiente multi-tenant
        entry_items = await item_repo.get_by_entry(db, entry.id, tenant_id=2)  # Usando tenant_id padrão

        if entry_items:
            item = entry_items[0]
            print(f"[INFO] EntryItem ID: {item.id}")
            print(f"     Antes: quantity_received={item.quantity_received}, quantity_remaining={item.quantity_remaining}")

            # Simular venda de 30 unidades
            item.quantity_remaining -= 30
            await db.commit()
            await db.refresh(item)

            print(f"     Depois: quantity_received={item.quantity_received}, quantity_remaining={item.quantity_remaining}")
            print(f"     Vendido: {item.quantity_sold} unidades")
            print(f"[OK] Venda simulada com sucesso!")

        # 4. Criar entrada SEM vendas (para testar exclusao permitida)
        print("\n[INFO] Criando entrada SEM vendas...")
        entry_data2 = StockEntryCreate(
            entry_code="TEST-ENTRY-002",
            entry_date=date.today(),
            entry_type=EntryType.ONLINE,
            supplier_name="Fornecedor Teste 2",
            supplier_cnpj="98.765.432/0001-10",
            invoice_number="NF-TEST-002",
            notes="Entrada sem vendas - exclusao deve ser permitida",
        )

        items2 = [
            EntryItemCreate(
                product_id=product.id,
                quantity_received=50,
                unit_cost=Decimal("40.00"),
                notes="Item sem vendas"
            )
        ]

        try:
            entry2 = await entry_service.create_entry(
                entry_data2,
                items2,
                user_id=user_id,
                tenant_id=tenant_id
            )
            print(f"[OK] Entrada criada: {entry2.entry_code} (ID: {entry2.id})")
            print(f"     Itens: {len(entry2.entry_items)}")
            print(f"     Esta entrada NAO teve vendas")

        except Exception as e:
            print(f"[ERRO] Falha ao criar entrada 2: {e}")
            await db.rollback()
            return

        print("\n" + "="*80)
        print("DADOS DE TESTE CRIADOS COM SUCESSO")
        print("="*80)
        print(f"\nEntrada 1: {entry.entry_code} - COM vendas (30 unidades)")
        print(f"Entrada 2: {entry2.entry_code} - SEM vendas")
        print("\nAgora execute: python test_entry_sales_validation.py")


if __name__ == "__main__":
    asyncio.run(create_test_data())
