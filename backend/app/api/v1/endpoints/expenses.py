"""
Endpoints para gestão de despesas operacionais e resultado mensal (P&L).
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpensePeriodSummary,
    ExpenseResponse,
    ExpenseUpdate,
    MonthlyResultResponse,
)
from app.services.finance_service import FinanceConflict, FinanceError, FinanceNotFound
from app.services.expense_service import ExpenseService
from app.core.timezone import today_brazil

async def _gate_bank(db, tenant_id, user, op, key, data, reason):
    """Despesa paga por um BANCO: apagar ou mudar valor, dia ou conta depois de lançada é pedido de aprovação (202)."""
    from fastapi.responses import JSONResponse
    from app.services.finance_approval_service import FinanceApprovalService
    ap = await FinanceApprovalService(db).gate(tenant_id, user, op, key, data, reason)
    if ap is None:
        return None
    return JSONResponse(status_code=202, content={
        "approval_required": True, "approval": ap,
        "message": "Pedido enviado. O saldo do banco só muda depois que todos os administradores aprovarem."})


router = APIRouter(prefix="/expenses", tags=["Despesas"])


# ─────────────────────────────────────────────
# Categorias
# ─────────────────────────────────────────────

@router.get("/categories", response_model=List[ExpenseCategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    # Garante que as categorias padrão existam
    await svc.ensure_default_categories(tenant_id)
    return await svc.list_categories(tenant_id)


@router.post("/categories", response_model=ExpenseCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: ExpenseCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    return await svc.create_category(data, tenant_id)


@router.put("/categories/{category_id}", response_model=ExpenseCategoryResponse)
async def update_category(
    category_id: int,
    data: ExpenseCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    cat = await svc.update_category(category_id, data, tenant_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    ok = await svc.delete_category(category_id, tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")


# ─────────────────────────────────────────────
# Despesas
# ─────────────────────────────────────────────

@router.get("/resultado-mes", response_model=MonthlyResultResponse)
async def monthly_result(
    year: Optional[int] = Query(None, description="Ano (padrão: ano atual)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Mês 1-12 (padrão: mês atual)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """
    Resultado financeiro do mês:
    - Receita (total de vendas concluídas)
    - CMV (custo das mercadorias vendidas via FIFO)
    - Lucro Bruto = Receita − CMV
    - Despesas Operacionais (aluguel, salários, etc.)
    - Lucro Líquido = Lucro Bruto − Despesas
    """
    today = today_brazil()
    y = year or today.year
    m = month or today.month
    from app.services.gift_service import hide_gifts_in_result
    svc = ExpenseService(db)
    return hide_gifts_in_result(await svc.monthly_result(y, m, tenant_id), current_user)


@router.get("/resultado-mes/produtos", summary="Resultado do mês por produto")
async def monthly_result_by_product(
    year: Optional[int] = Query(None, description="Ano (padrão: ano atual)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Mês 1-12 (padrão: mês atual)"),
    start_date: Optional[date] = Query(None, description="Período livre: data inicial (com end_date, vale no lugar do mês)"),
    end_date: Optional[date] = Query(None, description="Período livre: data final"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """Cada produto vendido no mês (ou no período livre): peças, preço médio, quanto entrou, custo e lucro (mesma conta do Resultado)."""
    if start_date or end_date:
        first, last = ExpenseService.check_range(start_date, end_date)
        return await ExpenseService(db).by_product_range(first, last, tenant_id)
    today = today_brazil()
    return await ExpenseService(db).monthly_by_product(year or today.year, month or today.month, tenant_id)


@router.get("/resultado-periodo", response_model=MonthlyResultResponse)
async def result_by_period(
    days: int = Query(30, ge=1, le=365, description="Janela móvel em dias corridos (ex.: 7, 30, 60, 90)"),
    start_date: Optional[date] = Query(None, description="Período livre: data inicial (com end_date, vale no lugar de days)"),
    end_date: Optional[date] = Query(None, description="Período livre: data final (inclusive)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """
    Resultado financeiro dos últimos N dias corridos (janela móvel) ou de um período entre duas datas:
    mesma fórmula do resultado mensal.
    """
    from app.services.gift_service import hide_gifts_in_result
    svc = ExpenseService(db)
    if start_date or end_date:
        first, last = ExpenseService.check_range(start_date, end_date)
        return hide_gifts_in_result(await svc.result_by_range(first, last, tenant_id), current_user)
    return hide_gifts_in_result(await svc.result_by_days(days, tenant_id), current_user)


@router.get("/summary", response_model=ExpensePeriodSummary)
async def expenses_summary(
    start_date: Optional[date] = Query(None, description="Data inicial (YYYY-MM-DD); padrão: dia 1 do mês"),
    end_date: Optional[date] = Query(None, description="Data final (YYYY-MM-DD); padrão: hoje"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    """Total do gasto da loja no período, quanto foi de lote e a quebra por categoria (a tela de Despesas usa isto)."""
    today = today_brazil()
    first = start_date or date(today.year, today.month, 1)
    last = end_date or today
    if first > last:
        raise HTTPException(status_code=422, detail="A data inicial não pode ser depois da data final.")
    return await ExpenseService(db).period_summary(first, last, tenant_id)


@router.get("", response_model=List[ExpenseResponse])
async def list_expenses(
    start_date: Optional[date] = Query(None, description="Data inicial (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Data final (YYYY-MM-DD)"),
    category_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    today = today_brazil()
    if start_date is None:
        start_date = date(today.year, today.month, 1)
    if end_date is None:
        end_date = today
    svc = ExpenseService(db)
    rows = await svc.list_expenses(
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        tenant_id=tenant_id,
        skip=skip,
        limit=limit,
    )
    await svc.attach_pending_approvals(rows, tenant_id)
    return rows


@router.get("/stock-losses", response_model=List[ExpenseResponse])
async def list_stock_losses(
    start_date: Optional[date] = Query(None, description="Data inicial (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Data final (YYYY-MM-DD)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    today = today_brazil()
    if start_date is None:
        start_date = date(today.year, today.month, 1)
    if end_date is None:
        end_date = today

    svc = ExpenseService(db)
    return await svc.list_stock_losses(
        start_date=start_date,
        end_date=end_date,
        tenant_id=tenant_id,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    try:
        return await svc.create_expense(data, tenant_id, created_by_name=(getattr(current_user, "full_name", None) or getattr(current_user, "email", None)))
    except FinanceConflict as e:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    exp = await svc.get_expense(expense_id, tenant_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    await svc.attach_pending_approvals([exp], tenant_id)
    return exp


@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: int,
    data: ExpenseUpdate,
    reason: Optional[str] = Query(None, description="Motivo (20 letras) quando a despesa foi paga por um banco"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    try:
        await svc.ensure_no_pending_approval(expense_id, tenant_id)
        held = await _gate_bank(db, tenant_id, current_user, "expense_update", expense_id, data.model_dump(exclude_unset=True, mode="json"), reason)
        if held is not None:
            return held
        exp = await svc.update_expense(expense_id, data, tenant_id)
    except FinanceConflict as e:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except FinanceNotFound as e:
        await db.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    if not exp:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    return exp


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: int,
    reason: Optional[str] = Query(None, description="Motivo (20 letras) quando a despesa foi paga por um banco"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    try:
        await svc.ensure_no_pending_approval(expense_id, tenant_id)
        held = await _gate_bank(db, tenant_id, current_user, "expense_delete", expense_id, {}, reason)
        if held is not None:
            return held
        ok = await svc.delete_expense(expense_id, tenant_id)
    except FinanceNotFound as e:
        await db.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    except FinanceConflict as e:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except FinanceError as e:      # recusa do pedido de aprovação (ex.: falta o motivo)
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")


