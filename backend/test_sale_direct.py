"""
Script para testar validacao diretamente usando os schemas Pydantic.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime
from decimal import Decimal
from app.schemas.sale import SaleResponse, SaleItemResponse, PaymentResponse
from app.models.sale import PaymentMethod, SaleStatus

# Simular dados exatamente como retornados pelo banco
print("=== TESTANDO VALIDACAO DO SCHEMA ===\n")

# Dados da venda (exatamente como no banco)
sale_data = {
    "id": 6,
    "sale_number": "VENDA-20251128183842",
    "status": SaleStatus.COMPLETED,
    "subtotal": Decimal("100"),
    "discount_amount": Decimal("0"),
    "tax_amount": Decimal("0"),
    "total_amount": Decimal("100"),
    "payment_method": PaymentMethod.DEBIT_CARD,
    "payment_reference": None,
    "loyalty_points_used": Decimal("0"),
    "loyalty_points_earned": Decimal("10"),
    "notes": None,
    "customer_id": 3,
    "seller_id": 2,
    "created_at": datetime(2025, 11, 28, 18, 38, 42),
    "updated_at": datetime(2025, 11, 28, 18, 38, 42),
    "is_active": True,
    "tenant_id": None,
}

# Item da venda
item_data = {
    "id": 6,
    "quantity": 1,
    "unit_price": Decimal("100"),
    "subtotal": Decimal("100"),
    "discount_amount": Decimal("0"),
    "sale_sources": {"sources": [{"entry_id": 11, "entry_item_id": 19, "quantity_taken": 1, "unit_cost": 20.0, "total_cost": 20.0, "entry_code": "TESTE001", "entry_date": "2025-11-27"}]},
    "sale_id": 6,
    "product_id": 5,
    "created_at": datetime(2025, 11, 28, 18, 38, 42),
    "updated_at": datetime(2025, 11, 28, 18, 38, 42),
    "is_active": True,
    "tenant_id": None,
}

# Pagamento
payment_data = {
    "id": 6,
    "amount": Decimal("100"),
    "payment_method": PaymentMethod.DEBIT_CARD,
    "payment_reference": None,
    "status": "confirmed",
    "notes": None,
    "sale_id": 6,
    "created_at": datetime(2025, 11, 28, 18, 38, 42),
    "updated_at": datetime(2025, 11, 28, 18, 38, 42),
    "is_active": True,
    "tenant_id": None,
}

# Testar SaleItemResponse
print("1. Testando SaleItemResponse...")
try:
    item_response = SaleItemResponse(**item_data)
    print(f"   [OK] SUCESSO: {item_response}")
except Exception as e:
    print(f"   [ERRO] {e}")
    print(f"   Tipo: {type(e)}")

# Testar PaymentResponse
print("\n2. Testando PaymentResponse...")
try:
    payment_response = PaymentResponse(**payment_data)
    print(f"   [OK] SUCESSO: {payment_response}")
except Exception as e:
    print(f"   [ERRO] {e}")
    print(f"   Tipo: {type(e)}")

# Testar SaleResponse com items e payments vazios
print("\n3. Testando SaleResponse (sem items/payments)...")
try:
    sale_response = SaleResponse(**sale_data, items=[], payments=[])
    print(f"   [OK] SUCESSO: {sale_response}")
except Exception as e:
    print(f"   [ERRO] {e}")
    print(f"   Tipo: {type(e)}")

# Testar SaleResponse completo
print("\n4. Testando SaleResponse (com items e payments)...")
try:
    item_response = SaleItemResponse(**item_data)
    payment_response = PaymentResponse(**payment_data)

    sale_response = SaleResponse(
        **sale_data,
        items=[item_response],
        payments=[payment_response]
    )
    print(f"   [OK] SUCESSO!")
    print(f"   Sale ID: {sale_response.id}")
    print(f"   Items: {len(sale_response.items)}")
    print(f"   Payments: {len(sale_response.payments)}")
except Exception as e:
    print(f"   [ERRO] {e}")
    print(f"   Tipo: {type(e)}")
    import traceback
    traceback.print_exc()

# Comparar campos
print("\n=== COMPARACAO DE CAMPOS ===")
print("\nCampos no banco (Sale):")
sale_db_fields = set(sale_data.keys())
print(sorted(sale_db_fields))

print("\nCampos no SaleResponse:")
from pydantic import BaseModel
sale_schema_fields = set(SaleResponse.model_fields.keys())
print(sorted(sale_schema_fields))

print("\nCampos no banco MAS NAO no schema:")
print(sorted(sale_db_fields - sale_schema_fields))

print("\nCampos no schema MAS NAO no banco:")
print(sorted(sale_schema_fields - sale_db_fields))

print("\n\nCampos no banco (SaleItem):")
item_db_fields = set(item_data.keys())
print(sorted(item_db_fields))

print("\nCampos no SaleItemResponse:")
item_schema_fields = set(SaleItemResponse.model_fields.keys())
print(sorted(item_schema_fields))

print("\nCampos no banco MAS NAO no schema:")
print(sorted(item_db_fields - item_schema_fields))

print("\nCampos no schema MAS NAO no banco:")
print(sorted(item_schema_fields - item_db_fields))

print("\n\nCampos no banco (Payment):")
payment_db_fields = set(payment_data.keys())
print(sorted(payment_db_fields))

print("\nCampos no PaymentResponse:")
payment_schema_fields = set(PaymentResponse.model_fields.keys())
print(sorted(payment_schema_fields))

print("\nCampos no banco MAS NAO no schema:")
print(sorted(payment_db_fields - payment_schema_fields))

print("\nCampos no schema MAS NAO no banco:")
print(sorted(payment_schema_fields - payment_db_fields))
