# -*- coding: utf-8 -*-
"""
Teste para verificar se vendas sao criadas automaticamente em devolucoes parciais.

Como executar:
    python backend/test_partial_return_sale.py
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from app.core.database import get_db
from app.services.conditional_shipment import ConditionalShipmentService
from app.repositories.conditional_shipment import ConditionalShipmentRepository
from app.repositories.sale_repository import SaleRepository
from app.schemas.conditional_shipment import (
    ConditionalShipmentCreate,
    ConditionalShipmentItemCreate,
    ProcessReturnRequest,
    ConditionalShipmentItemUpdate,
)


async def test_partial_return_creates_sale():
    """
    Testa se venda é criada automaticamente quando há produtos comprados,
    independente de create_sale=True ou False.
    """
    print("\n" + "="*70)
    print("TESTE: Criação automática de venda em devolução parcial")
    print("="*70 + "\n")

    # Setup: usar banco de testes
    DATABASE_URL = "sqlite+aiosqlite:///./test_fitness_store.db"
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("✓ Conexão com banco estabelecida\n")

        # IDs fixos para teste (assumindo que existem no banco)
        TENANT_ID = 1
        USER_ID = 1
        CUSTOMER_ID = 1
        PRODUCT_ID = 1  # Assumindo que produto 1 existe

        service = ConditionalShipmentService()
        sale_repo = SaleRepository(db)

        try:
            # 1. Criar envio condicional
            print("PASSO 1: Criando envio condicional...")
            shipment_data = ConditionalShipmentCreate(
                customer_id=CUSTOMER_ID,
                shipping_address="Rua Teste, 123 - Teste City",
                deadline_days=7,
                items=[
                    ConditionalShipmentItemCreate(
                        product_id=PRODUCT_ID,
                        quantity_sent=5,
                        unit_price=100.00,
                        notes="Produto teste"
                    )
                ]
            )

            shipment = await service.create_shipment(
                db, TENANT_ID, USER_ID, shipment_data
            )
            print(f"✓ Envio criado: ID={shipment.id}, Status={shipment.status}")

            # 2. Marcar como enviado
            print("\nPASSO 2: Marcando envio como SENT...")
            shipment = await service.mark_as_sent(
                db, shipment.id, TENANT_ID, USER_ID
            )
            print(f"✓ Envio marcado como SENT")

            # 3. Contar vendas antes
            sales_before = await sale_repo.get_multi(db, tenant_id=TENANT_ID)
            count_before = len(sales_before)
            print(f"\n✓ Vendas no sistema ANTES: {count_before}")

            # 4. TESTE PRINCIPAL: Processar devolução parcial com create_sale=False
            # MAS com produtos comprados (quantity_kept > 0)
            print("\nPASSO 3: Processando devolução parcial...")
            print("  - Cliente COMPROU: 3 unidades")
            print("  - Cliente DEVOLVEU: 2 unidades")
            print("  - create_sale=False (testando criação automática)")

            return_data = ProcessReturnRequest(
                items=[
                    ConditionalShipmentItemUpdate(
                        id=shipment.items[0].id,
                        quantity_kept=3,      # Cliente comprou 3
                        quantity_returned=2,  # Cliente devolveu 2
                        status="KEPT",
                        notes="Teste devolução parcial"
                    )
                ],
                create_sale=False,  # ← TESTE: False mas deve criar venda mesmo assim
                notes="Teste de criação automática de venda"
            )

            shipment = await service.process_return(
                db, shipment.id, TENANT_ID, USER_ID, return_data
            )

            # 5. Verificar se venda foi criada
            sales_after = await sale_repo.get_multi(db, tenant_id=TENANT_ID)
            count_after = len(sales_after)
            print(f"\n✓ Vendas no sistema DEPOIS: {count_after}")

            # 6. Validação
            if count_after > count_before:
                new_sale = sales_after[0]
                print("\n" + "="*70)
                print("✅ TESTE PASSOU: Venda criada automaticamente!")
                print("="*70)
                print(f"Venda ID: {new_sale.id}")
                print(f"Valor Total: R$ {new_sale.total_amount:.2f}")
                print(f"Status: {new_sale.status}")
                print(f"Observações: {new_sale.notes}")
                print("\n✓ Sistema funcionando corretamente: vendas são criadas")
                print("  automaticamente quando há produtos comprados, mesmo com")
                print("  create_sale=False.")
            else:
                print("\n" + "="*70)
                print("❌ TESTE FALHOU: Venda NÃO foi criada!")
                print("="*70)
                print("Esperado: Nova venda criada automaticamente")
                print("Obtido: Nenhuma venda criada")
                print("\n⚠️  O problema ainda existe!")

        except Exception as e:
            print("\n" + "="*70)
            print("❌ ERRO NO TESTE")
            print("="*70)
            print(f"Tipo: {type(e).__name__}")
            print(f"Mensagem: {str(e)}")
            import traceback
            print("\nStacktrace:")
            traceback.print_exc()

    print("\n" + "="*70)
    print("FIM DO TESTE")
    print("="*70 + "\n")


if __name__ == "__main__":
    print("\nIniciando teste de criacao automatica de vendas...\n")
    asyncio.run(test_partial_return_creates_sale())
