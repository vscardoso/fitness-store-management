"""
Endpoints de relatórios.
"""
from datetime import datetime, timedelta, date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_
from zoneinfo import ZoneInfo

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User
from app.models.sale import Sale
from app.models.stock_entry import StockEntry
from app.models.conditional_shipment import ConditionalShipment
from app.models.customer import Customer
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


@router.get(
    "/history",
    summary="Histórico unificado",
    description="Timeline com vendas, entradas de estoque e condicionais"
)
async def get_history(
    period: str = Query(
        "last_30_days",
        description="Período: today, last_7_days, last_30_days, last_3_months, this_year"
    ),
    event_type: Optional[str] = Query(
        None,
        description="Filtrar por tipo: sale, entry, conditional (null = todos)"
    ),
    limit: int = Query(50, ge=1, le=200, description="Quantidade de registros"),
    offset: int = Query(0, ge=0, description="Offset para paginação"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Histórico unificado de atividades da loja.

    Retorna uma timeline com:
    - Vendas realizadas
    - Entradas de estoque
    - Envios condicionais

    Ordenado por data mais recente primeiro.
    """
    tz = ZoneInfo("America/Sao_Paulo")
    today = datetime.now(tz).date()

    # Calcular período
    if period == "today":
        start_date = today
    elif period == "last_7_days":
        start_date = today - timedelta(days=7)
    elif period == "last_30_days":
        start_date = today - timedelta(days=30)
    elif period == "last_3_months":
        start_date = today - timedelta(days=90)
    elif period == "this_year":
        start_date = today.replace(month=1, day=1)
    else:
        start_date = today - timedelta(days=30)

    end_date = today
    events = []

    try:
        # 1. Buscar VENDAS
        if event_type is None or event_type == "sale":
            sale_conditions = [
                Sale.is_active == True,
                func.date(Sale.created_at) >= start_date,
                func.date(Sale.created_at) <= end_date,
            ]
            if tenant_id:
                sale_conditions.append(Sale.tenant_id == tenant_id)

            sales_query = (
                select(
                    Sale.id,
                    Sale.sale_number,
                    Sale.total_amount,
                    Sale.status,
                    Sale.customer_id,
                    Sale.created_at,
                    Customer.full_name.label('customer_name'),
                )
                .outerjoin(Customer, Sale.customer_id == Customer.id)
                .where(and_(*sale_conditions))
                .order_by(desc(Sale.created_at))
            )

            result = await db.execute(sales_query)
            sales = result.all()

            for sale in sales:
                status_labels = {
                    "COMPLETED": "Concluída",
                    "PENDING": "Pendente",
                    "CANCELLED": "Cancelada",
                    "REFUNDED": "Reembolsada",
                }
                events.append({
                    "id": f"sale_{sale.id}",
                    "type": "sale",
                    "type_label": "Venda",
                    "icon": "cart",
                    "color": "#10B981" if sale.status == "COMPLETED" else "#F59E0B",
                    "title": f"Venda #{sale.sale_number}",
                    "subtitle": sale.customer_name or "Cliente não identificado",
                    "value": float(sale.total_amount),
                    "status": status_labels.get(sale.status, sale.status),
                    "timestamp": sale.created_at.isoformat(),
                    "date": sale.created_at.strftime("%d/%m/%Y"),
                    "time": sale.created_at.strftime("%H:%M"),
                    "link_id": sale.id,
                    "link_type": "sale",
                })

        # 2. Buscar ENTRADAS DE ESTOQUE
        if event_type is None or event_type == "entry":
            entry_conditions = [
                StockEntry.is_active == True,
                func.date(StockEntry.entry_date) >= start_date,
                func.date(StockEntry.entry_date) <= end_date,
            ]
            if tenant_id:
                entry_conditions.append(StockEntry.tenant_id == tenant_id)

            entries_query = (
                select(StockEntry)
                .where(and_(*entry_conditions))
                .order_by(desc(StockEntry.entry_date))
            )

            result = await db.execute(entries_query)
            entries = result.scalars().all()

            entry_type_labels = {
                "TRIP": "Viagem",
                "ONLINE": "Online",
                "LOCAL": "Local",
                "INITIAL_INVENTORY": "Inventário Inicial",
                "ADJUSTMENT": "Ajuste",
                "RETURN": "Devolução",
                "DONATION": "Doação",
            }

            for entry in entries:
                events.append({
                    "id": f"entry_{entry.id}",
                    "type": "entry",
                    "type_label": "Entrada",
                    "icon": "cube",
                    "color": "#3B82F6",
                    "title": f"Entrada #{entry.entry_code}",
                    "subtitle": entry_type_labels.get(entry.entry_type, entry.entry_type) + (f" - {entry.supplier_name}" if entry.supplier_name else ""),
                    "value": float(entry.total_cost) if entry.total_cost else 0,
                    "status": entry_type_labels.get(entry.entry_type, entry.entry_type),
                    "timestamp": entry.entry_date.isoformat() if entry.entry_date else entry.created_at.isoformat(),
                    "date": entry.entry_date.strftime("%d/%m/%Y") if entry.entry_date else entry.created_at.strftime("%d/%m/%Y"),
                    "time": entry.created_at.strftime("%H:%M"),
                    "link_id": entry.id,
                    "link_type": "entry",
                })

        # 3. Buscar CONDICIONAIS
        if event_type is None or event_type == "conditional":
            cond_conditions = [
                ConditionalShipment.is_active == True,
                func.date(ConditionalShipment.created_at) >= start_date,
                func.date(ConditionalShipment.created_at) <= end_date,
            ]
            if tenant_id:
                cond_conditions.append(ConditionalShipment.tenant_id == tenant_id)

            conditionals_query = (
                select(
                    ConditionalShipment.id,
                    ConditionalShipment.status,
                    ConditionalShipment.customer_id,
                    ConditionalShipment.created_at,
                    ConditionalShipment.sent_at,
                    ConditionalShipment.deadline,
                    Customer.full_name.label('customer_name'),
                )
                .outerjoin(Customer, ConditionalShipment.customer_id == Customer.id)
                .where(and_(*cond_conditions))
                .order_by(desc(ConditionalShipment.created_at))
            )

            result = await db.execute(conditionals_query)
            conditionals = result.all()

            cond_status_labels = {
                "PENDING": "Pendente",
                "SENT": "Enviado",
                "RETURNED_NO_SALE": "Devolvido",
                "COMPLETED_PARTIAL_SALE": "Parcial",
                "COMPLETED_FULL_SALE": "Vendido",
                "OVERDUE": "Atrasado",
                "CANCELLED": "Cancelado",
            }

            cond_colors = {
                "PENDING": "#F59E0B",
                "SENT": "#3B82F6",
                "RETURNED_NO_SALE": "#6B7280",
                "COMPLETED_PARTIAL_SALE": "#10B981",
                "COMPLETED_FULL_SALE": "#10B981",
                "OVERDUE": "#EF4444",
                "CANCELLED": "#6B7280",
            }

            for cond in conditionals:
                events.append({
                    "id": f"conditional_{cond.id}",
                    "type": "conditional",
                    "type_label": "Condicional",
                    "icon": "airplane",
                    "color": cond_colors.get(cond.status, "#6B7280"),
                    "title": f"Condicional #{cond.id}",
                    "subtitle": cond.customer_name or "Cliente",
                    "value": None,
                    "status": cond_status_labels.get(cond.status, cond.status),
                    "timestamp": cond.created_at.isoformat(),
                    "date": cond.created_at.strftime("%d/%m/%Y"),
                    "time": cond.created_at.strftime("%H:%M"),
                    "link_id": cond.id,
                    "link_type": "conditional",
                })

        # Ordenar por timestamp decrescente
        events.sort(key=lambda x: x["timestamp"], reverse=True)

        # Aplicar paginação
        total_count = len(events)
        events = events[offset:offset + limit]

        # Agrupar por data para exibição
        grouped = {}
        for event in events:
            date_key = event["date"]
            if date_key not in grouped:
                grouped[date_key] = []
            grouped[date_key].append(event)

        # Converter para lista ordenada
        timeline = [
            {"date": date_key, "events": events_list}
            for date_key, events_list in grouped.items()
        ]

        return {
            "period": period,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "total_count": total_count,
            "returned_count": len(events),
            "offset": offset,
            "limit": limit,
            "has_more": (offset + limit) < total_count,
            "timeline": timeline,
            "events": events,  # Lista flat para facilidade
        }

    except Exception as e:
        import traceback
        print(f" Erro ao buscar histórico: {str(e)}")
        print(traceback.format_exc())
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar histórico: {str(e)}"
        )
