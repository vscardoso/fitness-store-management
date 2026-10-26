"""
Service para relatórios com lógica de negócio.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from app.models.sale import Sale, SaleItem, PaymentMethod, SaleStatus
from app.models.sale_return import SaleReturn
from app.models.category import Category
from app.models.user import User
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.customer import Customer
from app.schemas.report import (
    SalesReportResponse,
    PaymentMethodBreakdown,
    TopProduct,
    PeriodComparison,
    DaySales,
    WeekdaySales,
    CategorySales,
    SellerSales,
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

        # Só venda que valeu: cancelada, devolvida por inteiro e aguardando pagamento não entram nos números
        valid_status = Sale.status.notin_([SaleStatus.CANCELLED, SaleStatus.REFUNDED, SaleStatus.PENDING])
        period_filter = base_filter          # inclui canceladas (só para contar quantas foram)
        base_filter = and_(base_filter, valid_status)

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

        # 4. Top produtos (agrupados por variação quando disponível)
        top_products_query = select(
            SaleItem.product_id,
            SaleItem.variant_id,
            Product.name.label("product_name"),
            ProductVariant.sku.label("variant_sku"),
            ProductVariant.short_code.label("variant_short_code"),
            ProductVariant.size.label("variant_size"),
            ProductVariant.color.label("variant_color"),
            func.sum(SaleItem.quantity).label("quantity_sold"),
            func.sum(SaleItem.quantity * SaleItem.unit_price).label("revenue"),
            func.sum(SaleItem.quantity * SaleItem.unit_cost).label("cost"),
        ).join(Sale, SaleItem.sale_id == Sale.id)\
        .outerjoin(ProductVariant, SaleItem.variant_id == ProductVariant.id)\
        .join(Product, Product.id == func.coalesce(SaleItem.product_id, ProductVariant.product_id))\
        .where(base_filter)\
        .group_by(
            SaleItem.product_id,
            SaleItem.variant_id,
            Product.name,
            ProductVariant.sku,
            ProductVariant.short_code,
            ProductVariant.size,
            ProductVariant.color,
        )\
        .order_by(func.sum(SaleItem.quantity * SaleItem.unit_price).desc())\
        .limit(15)

        top_products_result = await db.execute(top_products_query)
        top_products_rows = top_products_result.all()

        top_products = []
        for row in top_products_rows:
            revenue = float(row.revenue)
            cost = float(row.cost)
            profit = revenue - cost
            margin = (profit / revenue * 100) if revenue > 0 else 0

            variant_parts = []
            if row.variant_color:
                variant_parts.append(str(row.variant_color))
            if row.variant_size:
                variant_parts.append(str(row.variant_size))
            variant_label = " • ".join(variant_parts) if variant_parts else None

            top_products.append(TopProduct(
                product_id=row.product_id,
                product_name=row.product_name,
                variant_id=row.variant_id,
                variant_sku=row.variant_sku,
                variant_size=row.variant_size,
                variant_color=row.variant_color,
                variant_label=variant_label,
                variant_short_code=row.variant_short_code,
                quantity_sold=row.quantity_sold,
                revenue=revenue,
                profit=profit,
                margin=margin,
            ))

        # 5. Comparação com o período anterior (mesmo número de dias, logo antes)
        days = (end_date.date() - start_date.date()).days + 1
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=days - 1)
        prev_filter = and_(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            func.date(Sale.created_at) >= prev_start.date(),
            func.date(Sale.created_at) <= prev_end.date(),
            valid_status,
        )
        if seller_id:
            prev_filter = and_(prev_filter, Sale.seller_id == seller_id)
        prev = (await db.execute(select(
            func.coalesce(func.sum(Sale.total_amount), 0), func.count(Sale.id)).where(prev_filter))).one()
        prev_cost = float((await db.execute(
            select(func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0))
            .join(Sale, SaleItem.sale_id == Sale.id).where(prev_filter))).scalar())
        prev_revenue, prev_sales = float(prev[0]), int(prev[1])
        diff = total_revenue - prev_revenue
        comparison = PeriodComparison(
            current_total=total_revenue,
            previous_total=prev_revenue,
            difference=diff,
            percentage_change=(diff / prev_revenue * 100) if prev_revenue > 0 else 0,
            is_growth=diff >= 0,
            previous_sales=prev_sales,
            previous_profit=prev_revenue - prev_cost,
            previous_start=prev_start,
            previous_end=prev_end,
        )

        # 6. Peças, desconto, clientes
        pieces_sold = int((await db.execute(
            select(func.coalesce(func.sum(SaleItem.quantity), 0)).join(Sale, SaleItem.sale_id == Sale.id).where(base_filter))).scalar() or 0)
        discount_total = float((await db.execute(
            select(func.coalesce(func.sum(Sale.discount_amount), 0)).where(base_filter))).scalar() or 0)
        with_customer = int((await db.execute(
            select(func.count(Sale.id)).where(and_(base_filter, Sale.customer_id.isnot(None))))).scalar() or 0)

        # 7. Dia a dia (receita, vendas e lucro) e somatório por dia da semana
        day_col = func.date(Sale.created_at)
        day_rows = (await db.execute(
            select(day_col.label("d"), func.coalesce(func.sum(Sale.total_amount), 0).label("rev"), func.count(Sale.id).label("n"))
            .where(base_filter).group_by(day_col))).all()
        day_cost = {str(r.d): float(r.c) for r in (await db.execute(
            select(day_col.label("d"), func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("c"))
            .join(Sale, SaleItem.sale_id == Sale.id).where(base_filter).group_by(day_col))).all()}
        daily = sorted(
            [DaySales(date=str(r.d), revenue=float(r.rev), sales=int(r.n), profit=float(r.rev) - day_cost.get(str(r.d), 0.0)) for r in day_rows],
            key=lambda d: d.date,
        )
        wk = {i: [0.0, 0] for i in range(7)}
        for d in daily:
            wd = datetime.strptime(d.date[:10], "%Y-%m-%d").weekday()
            wk[wd][0] += d.revenue
            wk[wd][1] += d.sales
        by_weekday = [WeekdaySales(weekday=i, revenue=v[0], sales=v[1]) for i, v in wk.items()]

        # 8. Por categoria
        cat_rows = (await db.execute(
            select(
                Category.name.label("name"),
                func.coalesce(func.sum(SaleItem.quantity), 0).label("pieces"),
                func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_price), 0).label("rev"),
                func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("cost"),
            )
            .join(Sale, SaleItem.sale_id == Sale.id)
            .outerjoin(ProductVariant, SaleItem.variant_id == ProductVariant.id)
            .join(Product, Product.id == func.coalesce(SaleItem.product_id, ProductVariant.product_id))
            .outerjoin(Category, Category.id == Product.category_id)
            .where(base_filter).group_by(Category.name)
            .order_by(func.sum(SaleItem.quantity * SaleItem.unit_price).desc()))).all()
        cat_total = sum(float(r.rev) for r in cat_rows)
        by_category = [
            CategorySales(category=r.name or "Sem categoria", pieces=int(r.pieces), revenue=float(r.rev),
                          profit=float(r.rev) - float(r.cost), percentage=(float(r.rev) / cat_total * 100) if cat_total > 0 else 0)
            for r in cat_rows
        ]

        # 9. Por vendedor
        seller_rows = (await db.execute(
            select(Sale.seller_id, User.full_name, func.count(Sale.id).label("n"), func.coalesce(func.sum(Sale.total_amount), 0).label("rev"))
            .join(User, User.id == Sale.seller_id).where(base_filter)
            .group_by(Sale.seller_id, User.full_name).order_by(func.sum(Sale.total_amount).desc()))).all()
        by_seller = [
            SellerSales(seller_id=r.seller_id, seller_name=r.full_name or "Sem nome", sales=int(r.n), revenue=float(r.rev),
                        average_ticket=float(r.rev) / int(r.n) if r.n else 0,
                        percentage=(float(r.rev) / total_revenue * 100) if total_revenue > 0 else 0)
            for r in seller_rows
        ]

        # 10. Canceladas (só para informar) e devoluções/trocas do período
        canc = (await db.execute(
            select(func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0))
            .where(and_(period_filter, Sale.status.in_([SaleStatus.CANCELLED, SaleStatus.REFUNDED]))))).one()
        ret_filter = and_(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.is_active == True,
            SaleReturn.status == "completed",
            func.date(SaleReturn.created_at) >= start_date.date(),
            func.date(SaleReturn.created_at) <= end_date.date(),
        )
        ret = (await db.execute(
            select(func.count(SaleReturn.id), func.coalesce(func.sum(SaleReturn.total_refund), 0)).where(ret_filter))).one()

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
            pieces_sold=pieces_sold,
            discount_total=discount_total,
            sales_with_customer=with_customer,
            sales_without_customer=max(total_sales - with_customer, 0),
            returns_count=int(ret[0] or 0),
            returns_total=float(ret[1] or 0),
            cancelled_count=int(canc[0] or 0),
            cancelled_total=float(canc[1] or 0),
            daily=daily,
            by_weekday=by_weekday,
            by_category=by_category,
            by_seller=by_seller,
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
