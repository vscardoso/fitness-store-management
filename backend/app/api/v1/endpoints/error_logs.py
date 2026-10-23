"""Registro de erros: leitura (admin) e envio de erros do app."""
import time
from collections import defaultdict, deque
from typing import Deque, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.error_log import ErrorLog
from app.models.user import User
from app.services.error_log_service import record_error

router = APIRouter(tags=["Registro de erros"])

_MAX_PER_MINUTE = 20
_recent: Dict[int, Deque[float]] = defaultdict(deque)


class ClientLog(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    level: str = Field("error", pattern="^(error|warning|info)$")
    route: Optional[str] = Field(None, max_length=300, description="tela do app onde aconteceu")
    context: Optional[dict] = None
    app_version: Optional[str] = Field(None, max_length=40)


@router.post("/client-logs", status_code=202, summary="O app avisa que deu erro")
async def create_client_log(
    data: ClientLog,
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    """Grava erro ocorrido no app (tela quebrou, resposta inesperada). Limita a 20 por minuto por usuário."""
    now = time.time()
    q = _recent[current_user.id]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= _MAX_PER_MINUTE:
        return {"ok": False, "reason": "limite"}
    q.append(now)
    await record_error(
        message=data.message, level=data.level, source="app", path=data.route, error_type="client",
        detail=data.context, tenant_id=current_user.tenant_id, user_id=current_user.id,
        user_agent=request.headers.get("user-agent"), app_version=data.app_version,
    )
    return {"ok": True}


@router.get("/error-logs", summary="Últimos erros da loja (admin)")
async def list_error_logs(
    limit: int = Query(50, ge=1, le=200),
    min_status: Optional[int] = Query(None, ge=100, le=599),
    source: Optional[str] = Query(None, pattern="^(api|app)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
) -> List[dict]:
    stmt = select(ErrorLog).where(ErrorLog.tenant_id == tenant_id).order_by(ErrorLog.id.desc()).limit(limit)
    if min_status is not None:
        stmt = stmt.where(ErrorLog.status_code >= min_status)
    if source:
        stmt = stmt.where(ErrorLog.source == source)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id, "quando": r.created_at, "nivel": r.level, "origem": r.source, "usuario": r.user_id,
            "metodo": r.method, "rota": r.path, "status": r.status_code, "tipo": r.error_type,
            "mensagem": r.message, "detalhe": r.detail,
        }
        for r in rows
    ]
