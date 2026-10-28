"""Resolvedor único de código lido (etiqueta ou SKU). Registrado ANTES de /product-variants/{id}."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_id, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.code_lookup_service import CodeLookupService

router = APIRouter(prefix="/product-variants", tags=["Product Variants"])


class LookupVariant(BaseModel):
    id: int
    sku: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    price: float
    current_stock: int
    short_code: Optional[int] = None
    display_code: Optional[str] = None


class LookupProduct(BaseModel):
    id: int
    name: str
    brand: Optional[str] = None
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    base_price: float


class LookupResponse(BaseModel):
    match: str
    variant: LookupVariant
    product: LookupProduct
    siblings: List[LookupVariant]
    product_stock: int


@router.get("/lookup", response_model=LookupResponse, summary="Achar a peça pelo que foi lido (QR ou SKU)")
async def lookup_code(
    code: str = Query(..., min_length=1, max_length=120, description="Texto lido: PV#101-1, #101-1 ou SKU"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    found = await CodeLookupService(db).lookup(code, tenant_id)
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Código não encontrado nesta loja")
    return found
