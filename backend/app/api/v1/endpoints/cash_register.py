"""Caixa da loja: abrir, suprimento/sangria, fechar (todos os papéis) e histórico (gerente e admin)."""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.cash_register_service import CashConflict, CashError, CashNotFound, CashRegisterService, REASONS

router = APIRouter(prefix="/cash", tags=["Caixa"])


class OpenBody(BaseModel):
    opening_amount: float = Field(..., ge=0, le=1_000_000, description="Dinheiro que já está na gaveta ao abrir")
    note: Optional[str] = Field(None, max_length=500)


class MovementBody(BaseModel):
    kind: Literal["supply", "withdrawal"]
    amount: float = Field(..., gt=0, le=1_000_000)
    reason: str = Field(..., max_length=20)
    note: Optional[str] = Field(None, max_length=500)
    account_id: Optional[int] = Field(None, description="Conta do Financeiro de onde veio (reforço) ou para onde foi (retirada) o dinheiro")


class CloseBody(BaseModel):
    counted_amount: float = Field(..., ge=0, le=1_000_000, description="Dinheiro contado na gaveta")
    note: Optional[str] = Field(None, max_length=500)


def _raise(exc: CashError):
    code = status.HTTP_409_CONFLICT if isinstance(exc, CashConflict) else (
        status.HTTP_404_NOT_FOUND if isinstance(exc, CashNotFound) else status.HTTP_400_BAD_REQUEST)
    raise HTTPException(code, str(exc))


@router.get("/reasons", summary="Motivos de suprimento e sangria")
async def reasons(current_user: User = Depends(get_current_active_user)):
    return {kind: [{"id": k, "label": v} for k, v in items.items()] for kind, items in REASONS.items()}


@router.get("/current", summary="Caixa aberto agora (com o esperado calculado ao vivo)")
async def current(
    db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    return await CashRegisterService(db).current(tenant_id)


@router.post("/open", status_code=status.HTTP_201_CREATED, summary="Abrir o caixa")
async def open_cash(
    body: OpenBody, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    try:
        return await CashRegisterService(db).open(tenant_id, current_user, body.opening_amount, body.note)
    except CashError as exc:
        _raise(exc)


@router.post("/movements", status_code=status.HTTP_201_CREATED, summary="Suprimento (entrou) ou sangria (saiu)")
async def movement(
    body: MovementBody, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    try:
        return await CashRegisterService(db).add_movement(tenant_id, current_user, body.kind, body.amount, body.reason, body.note, account_id=body.account_id)
    except CashError as exc:
        _raise(exc)


@router.post("/close", summary="Fechar o caixa contando o dinheiro")
async def close_cash(
    body: CloseBody, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    try:
        return await CashRegisterService(db).close(tenant_id, current_user, body.counted_amount, body.note)
    except CashError as exc:
        _raise(exc)


@router.get("/sessions", summary="Histórico de caixas (gerente e admin)")
async def sessions(
    skip: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    return await CashRegisterService(db).list_sessions(tenant_id, skip, limit)


@router.get("/sessions/{session_id}", summary="Um caixa com tudo (gerente e admin)")
async def session_detail(
    session_id: int, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    try:
        return await CashRegisterService(db).detail(tenant_id, session_id)
    except CashError as exc:
        _raise(exc)
