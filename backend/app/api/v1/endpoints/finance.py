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
from app.services.month_closing_service import MonthClosingService

router = APIRouter(prefix="/finance", tags=["Financeiro"])


def _http(e: FinanceError) -> HTTPException:
    code = 404 if isinstance(e, FinanceNotFound) else 409 if isinstance(e, FinanceConflict) else 400
    return HTTPException(status_code=code, detail=str(e))


@router.get("/accounts", summary="Contas e saldos (calculados na hora)")
async def accounts(db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                   current_user: User = Depends(get_current_active_user)):
    try:
        svc = FinanceService(db)
        data = await svc.balances(tenant_id)
        if data.get("started"):
            data["projection"] = await svc.projection(tenant_id, data)
            data["card_schedule"] = await svc.card_schedule(tenant_id)
        return data
    except FinanceError as e:
        raise _http(e)


@router.get("/card-schedule", summary="Maquininha: quando o dinheiro do cartão cai no banco (previsão)")
async def card_schedule(db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                        current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).card_schedule(tenant_id)
    except FinanceError as e:
        raise _http(e)


@router.post("/card-settlement", summary="Repasse da maquininha para o banco, com a taxa")
async def card_settlement(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                          tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).settle_card(tenant_id, current_user, data)
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


@router.post("/accounts/{account_id}/adjust", summary="Ajustar o saldo de uma conta (só admin; grava lançamento e auditoria)")
async def adjust_account(account_id: str, data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                         tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).adjust_account(tenant_id, current_user, account_id, data)
    except FinanceError as e:
        raise _http(e)


@router.patch("/accounts/{account_id}", summary="Corrigir o saldo de partida ou o nome do banco (só admin)")
async def update_account(account_id: str, data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                         tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        from app.services.finance_service import as_int
        return await FinanceService(db).update_account(tenant_id, current_user, as_int(account_id, "a conta"), data)
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


@router.delete("/transfers/{transfer_id}", summary="Apagar transferência lançada errado")
async def delete_transfer(transfer_id: int, db: AsyncSession = Depends(get_db),
                          tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).delete_transfer(tenant_id, transfer_id)
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


@router.post("/payables/{payable_id}/unpay", summary="Desfazer pagamento (volta para em aberto)")
async def unpay_payable(payable_id: int, db: AsyncSession = Depends(get_db),
                        tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).unpay_payable(tenant_id, payable_id)
    except FinanceError as e:
        raise _http(e)


@router.post("/payables/{payable_id}/cancel", summary="Cancelar conta em aberto")
async def cancel_payable(payable_id: int, db: AsyncSession = Depends(get_db),
                         tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).cancel_payable(tenant_id, payable_id)
    except FinanceError as e:
        raise _http(e)


# ── Fase 2: retiradas de sócio, empréstimos, fatura do cartão (não são despesa) ──────────────────────────────────────
@router.get("/entries", summary="Retiradas, empréstimos e outras entradas e saídas")
async def entries(limit: int = Query(100, ge=1, le=500), db: AsyncSession = Depends(get_db),
                  tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    return await FinanceService(db).list_entries(tenant_id, limit)


@router.post("/entries", summary="Lançar retirada, empréstimo, fatura do cartão ou outra entrada/saída")
async def create_entry(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                       tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).create_entry(tenant_id, current_user, data)
    except FinanceError as e:
        raise _http(e)


@router.delete("/entries/{entry_id}", summary="Apagar lançamento feito errado")
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db),
                       tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await FinanceService(db).delete_entry(tenant_id, entry_id)
    except FinanceError as e:
        raise _http(e)


@router.get("/loans", summary="Empréstimos em aberto por pessoa")
async def loans(db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                current_user: User = Depends(get_current_active_user)):
    return await FinanceService(db).loans(tenant_id)


# ── Fase 3: Fechamento do mês ───────────────────────────────────────────────────────────────────────────────────────
@router.get("/closings", summary="Meses desde a implantação e quais já foram fechados")
async def closings(db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                   current_user: User = Depends(get_current_active_user)):
    return await MonthClosingService(db).list_months(tenant_id)


@router.get("/closings/{year}/{month}", summary="Fechamento do mês: deveria ter x tem")
async def closing(year: int, month: int, db: AsyncSession = Depends(get_db),
                  tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await MonthClosingService(db).get(tenant_id, year, month)
    except FinanceError as e:
        raise _http(e)


@router.post("/closings/{year}/{month}", summary="Fechar o mês (grava a fotografia e a quebra)")
async def close_month(year: int, month: int, data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                      tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await MonthClosingService(db).close(tenant_id, current_user, year, month, data)
    except FinanceError as e:
        raise _http(e)


@router.post("/closings/{year}/{month}/reopen", summary="Reabrir o último mês fechado (só admin)")
async def reopen_month(year: int, month: int, db: AsyncSession = Depends(get_db),
                       tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await MonthClosingService(db).reopen(tenant_id, year, month)
    except FinanceError as e:
        raise _http(e)
