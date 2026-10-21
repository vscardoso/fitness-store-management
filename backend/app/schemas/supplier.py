"""
Schemas Pydantic para Fornecedores.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, EmailStr, field_serializer, field_validator


# ─────────────────────────────────────────────
# Supplier
# ─────────────────────────────────────────────

class SupplierBase(BaseModel):
    name: str
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


def _clean_name(value):
    """Nome do fornecedor: sem espaços nas pontas e com ao menos 2 caracteres."""
    if value is None:
        return value
    value = value.strip()
    if len(value) < 2:
        raise ValueError("Informe o nome do fornecedor (mínimo 2 caracteres)")
    return value


class SupplierCreate(SupplierBase):
    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return _clean_name(v)


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return _clean_name(v)


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
    supplier_cnpj: Optional[str] = None
    supplier_phone: Optional[str] = None

    # Selos calculados pela lista do produto (menor custo / mais compras)
    is_cheapest: bool = False
    is_most_frequent: bool = False

    @field_serializer("last_unit_cost")
    def _cost_as_number(self, value: Decimal) -> float:
        """O app faz contas e comparações com o custo: tem que ser número, não texto."""
        return float(value) if value is not None else 0.0

    model_config = {"from_attributes": True}
