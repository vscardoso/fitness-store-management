"""
Script para debugar ResponseValidationError em POST /sales/
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, selectinload
from app.models.sale import Sale, SaleItem, Payment
from app.schemas.sale import SaleResponse, SaleItemResponse, PaymentResponse
from pydantic import ValidationError
import json

DATABASE_URL = "sqlite+aiosqlite:///./fitness_store.db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def test_latest_sale():
    """Testa serialização da última venda criada."""
    async with AsyncSessionLocal() as db:
        # Buscar última venda
        from sqlalchemy import select, desc
        
        result = await db.execute(
            select(Sale)
            .options(
                selectinload(Sale.items),
                selectinload(Sale.payments)
            )
            .order_by(desc(Sale.id))
            .limit(1)
        )
        sale = result.scalar_one_or_none()
        
        if not sale:
            print("❌ Nenhuma venda encontrada no banco")
            return
        
        print(f"\n📦 VENDA ENCONTRADA: {sale.sale_number} (ID: {sale.id})")
        print(f"   Status: {sale.status}")
        print(f"   Total: R$ {sale.total_amount}")
        print(f"   Items: {len(sale.items)}")
        print(f"   Payments: {len(sale.payments)}")
        
        # Tentar serializar cada item individualmente
        print("\n🔍 TESTANDO ITEMS:")
        for i, item in enumerate(sale.items, 1):
            try:
                item_dict = {
                    "id": item.id,
                    "product_id": item.product_id,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "discount_amount": item.discount_amount,
                    "subtotal": item.subtotal,
                }
                print(f"   Item {i}: {item_dict}")
                validated = SaleItemResponse(**item_dict)
                print(f"   ✅ Item {i} validado com sucesso")
            except ValidationError as e:
                print(f"   ❌ Item {i} FALHOU:")
                print(f"      {e}")
        
        # Tentar serializar cada payment individualmente
        print("\n💳 TESTANDO PAYMENTS:")
        for i, payment in enumerate(sale.payments, 1):
            try:
                payment_dict = {
                    "id": payment.id,
                    "amount": payment.amount,
                    "payment_method": payment.payment_method,
                    "payment_reference": payment.payment_reference,
                    "status": payment.status,
                    "created_at": payment.created_at,
                }
                print(f"   Payment {i}: {payment_dict}")
                validated = PaymentResponse(**payment_dict)
                print(f"   ✅ Payment {i} validado com sucesso")
            except ValidationError as e:
                print(f"   ❌ Payment {i} FALHOU:")
                print(f"      {e}")
        
        # Tentar serializar venda completa
        print("\n🎯 TESTANDO SALE COMPLETA:")
        try:
            # Converter para dict manualmente
            sale_dict = {
                "id": sale.id,
                "sale_number": sale.sale_number,
                "customer_id": sale.customer_id,
                "seller_id": sale.seller_id,
                "subtotal": sale.subtotal,
                "discount_amount": sale.discount_amount,
                "tax_amount": sale.tax_amount,
                "total_amount": sale.total_amount,
                "payment_method": sale.payment_method,
                "payment_reference": sale.payment_reference,
                "loyalty_points_used": sale.loyalty_points_used,
                "loyalty_points_earned": sale.loyalty_points_earned,
                "status": sale.status,
                "notes": sale.notes,
                "items": [
                    {
                        "id": item.id,
                        "product_id": item.product_id,
                        "quantity": item.quantity,
                        "unit_price": item.unit_price,
                        "discount_amount": item.discount_amount,
                        "subtotal": item.subtotal,
                    }
                    for item in sale.items
                ],
                "payments": [
                    {
                        "id": payment.id,
                        "amount": payment.amount,
                        "payment_method": payment.payment_method,
                        "payment_reference": payment.payment_reference,
                        "status": payment.status,
                        "created_at": payment.created_at,
                    }
                    for payment in sale.payments
                ],
                "created_at": sale.created_at,
                "updated_at": sale.updated_at,
            }
            
            print(f"   Sale Dict: {json.dumps(str(sale_dict), indent=2)}")
            validated = SaleResponse(**sale_dict)
            print(f"   ✅ SALE COMPLETA VALIDADA COM SUCESSO!")
            print(f"\n✅ TUDO OK! O problema NÃO está na serialização Pydantic.")
            print(f"   O erro 422 deve estar em outro lugar (ex: eager loading no endpoint)")
            
        except ValidationError as e:
            print(f"   ❌ SALE COMPLETA FALHOU:")
            print(f"      {e.json(indent=2)}")
            print(f"\n🔥 PROBLEMA ENCONTRADO: O schema não valida corretamente!")
        
        # Testar usando from_attributes diretamente
        print("\n🔄 TESTANDO COM from_attributes (ORM):")
        try:
            validated = SaleResponse.model_validate(sale)
            print(f"   ✅ from_attributes FUNCIONOU!")
        except ValidationError as e:
            print(f"   ❌ from_attributes FALHOU:")
            print(f"      {e.json(indent=2)}")


if __name__ == "__main__":
    asyncio.run(test_latest_sale())
