"""Endpoints de Wishlist."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User
from app.schemas.wishlist import WishlistCreate, WishlistResponse, DemandItem
from app.services.wishlist_service import WishlistService

router = APIRouter(prefix="/wishlist", tags=["Wishlist"])


@router.get("/demand", response_model=List[DemandItem])
async def get_demand_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Relatório de demanda — produtos mais desejados na wishlist. Para vendedora/admin."""
    service = WishlistService()
    return await service.get_demand_report(db, tenant_id)


@router.get("/customer/{customer_id}", response_model=List[WishlistResponse])
async def get_customer_wishlist(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Wishlist de um cliente específico."""
    service = WishlistService()
    return await service.list_by_customer(db, customer_id, tenant_id)


@router.post("/", response_model=WishlistResponse, status_code=status.HTTP_201_CREATED)
async def add_to_wishlist(
    data: WishlistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Adicionar produto à wishlist de um cliente. Ignora duplicatas silenciosamente."""
    service = WishlistService()
    return await service.add(db, tenant_id, data)


@router.delete("/{wishlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_wishlist(
    wishlist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Remover item da wishlist."""
    service = WishlistService()
    if not await service.remove(db, wishlist_id, tenant_id):
        raise HTTPException(status_code=404, detail="Item não encontrado na wishlist")
