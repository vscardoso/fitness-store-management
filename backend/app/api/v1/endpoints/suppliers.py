"""
Endpoints do Catálogo de Fornecedores.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User
from app.schemas.supplier import (
    SupplierCreate,
    SupplierResponse,
    SupplierUpdate,
    SupplierProductResponse,
)
from app.services.supplier_service import SupplierService

router = APIRouter(prefix="/suppliers", tags=["Fornecedores"])


def _sp_to_response(sp) -> SupplierProductResponse:
    """Converte SupplierProduct ORM em SupplierProductResponse."""
    return SupplierProductResponse(
        id=sp.id,
        supplier_id=sp.supplier_id,
        product_id=sp.product_id,
        last_unit_cost=sp.last_unit_cost,
        purchase_count=sp.purchase_count,
        last_purchase_date=sp.last_purchase_date,
        product_name=sp.product.name if sp.product else None,
        product_sku=getattr(sp.product, "sku", None) if sp.product else None,
        supplier_name=sp.supplier.name if sp.supplier else None,
    )


# ─────────────────────────────────────────────
# CRUD de Fornecedores
# ─────────────────────────────────────────────

@router.get("", response_model=List[SupplierResponse])
async def list_suppliers(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """Lista todos os fornecedores ativos do tenant."""
    svc = SupplierService(db)
    return await svc.list_suppliers(tenant_id=tenant_id, skip=skip, limit=limit)


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    data: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """Cria um novo fornecedor."""
    svc = SupplierService(db)
    return await svc.create_supplier(data, tenant_id)


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """Atualiza dados de um fornecedor."""
    svc = SupplierService(db)
    supplier = await svc.update_supplier(supplier_id, data, tenant_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    return supplier


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """Remove (soft delete) um fornecedor."""
    svc = SupplierService(db)
    ok = await svc.delete_supplier(supplier_id, tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")


# ─────────────────────────────────────────────
# Histórico de produtos por fornecedor
# ─────────────────────────────────────────────

@router.get("/{supplier_id}/products", response_model=List[SupplierProductResponse])
async def get_supplier_products(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """
    Lista todos os produtos já comprados deste fornecedor,
    com histórico de preço e contagem de compras.
    """
    svc = SupplierService(db)
    # Verifica se o fornecedor existe
    supplier = await svc.get_supplier(supplier_id, tenant_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    items = await svc.get_supplier_products(supplier_id, tenant_id)
    return [_sp_to_response(sp) for sp in items]


# ─────────────────────────────────────────────
# Fornecedores por produto (montado no router de produtos)
# ─────────────────────────────────────────────

product_supplier_router = APIRouter(tags=["Fornecedores"])


@product_supplier_router.get(
    "/products/{product_id}/suppliers",
    response_model=List[SupplierProductResponse],
)
async def get_product_suppliers(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """
    Lista todos os fornecedores que já venderam um produto,
    com histórico de preço e contagem de compras.
    """
    svc = SupplierService(db)
    items = await svc.get_product_suppliers(product_id, tenant_id)
    return [_sp_to_response(sp) for sp in items]
