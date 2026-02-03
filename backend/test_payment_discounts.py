"""
Script de teste completo do sistema de descontos por forma de pagamento.
Testa: Criação de descontos → Aplicação automática em vendas
"""
import asyncio
from decimal import Decimal
from datetime import datetime

from app.core.database import get_db
from app.repositories.payment_discount_repository import PaymentDiscountRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.customer_repository import CustomerRepository
from app.services.sale_service import SaleService
from app.schemas.payment_discount import PaymentDiscountCreate
from app.schemas.sale import SaleCreate, SaleItemCreate


async def test_payment_discounts():
    """Teste completo do sistema de descontos."""
    print("\n" + "=" * 80)
    print("🧪 TESTE: SISTEMA DE DESCONTOS POR FORMA DE PAGAMENTO")
    print("=" * 80)

    async for db in get_db():
        try:
            discount_repo = PaymentDiscountRepository()
            product_repo = ProductRepository()
            customer_repo = CustomerRepository()
            sale_service = SaleService(db)

            tenant_id = 1
            user_id = 1  # Admin

            # ================================================================
            # PASSO 1: Criar descontos via repository
            # ================================================================
            print("\n📝 PASSO 1: Criando descontos...")

            discounts_to_create = [
                {"payment_method": "pix", "discount_percentage": 10.0, "description": "Desconto PIX"},
                {"payment_method": "cash", "discount_percentage": 12.0, "description": "Desconto Dinheiro"},
                {"payment_method": "debit_card", "discount_percentage": 5.0, "description": "Desconto Débito"},
            ]

            created_discounts = []
            for discount_data in discounts_to_create:
                # Verificar se já existe
                existing = await discount_repo.get_by_payment_method(
                    db, tenant_id=tenant_id, payment_method=discount_data["payment_method"]
                )

                if existing:
                    print(f"  ℹ️  {discount_data['payment_method']}: Já existe ({existing.discount_percentage}%)")
                    created_discounts.append(existing)
                else:
                    discount = await discount_repo.create(
                        db,
                        obj_in=PaymentDiscountCreate(**discount_data),
                        tenant_id=tenant_id
                    )
                    print(f"  ✅ {discount_data['payment_method']}: Criado ({discount.discount_percentage}%)")
                    created_discounts.append(discount)

            # ================================================================
            # PASSO 2: Buscar produto e cliente para a venda
            # ================================================================
            print("\n📦 PASSO 2: Buscando produto e cliente...")

            # Buscar primeiro produto disponível
            products = await product_repo.get_multi(db, tenant_id=tenant_id, limit=1)
            if not products:
                print("  ❌ ERRO: Nenhum produto encontrado!")
                return

            product = products[0]
            print(f"  ✅ Produto: {product.name} - R$ {product.sale_price}")

            # Buscar primeiro cliente
            customers = await customer_repo.get_multi(db, tenant_id=tenant_id, limit=1)
            if not customers:
                print("  ❌ ERRO: Nenhum cliente encontrado!")
                return

            customer = customers[0]
            print(f"  ✅ Cliente: {customer.full_name}")

            # ================================================================
            # PASSO 3: Criar venda COM desconto (PIX)
            # ================================================================
            print("\n💰 PASSO 3: Criando venda com PIX (10% desconto)...")

            quantity = 2
            subtotal = Decimal(str(product.sale_price)) * quantity

            print(f"\n  Subtotal: R$ {subtotal:.2f}")
            print(f"  Forma de pagamento: PIX")
            print(f"  Desconto esperado: 10%")
            print(f"  Desconto em R$: R$ {subtotal * Decimal('0.10'):.2f}")
            print(f"  Total esperado: R$ {subtotal * Decimal('0.90'):.2f}")

            sale_data = SaleCreate(
                customer_id=customer.id,
                payment_method="pix",
                items=[
                    SaleItemCreate(
                        product_id=product.id,
                        quantity=quantity,
                        unit_price=product.sale_price,
                    )
                ],
            )

            sale = await sale_service.create_sale(
                tenant_id=tenant_id,
                user_id=user_id,
                sale_in=sale_data
            )

            print("\n  📊 RESULTADO DA VENDA:")
            print(f"  Venda #: {sale.sale_number}")
            print(f"  Subtotal: R$ {sale.subtotal:.2f}")
            print(f"  Desconto aplicado: R$ {sale.discount_amount:.2f}")
            print(f"  TOTAL: R$ {sale.total_amount:.2f}")
            print(f"  Status: {sale.status}")

            # ================================================================
            # PASSO 4: Verificar se desconto foi aplicado corretamente
            # ================================================================
            print("\n✅ PASSO 4: Validando desconto...")

            expected_discount = subtotal * Decimal('0.10')
            expected_total = subtotal - expected_discount

            if abs(sale.discount_amount - expected_discount) < Decimal('0.01'):
                print(f"  ✅ Desconto correto: R$ {sale.discount_amount:.2f}")
            else:
                print(f"  ❌ ERRO: Desconto esperado R$ {expected_discount:.2f}, obtido R$ {sale.discount_amount:.2f}")

            if abs(sale.total_amount - expected_total) < Decimal('0.01'):
                print(f"  ✅ Total correto: R$ {sale.total_amount:.2f}")
            else:
                print(f"  ❌ ERRO: Total esperado R$ {expected_total:.2f}, obtido R$ {sale.total_amount:.2f}")

            # ================================================================
            # PASSO 5: Testar venda SEM desconto (Crédito)
            # ================================================================
            print("\n💳 PASSO 5: Criando venda com Crédito (sem desconto)...")

            sale_data_credit = SaleCreate(
                customer_id=customer.id,
                payment_method="credit_card",
                items=[
                    SaleItemCreate(
                        product_id=product.id,
                        quantity=quantity,
                        unit_price=product.sale_price,
                    )
                ],
            )

            sale_credit = await sale_service.create_sale(
                tenant_id=tenant_id,
                user_id=user_id,
                sale_in=sale_data_credit
            )

            print(f"\n  📊 RESULTADO DA VENDA:")
            print(f"  Venda #: {sale_credit.sale_number}")
            print(f"  Subtotal: R$ {sale_credit.subtotal:.2f}")
            print(f"  Desconto aplicado: R$ {sale_credit.discount_amount:.2f}")
            print(f"  TOTAL: R$ {sale_credit.total_amount:.2f}")

            if sale_credit.discount_amount == 0:
                print(f"  ✅ Correto: Sem desconto para crédito")
            else:
                print(f"  ❌ ERRO: Não deveria ter desconto!")

            # ================================================================
            # RESUMO FINAL
            # ================================================================
            print("\n" + "=" * 80)
            print("📊 RESUMO DO TESTE")
            print("=" * 80)
            print(f"\nDescontos criados: {len(created_discounts)}")
            for d in created_discounts:
                print(f"  • {d.payment_method}: {d.discount_percentage}%")

            print(f"\nVendas criadas: 2")
            print(f"  • Venda PIX: R$ {sale.total_amount:.2f} (desconto de R$ {sale.discount_amount:.2f})")
            print(f"  • Venda Crédito: R$ {sale_credit.total_amount:.2f} (sem desconto)")

            print("\n✅ TESTE CONCLUÍDO COM SUCESSO!")
            print("=" * 80 + "\n")

        except Exception as e:
            print(f"\n❌ ERRO NO TESTE: {e}")
            import traceback
            traceback.print_exc()
        finally:
            break


if __name__ == "__main__":
    asyncio.run(test_payment_discounts())
