"""Tempo de resposta da API por rota (somente admin). Ver app/core/perf_trace.py."""
from fastapi import APIRouter, Depends, Query

from app.api.deps import require_admin
from app.core.perf_trace import snapshot
from app.models.user import User

router = APIRouter(tags=["Desempenho"])


@router.get("/perf", summary="Rotas mais pesadas e requisições lentas recentes")
async def get_perf(top: int = Query(25, ge=1, le=100), current_user: User = Depends(require_admin)):
    return snapshot(top)
