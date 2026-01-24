"""
Endpoints de relatórios.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User
from app.services.report_service import ReportService
from app.schemas.report import (
    SalesReportResponse,
    CashFlowReportResponse,
    CustomersReportResponse,
)

router = APIRouter(prefix="/reports", tags=["Relatórios"])


@router.get(
    "/sales",
    response_model=SalesReportResponse,
    summary="Relatório de vendas",
    description="Relatório completo de vendas com métricas, lucro, breakdown de pagamentos e top produtos"
)
async def get_sales_report(
    period: str = Query("this_month", description="Período: this_month, last_30_days, last_2_months, last_3_months, last_6_months, this_year"),
    seller_id: int | None = Query(None, description="Filtrar por vendedor (opcional)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Relatório de vendas por período.

    Retorna:
    - Total de vendas
    - Quantidade de vendas
    - Ticket médio
    - CMV total (FIFO)
    - Lucro total
    - Margem de lucro
    - Breakdown por forma de pagamento
    - Top 10 produtos vendidos
    """
    service = ReportService()

    # Se for vendedor, forçar filtro por seller_id
    if current_user.role.value == "SELLER":
        seller_id = current_user.id

    return await service.get_sales_report(
        db=db,
        tenant_id=tenant_id,
        period=period,
        seller_id=seller_id,
    )


@router.get(
    "/cash-flow",
    response_model=CashFlowReportResponse,
    summary="Relatório de fluxo de caixa",
    description="Total de vendas por forma de pagamento no período"
)
async def get_cash_flow_report(
    period: str = Query("this_month", description="Período"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Relatório de fluxo de caixa (vendas por forma de pagamento).

    Retorna:
    - Total geral
    - Breakdown por payment_method (PIX, cartão, dinheiro, etc.)
    - Percentual de cada método
    """
    service = ReportService()

    return await service.get_cash_flow_report(
        db=db,
        tenant_id=tenant_id,
        period=period,
    )


@router.get(
    "/customers",
    response_model=CustomersReportResponse,
    summary="Relatório de clientes",
    description="Top clientes compradores e métricas de ticket médio"
)
async def get_customers_report(
    period: str = Query("this_month", description="Período"),
    limit: int = Query(10, ge=1, le=50, description="Quantidade de top clientes"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Relatório de clientes (top compradores).

    Retorna:
    - Total de clientes que compraram no período
    - Top N clientes por volume de compras
    - Ticket médio geral
    """
    service = ReportService()

    return await service.get_customers_report(
        db=db,
        tenant_id=tenant_id,
        period=period,
        limit=limit,
    )
