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
    ExpenseResponse,
    ExpenseUpdate,
    MonthlyResultResponse,
)
from app.services.expense_service import ExpenseService
from app.core.timezone import today_brazil

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
    svc = ExpenseService(db)
    return await svc.monthly_result(y, m, tenant_id)


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
    return await svc.list_expenses(
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        tenant_id=tenant_id,
        skip=skip,
        limit=limit,
    )


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
    return await svc.create_expense(data, tenant_id)


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
    return exp


@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: int,
    data: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    exp = await svc.update_expense(expense_id, data, tenant_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    return exp


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(get_current_tenant_id),
):
    svc = ExpenseService(db)
    ok = await svc.delete_expense(expense_id, tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")


