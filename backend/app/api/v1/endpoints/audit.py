"""
Histórico de alterações (somente ADMIN, somente leitura).

NÃO existe rota para apagar ou editar registros: o histórico só cresce.
"""
from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_id, require_role
from app.core.database import get_db
from app.core.timezone import make_aware, to_utc
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.services.audit_service import CATEGORIES, CATEGORY_PREFIXES, category_of

router = APIRouter(prefix="/audit", tags=["Audit Log"])


class AuditLogResponse(BaseModel):
    id: int
    tenant_id: Optional[int]
    user_id: Optional[int]
    user_email: Optional[str]
    user_name: Optional[str] = None
    action: str
    category: str = "outros"
    entity: Optional[str]
    entity_id: Optional[int]
    detail: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogPage(BaseModel):
    items: list[AuditLogResponse]
    total_count: int
    limit: int
    skip: int


def _day_start_utc(d: date) -> datetime:
    """Meia-noite do dia no Brasil, em UTC naive (como `created_at` é gravado)."""
    return to_utc(make_aware(datetime.combine(d, time.min))).replace(tzinfo=None)


@router.get(
    "",
    response_model=AuditLogPage,
    dependencies=[Depends(require_role([UserRole.ADMIN]))],
)
@router.get("/", response_model=AuditLogPage, include_in_schema=False,
            dependencies=[Depends(require_role([UserRole.ADMIN]))])
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    action: Optional[str] = Query(None),
    entity: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None, description="dinheiro, estoque, vendas ou pessoas"),
    start_date: Optional[date] = Query(None, description="Dia (fuso do Brasil), inclusive"),
    end_date: Optional[date] = Query(None, description="Dia (fuso do Brasil), inclusive"),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
):
    """Histórico da loja, do mais novo para o mais antigo. Só mostra a loja do administrador logado."""
    conds: list[Any] = [AuditLog.tenant_id == tenant_id]
    if action:
        conds.append(AuditLog.action == action)
    if entity:
        conds.append(AuditLog.entity == entity)
    if user_id:
        conds.append(AuditLog.user_id == user_id)
    if category:
        prefixes = CATEGORY_PREFIXES.get(category.lower())
        if prefixes is None:
            return AuditLogPage(items=[], total_count=0, limit=limit, skip=skip)
        conds.append(or_(*[AuditLog.action.like(f"{p}%") for p in prefixes]))
    if start_date:
        conds.append(AuditLog.created_at >= _day_start_utc(start_date))
    if end_date:
        conds.append(AuditLog.created_at < _day_start_utc(end_date + timedelta(days=1)))

    total = (await db.execute(select(func.count(AuditLog.id)).where(*conds))).scalar() or 0
    rows = (await db.execute(
        select(AuditLog).where(*conds).order_by(desc(AuditLog.created_at), desc(AuditLog.id)).offset(skip).limit(limit)
    )).scalars().all()

    ids = {r.user_id for r in rows if r.user_id}
    names: dict[int, str] = {}
    if ids:
        names = {
            uid: name for uid, name in (await db.execute(
                select(User.id, User.full_name).where(User.id.in_(ids), User.tenant_id == tenant_id)
            )).all()
        }
    items = []
    for r in rows:
        item = AuditLogResponse.model_validate(r)
        item.user_name = names.get(r.user_id) if r.user_id else None
        item.category = category_of(r.action)
        items.append(item)
    return AuditLogPage(items=items, total_count=int(total), limit=limit, skip=skip)


@router.get("/categories", dependencies=[Depends(require_role([UserRole.ADMIN]))])
async def audit_categories():
    return {"categories": list(CATEGORIES)}
