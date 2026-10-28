"""Conferência de estoque salva: histórico com data, quem contou e o resultado de cada peça (gerente e admin)."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.stock_count_service import StockCountConflict, StockCountError, StockCountNotFound, StockCountService

router = APIRouter(prefix="/reports/stock-counts", tags=["Conferência de estoque"])


class CountedItem(BaseModel):
    variant_id: int
    counted_quantity: int = Field(..., ge=0, le=1_000_000)


class StockCountCreate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    note: Optional[str] = Field(None, max_length=2000)
    category_id: Optional[int] = None
    items: List[CountedItem] = Field(..., min_length=1, max_length=50_000)
    finish: bool = Field(False, description="True = já cria finalizada (sem andamento)")


class StockCountUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    note: Optional[str] = Field(None, max_length=2000)
    items: List[CountedItem] = Field(default_factory=list, max_length=50_000)
    revision: int = Field(..., ge=1, description="A revisão que o aparelho abriu; se mudou, outra pessoa salvou antes")
    finish: bool = Field(False, description="True = finaliza: vira relatório fechado")


class StockCountSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: str = "finished"
    revision: int = 1
    name: Optional[str] = None
    note: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    created_by_name: Optional[str] = None
    total_variants: int
    counted_variants: int
    ok_variants: int
    diff_variants: int
    short_pieces: int
    over_pieces: int
    system_pieces: int
    counted_pieces: int


class StockCountItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    variant_id: Optional[int] = None
    product_id: Optional[int] = None
    product_name: str
    category_name: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    sku: Optional[str] = None
    display_code: Optional[str] = None
    system_quantity: int
    counted_quantity: int
    difference: int


class StockCountDetail(BaseModel):
    count: StockCountSummary
    items: List[StockCountItemOut]


class StockCountList(BaseModel):
    total: int
    results: List[StockCountSummary]


def _raise(exc: StockCountError):
    if isinstance(exc, StockCountNotFound):
        raise HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, StockCountConflict):
        raise HTTPException(status_code=409, detail=str(exc))
    raise HTTPException(status_code=400, detail=str(exc))


@router.post("", response_model=StockCountSummary, status_code=status.HTTP_201_CREATED, summary="Salvar uma conferência (em andamento)")
async def save_count(
    body: StockCountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    counts = {i.variant_id: i.counted_quantity for i in body.items}   # repetida: vale a última
    try:
        return await StockCountService(db).save(
            tenant_id=tenant_id, user=current_user, count_id=None, name=body.name, note=body.note,
            category_id=body.category_id, counts=counts, finish=body.finish,
        )
    except StockCountError as exc:
        _raise(exc)


@router.put("/{count_id}", response_model=StockCountSummary, summary="Atualizar o andamento ou finalizar")
async def update_count(
    count_id: int,
    body: StockCountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    counts = {i.variant_id: i.counted_quantity for i in body.items}
    try:
        return await StockCountService(db).save(
            tenant_id=tenant_id, user=current_user, count_id=count_id, name=body.name, note=body.note,
            category_id=None, counts=counts, finish=body.finish, revision=body.revision,
        )
    except StockCountError as exc:
        _raise(exc)


@router.get("", response_model=StockCountList, summary="Conferências salvas (mais recentes primeiro)")
async def list_counts(
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(open|finished)$"),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    svc = StockCountService(db)
    return StockCountList(total=await svc.total(tenant_id=tenant_id, status=status_filter),
                          results=await svc.list(tenant_id=tenant_id, status=status_filter, limit=limit, offset=offset))


@router.get("/{count_id}", response_model=StockCountDetail, summary="Uma conferência salva, peça por peça")
async def get_count(
    count_id: int,
    only_diffs: bool = Query(False, description="Só as peças que não conferem"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    found = await StockCountService(db).get(tenant_id=tenant_id, count_id=count_id, only_diffs=only_diffs)
    if found is None:
        raise HTTPException(status_code=404, detail="Conferência não encontrada.")
    return found
