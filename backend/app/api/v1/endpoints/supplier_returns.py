"""Devolução ao fornecedor: peça com defeito ou de condicional que volta ao fornecedor para troca/crédito."""
from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.supplier_return_service import SupplierReturnService

router = APIRouter(prefix="/supplier-returns", tags=["Devolução ao fornecedor"])


class SupplierReturnCreate(BaseModel):
    quantity: int = Field(..., gt=0)
    reason: str = Field(..., min_length=3, max_length=500)
    entry_item_id: Optional[int] = Field(None, description="Peça que está no estoque (ex.: compra em condicional)")
    return_item_id: Optional[int] = Field(None, description="Peça com defeito devolvida por cliente")


class SupplierReturnResolve(BaseModel):
    outcome: Literal["exchanged", "credited", "rejected"]
    note: Optional[str] = Field(None, max_length=500)
    replacement_variant_id: Optional[int] = Field(None, description="Troca: peça que o fornecedor mandou (padrão: a mesma)")
    credit_amount: Optional[Decimal] = Field(None, gt=0, description="Crédito: valor que o fornecedor devolveu")


class SupplierReturnOut(BaseModel):
    id: int
    supplier_id: Optional[int] = None
    entry_id: int
    entry_item_id: int
    variant_id: Optional[int] = None
    product_id: Optional[int] = None
    return_item_id: Optional[int] = None
    quantity: int
    unit_cost: Decimal
    from_stock: bool
    reason: str
    status: str
    resolved_at: Optional[datetime] = None
    credit_amount: Optional[Decimal] = None
    replacement_entry_item_id: Optional[int] = None
    resolution_note: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


def _bad(e: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/defective-pending")
async def defective_pending(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Peças com defeito devolvidas por clientes que ainda não foram enviadas ao fornecedor."""
    return await SupplierReturnService(db).defective_pending(tenant_id=tenant_id)


@router.get("/", response_model=List[SupplierReturnOut])
async def list_supplier_returns(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    return await SupplierReturnService(db).list(tenant_id=tenant_id, status=status_filter)


@router.post("/", response_model=SupplierReturnOut, status_code=status.HTTP_201_CREATED)
async def create_supplier_return(
    data: SupplierReturnCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        return await SupplierReturnService(db).create(
            tenant_id=tenant_id, user_id=user.id, reason=data.reason, quantity=data.quantity,
            entry_item_id=data.entry_item_id, return_item_id=data.return_item_id,
        )
    except ValueError as e:
        raise _bad(e)


@router.post("/{supplier_return_id}/resolve", response_model=SupplierReturnOut)
async def resolve_supplier_return(
    supplier_return_id: int,
    data: SupplierReturnResolve,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        return await SupplierReturnService(db).resolve(
            supplier_return_id, tenant_id=tenant_id, outcome=data.outcome, note=data.note,
            replacement_variant_id=data.replacement_variant_id, credit_amount=data.credit_amount,
        )
    except ValueError as e:
        raise _bad(e)
