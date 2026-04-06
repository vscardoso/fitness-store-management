"""
Schemas Pydantic para Fornecedores.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, EmailStr


# ─────────────────────────────────────────────
# Supplier
# ─────────────────────────────────────────────

class SupplierBase(BaseModel):
    name: str
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class SupplierResponse(SupplierBase):
    id: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# SupplierProduct
# ─────────────────────────────────────────────

class SupplierProductResponse(BaseModel):
    """Produto comprado de um fornecedor, com métricas de compra."""
    id: int
    supplier_id: int
    product_id: int
    last_unit_cost: Decimal
    purchase_count: int
    last_purchase_date: date

    # Dados do produto
    product_name: Optional[str] = None
    product_sku: Optional[str] = None

    # Dados do fornecedor
    supplier_name: Optional[str] = None

    model_config = {"from_attributes": True}
