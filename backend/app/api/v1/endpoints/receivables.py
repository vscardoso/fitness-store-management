"""Fiado (contas a receber): parcelas em aberto, receber, desfazer recebimento e fiado antigo da implantação.

Permissões (app/core/permissions.py): consultar e receber = caixa (é dinheiro entrando);
lançar fiado antigo, cancelar lançamento e desfazer recebimento = gerente.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.finance_service import FinanceConflict, FinanceError, FinanceNotFound
from app.services.receivable_service import ReceivableService

router = APIRouter(prefix="/receivables", tags=["Fiado"])


def _http(e: FinanceError) -> HTTPException:
    code = 404 if isinstance(e, FinanceNotFound) else 409 if isinstance(e, FinanceConflict) else 400
    return HTTPException(status_code=code, detail=str(e))


@router.get("", summary="Parcelas do fiado (open, overdue, paid, canceled, all) e o resumo")
async def list_receivables(status: Optional[str] = Query("open"), customer_id: Optional[int] = Query(None),
                           db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                           current_user: User = Depends(get_current_active_user)):
    return await ReceivableService(db).list(tenant_id, status=status, customer_id=customer_id)


@router.get("/summary", summary="Quanto há em aberto, vencido e vencendo nesta semana")
async def summary(customer_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db),
                  tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    return await ReceivableService(db).summary(tenant_id, customer_id=customer_id)


@router.get("/{receivable_id}/payments", summary="Recebimentos de uma parcela")
async def payments(receivable_id: int, db: AsyncSession = Depends(get_db),
                   tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    return await ReceivableService(db).payments(tenant_id, receivable_id)


async def _run(fn):
    try:
        return await fn
    except FinanceError as e:
        raise _http(e)


@router.post("/receive", summary="Receber (de uma parcela ou da cliente, das mais antigas primeiro)")
async def receive(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                  tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    return await _run(ReceivableService(db).receive(tenant_id, current_user, data))


@router.post("/opening", summary="Lançar fiado que já existia antes do app")
async def opening(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                  tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    return await _run(ReceivableService(db).create_opening(tenant_id, current_user, data))


@router.post("/{receivable_id}/cancel", summary="Cancelar fiado antigo lançado errado (sem recebimento)")
async def cancel(receivable_id: int, db: AsyncSession = Depends(get_db),
                 tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    return await _run(ReceivableService(db).cancel(tenant_id, receivable_id))


@router.delete("/payments/{payment_id}", summary="Desfazer um recebimento")
async def undo(payment_id: int, db: AsyncSession = Depends(get_db),
               tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    return await _run(ReceivableService(db).undo_payment(tenant_id, payment_id))
