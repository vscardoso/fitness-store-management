"""Endpoints de sugestões de combinação e tags de produto."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_tenant_id
from app.models.user import User
from app.services.suggestion_service import SuggestionService
from app.schemas.product_tag import SuggestionResponse, ProductTagCreate, ProductTagResponse

router = APIRouter(prefix="/suggestions", tags=["Sugestões"])
_svc = SuggestionService()


@router.get("/{product_id}", response_model=List[SuggestionResponse])
async def get_suggestions(
    product_id: int,
    limit: int = Query(6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Retorna produtos que combinam com o produto indicado."""
    return await _svc.suggest(db, product_id, tenant_id, limit)


@router.get("/{product_id}/tags", response_model=List[ProductTagResponse])
async def get_product_tags(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _svc.get_tags(db, product_id)


@router.post("/tags", response_model=ProductTagResponse, status_code=201)
async def add_product_tag(
    data: ProductTagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    return await _svc.add_tag(db, tenant_id, data)


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_product_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await _svc.delete_tag(db, tag_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tag não encontrada")
