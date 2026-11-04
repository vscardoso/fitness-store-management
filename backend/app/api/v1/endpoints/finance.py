"""Financeiro: implantação da loja em andamento, saldos das contas, transferências e contas a pagar.

Permissões (matriz em app/core/permissions.py): implantar e criar contas = admin; o resto = gerente e admin.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.finance_service import FinanceConflict, FinanceError, FinanceNotFound, FinanceService

router = APIRouter(prefix="/finance", tags=["Financeiro"])


def _http(e: FinanceError) -> HTTPException:
    code = 404 if isinstance(e, FinanceNotFound) else 409 if isinstance(e, FinanceConflict) else 400
    return HTTPException(status_code=code, detail=str(e))


@router.get("/accounts", summary="Contas e saldos (calculados na hora)")
async def accounts(db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                   current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).balances(tenant_id)
    except FinanceError as e:
        raise _http(e)


@router.post("/setup", summary="Implantar a loja em andamento (tudo ou nada, uma vez)")
async def setup(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).setup(tenant_id, current_user, data)
    except FinanceError as e:
        raise _http(e)


@router.post("/accounts", summary="Nova conta de banco")
async def add_bank(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                   tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).add_bank(tenant_id, data)
    except FinanceError as e:
        raise _http(e)


@router.put("/accounts/{account_id}/pix", summary="Esta conta passa a receber o PIX das vendas")
async def set_pix(account_id: int, db: AsyncSession = Depends(get_db),
                  tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).set_pix_account(tenant_id, account_id)
    except FinanceError as e:
        raise _http(e)


@router.get("/transfers", summary="Transferências entre contas")
async def transfers(db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                    current_user: User = Depends(get_current_active_user)) -> List[Dict[str, Any]]:
    return await FinanceService(db).list_transfers(tenant_id)


@router.post("/transfers", summary="Transferir (depósito da gaveta, repasse da maquininha)")
async def transfer(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                   tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).transfer(tenant_id, current_user, data)
    except FinanceError as e:
        raise _http(e)


@router.get("/payables", summary="Contas a pagar")
async def payables(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db),
                   tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    return await FinanceService(db).list_payables(tenant_id, status)


@router.post("/payables", summary="Nova conta a pagar")
async def create_payable(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                         tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).create_payable(tenant_id, data)
    except FinanceError as e:
        raise _http(e)


@router.post("/payables/{payable_id}/pay", summary="Pagar (sai da conta escolhida)")
async def pay_payable(payable_id: int, data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                      tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).pay_payable(tenant_id, payable_id, data)
    except FinanceError as e:
        raise _http(e)


@router.post("/payables/{payable_id}/cancel", summary="Cancelar conta em aberto")
async def cancel_payable(payable_id: int, db: AsyncSession = Depends(get_db),
                         tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).cancel_payable(tenant_id, payable_id)
    except FinanceError as e:
        raise _http(e)
