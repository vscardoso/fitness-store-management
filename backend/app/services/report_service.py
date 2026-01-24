"""
Service para relatórios com lógica de negócio.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from app.models.sale import Sale, SaleItem, PaymentMethod
from app.models.product import Product
from app.models.customer import Customer
from app.schemas.report import (
    SalesReportResponse,
    PaymentMethodBreakdown,
    TopProduct,
    PeriodComparison,
    CashFlowReportResponse,
    TopCustomer,
    CustomersReportResponse,
)


class ReportService:
    """Service para geração de relatórios"""

    @staticmethod
    def _get_period_dates(period: str) -> tuple[datetime, datetime]:
        """Converte string de período para datas"""
        today = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)

        if period == "this_month":
            start_date = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "last_30_days":
            start_date = (today - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "last_2_months":
            start_date = (today - timedelta(days=60)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "last_3_months":
            start_date = (today - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "last_6_months":
            start_date = (today - timedelta(days=180)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "this_year":
            start_date = today.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            # Default: últimos 30 dias
            start_date = (today - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)

        return start_date, today

    async def get_sales_report(
        self,
        db: AsyncSession,
        tenant_id: int,
        period: str = "this_month",
        seller_id: Optional[int] = None,
    ) -> SalesReportResponse:
        """
        Gera relatório completo de vendas.

        Args:
            db: Sessão do banco
            tenant_id: ID do tenant
            period: Período (this_month, last_30_days, etc.)
            seller_id: Filtrar por vendedor (opcional)

        Returns:
            SalesReportResponse com métricas completas
        """
        start_date, end_date = self._get_period_dates(period)

        # Base filter
        base_filter = and_(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            func.date(Sale.created_at) >= start_date.date(),
            func.date(Sale.created_at) <= end_date.date(),
        )

        if seller_id:
            base_filter = and_(base_filter, Sale.seller_id == seller_id)

        # 1. Métricas principais
        sales_query = select(
            func.coalesce(func.sum(Sale.total_amount), 0).label("total_revenue"),
            func.count(Sale.id).label("total_sales"),
        ).where(base_filter)

        sales_result = await db.execute(sales_query)
        sales_data = sales_result.one()

        total_revenue = float(sales_data.total_revenue)
        total_sales = sales_data.total_sales
        average_ticket = total_revenue / total_sales if total_sales > 0 else 0

        # 2. CMV e Lucro (usando FIFO)
        cmv_query = select(
            func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("total_cost"),
        ).join(Sale, SaleItem.sale_id == Sale.id).where(base_filter)

        cmv_result = await db.execute(cmv_query)
        total_cost = float(cmv_result.scalar())

        total_profit = total_revenue - total_cost
        profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0

        # 3. Breakdown por forma de pagamento
        payment_query = select(
            Sale.payment_method,
            func.coalesce(func.sum(Sale.total_amount), 0).label("total"),
            func.count(Sale.id).label("count"),
        ).where(base_filter).group_by(Sale.payment_method)

        payment_result = await db.execute(payment_query)
        payment_rows = payment_result.all()

        payment_breakdown = [
            PaymentMethodBreakdown(
                method=row.payment_method.value,
                total=float(row.total),
                count=row.count,
                percentage=(float(row.total) / total_revenue * 100) if total_revenue > 0 else 0
            )
            for row in payment_rows
        ]

        # 4. Top produtos
        top_products_query = select(
            SaleItem.product_id,
            Product.name.label("product_name"),
            func.sum(SaleItem.quantity).label("quantity_sold"),
            func.sum(SaleItem.quantity * SaleItem.unit_price).label("revenue"),
            func.sum(SaleItem.quantity * SaleItem.unit_cost).label("cost"),
        ).join(Sale, SaleItem.sale_id == Sale.id)\
        .join(Product, SaleItem.product_id == Product.id)\
        .where(base_filter)\
        .group_by(SaleItem.product_id, Product.name)\
        .order_by(func.sum(SaleItem.quantity * SaleItem.unit_price).desc())\
        .limit(10)

        top_products_result = await db.execute(top_products_query)
        top_products_rows = top_products_result.all()

        top_products = []
        for row in top_products_rows:
            revenue = float(row.revenue)
            cost = float(row.cost)
            profit = revenue - cost
            margin = (profit / revenue * 100) if revenue > 0 else 0

            top_products.append(TopProduct(
                product_id=row.product_id,
                product_name=row.product_name,
                quantity_sold=row.quantity_sold,
                revenue=revenue,
                profit=profit,
                margin=margin,
            ))

        # 5. Comparação com período anterior (opcional)
        comparison = None
        # TODO: Implementar comparação em v2

        return SalesReportResponse(
            period=period,
            start_date=start_date,
            end_date=end_date,
            total_revenue=total_revenue,
            total_sales=total_sales,
            average_ticket=average_ticket,
            total_cost=total_cost,
            total_profit=total_profit,
            profit_margin=profit_margin,
            payment_breakdown=payment_breakdown,
            top_products=top_products,
            comparison=comparison,
        )

    async def get_cash_flow_report(
        self,
        db: AsyncSession,
        tenant_id: int,
        period: str = "this_month",
    ) -> CashFlowReportResponse:
        """
        Gera relatório de fluxo de caixa (vendas por forma de pagamento).
        """
        start_date, end_date = self._get_period_dates(period)

        base_filter = and_(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            func.date(Sale.created_at) >= start_date.date(),
            func.date(Sale.created_at) <= end_date.date(),
        )

        # Breakdown por payment_method
        payment_query = select(
            Sale.payment_method,
            func.coalesce(func.sum(Sale.total_amount), 0).label("total"),
            func.count(Sale.id).label("count"),
        ).where(base_filter).group_by(Sale.payment_method)

        payment_result = await db.execute(payment_query)
        payment_rows = payment_result.all()

        total = sum(float(row.total) for row in payment_rows)

        breakdown = [
            PaymentMethodBreakdown(
                method=row.payment_method.value,
                total=float(row.total),
                count=row.count,
                percentage=(float(row.total) / total * 100) if total > 0 else 0
            )
            for row in payment_rows
        ]

        return CashFlowReportResponse(
            period=period,
            start_date=start_date,
            end_date=end_date,
            total=total,
            breakdown=breakdown,
        )

    async def get_customers_report(
        self,
        db: AsyncSession,
        tenant_id: int,
        period: str = "this_month",
        limit: int = 10,
    ) -> CustomersReportResponse:
        """
        Gera relatório de clientes (top compradores).
        """
        start_date, end_date = self._get_period_dates(period)

        base_filter = and_(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            func.date(Sale.created_at) >= start_date.date(),
            func.date(Sale.created_at) <= end_date.date(),
        )

        # Top clientes
        top_customers_query = select(
            Sale.customer_id,
            Customer.full_name.label("customer_name"),
            Customer.customer_type,
            func.sum(Sale.total_amount).label("total_purchases"),
            func.count(Sale.id).label("purchase_count"),
            func.avg(Sale.total_amount).label("average_purchase"),
        ).join(Customer, Sale.customer_id == Customer.id)\
        .where(base_filter)\
        .group_by(Sale.customer_id, Customer.full_name, Customer.customer_type)\
        .order_by(func.sum(Sale.total_amount).desc())\
        .limit(limit)

        top_result = await db.execute(top_customers_query)
        top_rows = top_result.all()

        top_customers = [
            TopCustomer(
                customer_id=row.customer_id,
                customer_name=row.customer_name,
                total_purchases=float(row.total_purchases),
                purchase_count=row.purchase_count,
                average_purchase=float(row.average_purchase),
                customer_type=row.customer_type.value,
            )
            for row in top_rows
        ]

        # Total de clientes únicos no período
        total_customers_query = select(
            func.count(func.distinct(Sale.customer_id))
        ).where(base_filter)

        total_customers_result = await db.execute(total_customers_query)
        total_customers = total_customers_result.scalar()

        # Ticket médio geral
        avg_ticket_query = select(
            func.avg(Sale.total_amount)
        ).where(base_filter)

        avg_ticket_result = await db.execute(avg_ticket_query)
        average_ticket = float(avg_ticket_result.scalar() or 0)

        return CustomersReportResponse(
            period=period,
            start_date=start_date,
            end_date=end_date,
            total_customers=total_customers,
            new_customers=0,  # TODO: Implementar contagem de novos clientes
            top_customers=top_customers,
            average_ticket=average_ticket,
        )
