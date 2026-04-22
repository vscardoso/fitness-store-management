"""
Endpoints de consulta ao audit log (somente ADMIN).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional
from app.core.database import get_db
from app.api.deps import require_role, get_current_tenant_id
from app.models.audit_log import AuditLog
from app.models.user import UserRole
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/audit", tags=["Audit Log"])


class AuditLogResponse(BaseModel):
    id: int
    tenant_id: Optional[int]
    user_id: Optional[int]
    user_email: Optional[str]
    action: str
    entity: Optional[str]
    entity_id: Optional[int]
    detail: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get(
    "/",
    response_model=list[AuditLogResponse],
    dependencies=[Depends(require_role([UserRole.ADMIN]))],
)
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    action: Optional[str] = Query(None),
    entity: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    skip: int = Query(0),
):
    """Lista audit logs do tenant. Filtros: action, entity, user_id."""
    stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    stmt = stmt.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()
