"""Endpoints de Looks (conjuntos de produtos)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User
from app.schemas.look import LookCreate, LookUpdate, LookResponse, LookListResponse, LookItemCreate
from app.services.look_service import LookService

router = APIRouter(prefix="/looks", tags=["Looks"])


@router.get("/", response_model=List[LookListResponse])
async def list_looks(
    customer_id: Optional[int] = Query(None),
    is_public: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Listar looks da loja. Filtra por cliente ou visibilidade."""
    service = LookService()
    return await service.list(db, tenant_id, customer_id, is_public, skip, limit)


@router.get("/my", response_model=List[LookListResponse])
async def list_my_looks(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Looks criados pela loja (sem customer_id)."""
    service = LookService()
    return await service.list(db, tenant_id, customer_id=None, is_public=None, skip=skip, limit=limit)


@router.post("/", response_model=LookResponse, status_code=status.HTTP_201_CREATED)
async def create_look(
    data: LookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Criar novo look. Desconto de 10% aplicado automaticamente para 3+ peças."""
    service = LookService()
    return await service.create(db, tenant_id, data)


@router.get("/{look_id}", response_model=LookResponse)
async def get_look(
    look_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    service = LookService()
    look = await service.get(db, look_id, tenant_id)
    if not look:
        raise HTTPException(status_code=404, detail="Look não encontrado")
    return look


@router.put("/{look_id}", response_model=LookResponse)
async def update_look(
    look_id: int,
    data: LookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    service = LookService()
    look = await service.update(db, look_id, tenant_id, data)
    if not look:
        raise HTTPException(status_code=404, detail="Look não encontrado")
    return look


@router.delete("/{look_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_look(
    look_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    service = LookService()
    if not await service.delete(db, look_id, tenant_id):
        raise HTTPException(status_code=404, detail="Look não encontrado")


@router.post("/{look_id}/items", response_model=LookResponse)
async def add_item(
    look_id: int,
    data: LookItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Adicionar produto a um look existente."""
    service = LookService()
    look = await service.add_item(
        db, look_id, tenant_id, data.product_id, data.variant_id, data.position
    )
    if not look:
        raise HTTPException(status_code=404, detail="Look não encontrado")
    return look


@router.delete("/{look_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item(
    look_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Remover produto de um look."""
    service = LookService()
    if not await service.remove_item(db, look_id, item_id, tenant_id):
        raise HTTPException(status_code=404, detail="Item não encontrado")
