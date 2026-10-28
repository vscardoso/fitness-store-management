"""
Service para relatórios com lógica de negócio.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from app.models.sale import Sale, SaleItem, PaymentMethod, SaleStatus
from app.models.sale_return import SaleReturn
from app.models.category import Category
from app.models.user import User
from app.utils.variant_code import format_variant_code
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.customer import Customer
from app.core.timezone import get_period_range_utc, now_brazil
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
        # dia do Brasil (o servidor roda em UTC: às 21h de Brasília já seria o dia seguinte)
        today = now_brazil().replace(tzinfo=None, hour=23, minute=59, second=59, microsecond=999999)

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
        d0, d1 = start_date.date(), end_date.date()

        # Receita, custo e lucro pela conta única (app/services/money_ledger.py): receita LÍQUIDA (vendas do período
        # menos devoluções do período), troca contada uma vez, cancelada fora. Antes este relatório não descontava
        # devolução e contava a troca duas vezes.
        from app.services.money_ledger import VALID_STATUS, period_totals
        from app.models.sale_return import ReturnItem
        led = await period_totals(db, tenant_id, d0, d1, seller_id=seller_id)
        total_revenue = float(led.revenue)
        total_sales = led.sales_count
        average_ticket = led.average_ticket
        total_cost = float(led.cost)
        total_profit = float(led.profit)
        profit_margin = led.margin_percent

        # Filtros das listas (produto, categoria, cliente): vendas válidas do período, mesma regra da conta única
        s_utc, e_utc = get_period_range_utc(d0, d1)
        base_filter = and_(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            Sale.status.in_(VALID_STATUS),
            Sale.created_at >= s_utc,
            Sale.created_at <= e_utc,
        )
        ret_filter = and_(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.is_active == True,
            SaleReturn.status == "completed",
            SaleReturn.created_at >= s_utc,
            SaleReturn.created_at <= e_utc,
            Sale.status != SaleStatus.CANCELLED,
            ReturnItem.is_active == True,
        )
        if seller_id:
            base_filter = and_(base_filter, Sale.seller_id == seller_id)
            ret_filter = and_(ret_filter, Sale.seller_id == seller_id)
        exchange_ids = select(SaleReturn.exchange_sale_id).where(
            SaleReturn.tenant_id == tenant_id, SaleReturn.exchange_sale_id.isnot(None))

        # 3. Forma de pagamento (como as vendas entraram; a venda de troca entra pelo valor das peças novas)
        gross = float(led.gross_sales)
        payment_breakdown = [
            PaymentMethodBreakdown(
                method=str(method), total=float(v["total"]), count=v["count"],
                percentage=(float(v["total"]) / gross * 100) if gross > 0 else 0,
            )
            for method, v in sorted(led.by_payment.items(), key=lambda kv: -kv[1]["total"])
        ]

        # 4. Top produtos (por variação), líquidos do que voltou no período
        ret_by_variant = {
            (r.product_id, r.variant_id): r for r in (await db.execute(
                select(
                    ReturnItem.product_id, ReturnItem.variant_id,
                    func.coalesce(func.sum(ReturnItem.quantity_returned), 0).label("qty"),
                    func.coalesce(func.sum(ReturnItem.refund_amount), 0).label("rev"),
                    func.coalesce(func.sum(case((ReturnItem.restock == True, ReturnItem.quantity_returned * ReturnItem.unit_cost), else_=0)), 0).label("cost"),
                )
                .join(SaleReturn, SaleReturn.id == ReturnItem.return_id)
                .join(Sale, Sale.id == SaleReturn.sale_id)
                .where(ret_filter).group_by(ReturnItem.product_id, ReturnItem.variant_id))).all()
        }
        top_products_query = select(
            SaleItem.product_id,
            SaleItem.variant_id,
            Product.name.label("product_name"),
            ProductVariant.sku.label("variant_sku"),
            ProductVariant.short_code.label("variant_short_code"),
            ProductVariant.product_code.label("variant_product_code"),
            ProductVariant.variant_number.label("variant_number"),
            ProductVariant.size.label("variant_size"),
            ProductVariant.color.label("variant_color"),
            func.sum(SaleItem.quantity).label("quantity_sold"),
            func.sum(SaleItem.quantity * SaleItem.unit_price).label("revenue"),
            func.sum(SaleItem.quantity * SaleItem.unit_cost).label("cost"),
        ).join(Sale, SaleItem.sale_id == Sale.id)\
        .outerjoin(ProductVariant, SaleItem.variant_id == ProductVariant.id)\
        .join(Product, Product.id == func.coalesce(SaleItem.product_id, ProductVariant.product_id))\
        .where(base_filter, SaleItem.is_active == True)\
        .group_by(
            SaleItem.product_id,
            SaleItem.variant_id,
            Product.name,
            ProductVariant.sku,
            ProductVariant.short_code,
            ProductVariant.product_code,
            ProductVariant.variant_number,
            ProductVariant.size,
            ProductVariant.color,
        )

        top_products = []
        for row in (await db.execute(top_products_query)).all():
            back = ret_by_variant.get((row.product_id, row.variant_id))
            qty = int(row.quantity_sold) - (int(back.qty) if back else 0)
            revenue = float(row.revenue) - (float(back.rev) if back else 0.0)
            cost = float(row.cost) - (float(back.cost) if back else 0.0)
            if qty <= 0 and revenue <= 0:
                continue
            profit = revenue - cost
            variant_parts = [str(x) for x in (row.variant_color, row.variant_size) if x]
            top_products.append(TopProduct(
                product_id=row.product_id,
                product_name=row.product_name,
                variant_id=row.variant_id,
                variant_sku=row.variant_sku,
                variant_size=row.variant_size,
                variant_color=row.variant_color,
                variant_label=" • ".join(variant_parts) if variant_parts else None,
                variant_short_code=row.variant_short_code,
                variant_display_code=format_variant_code(row.variant_product_code, row.variant_number),
                quantity_sold=qty,
                revenue=revenue,
                profit=profit,
                margin=(profit / revenue * 100) if revenue > 0 else 0,
            ))
        top_products = sorted(top_products, key=lambda p: -p.revenue)[:15]

        # 5. Comparação com o período anterior (mesmo número de dias, logo antes)
        days = (d1 - d0).days + 1
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=days - 1)
        prv = await period_totals(db, tenant_id, prev_start.date(), prev_end.date(), seller_id=seller_id)
        prev_revenue = float(prv.revenue)
        diff = total_revenue - prev_revenue
        comparison = PeriodComparison(
            current_total=total_revenue,
            previous_total=prev_revenue,
            difference=diff,
            percentage_change=(diff / prev_revenue * 100) if prev_revenue > 0 else 0,
            is_growth=diff >= 0,
            previous_sales=prv.sales_count,
            previous_profit=float(prv.profit),
            previous_start=prev_start,
            previous_end=prev_end,
        )

        # 6. Peças (líquidas do que voltou), desconto, clientes (vendas, sem as de troca)
        pieces_sold = led.pieces_sold - led.pieces_returned
        discount_total = float(led.discount_total)
        with_customer = int((await db.execute(
            select(func.count(Sale.id)).where(and_(base_filter, Sale.customer_id.isnot(None), Sale.id.notin_(exchange_ids))))).scalar() or 0)

        # 7. Dia a dia (dia do Brasil; a devolução abate no dia em que aconteceu) e por dia da semana
        daily = []
        for i in range(days):
            day = d0 + timedelta(days=i)
            d = led.days.get(day)
            if d and (d.gross or d.refunds):
                daily.append(DaySales(date=day.isoformat(), revenue=float(d.revenue), sales=d.sales, profit=float(d.profit)))
        wk = {i: [0.0, 0] for i in range(7)}
        for d in daily:
            wd = datetime.strptime(d.date[:10], "%Y-%m-%d").weekday()
            wk[wd][0] += d.revenue
            wk[wd][1] += d.sales
        by_weekday = [WeekdaySales(weekday=i, revenue=v[0], sales=v[1]) for i, v in wk.items()]

        # 8. Por categoria (líquido do que voltou)
        cat_expr = func.coalesce(Category.name, "Sem categoria")
        cats: Dict[str, list] = {}
        for r in (await db.execute(
            select(
                cat_expr.label("name"),
                func.coalesce(func.sum(SaleItem.quantity), 0).label("pieces"),
                func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_price), 0).label("rev"),
                func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("cost"),
            )
            .join(Sale, SaleItem.sale_id == Sale.id)
            .outerjoin(ProductVariant, SaleItem.variant_id == ProductVariant.id)
            .join(Product, Product.id == func.coalesce(SaleItem.product_id, ProductVariant.product_id))
            .outerjoin(Category, Category.id == Product.category_id)
            .where(base_filter, SaleItem.is_active == True).group_by(cat_expr))).all():
            cats[r.name] = [int(r.pieces), float(r.rev), float(r.cost)]
        for r in (await db.execute(
            select(
                cat_expr.label("name"),
                func.coalesce(func.sum(ReturnItem.quantity_returned), 0).label("pieces"),
                func.coalesce(func.sum(ReturnItem.refund_amount), 0).label("rev"),
                func.coalesce(func.sum(case((ReturnItem.restock == True, ReturnItem.quantity_returned * ReturnItem.unit_cost), else_=0)), 0).label("cost"),
            )
            .join(SaleReturn, SaleReturn.id == ReturnItem.return_id)
            .join(Sale, Sale.id == SaleReturn.sale_id)
            .join(Product, Product.id == ReturnItem.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(ret_filter).group_by(cat_expr))).all():
            c = cats.setdefault(r.name, [0, 0.0, 0.0])
            c[0] -= int(r.pieces)
            c[1] -= float(r.rev)
            c[2] -= float(r.cost)
        cat_total = sum(v[1] for v in cats.values())
        by_category = [
            CategorySales(category=name, pieces=v[0], revenue=v[1], profit=v[1] - v[2],
                          percentage=(v[1] / cat_total * 100) if cat_total > 0 else 0)
            for name, v in sorted(cats.items(), key=lambda kv: -kv[1][1])
        ]

        # 9. Por vendedor (líquido das devoluções das vendas dele)
        names = {}
        if led.by_seller:
            names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(list(led.by_seller))))).all())
        by_seller = []
        for sid, v in led.by_seller.items():
            rev = float(v["gross"] - v["refunds"])
            by_seller.append(SellerSales(
                seller_id=sid, seller_name=names.get(sid) or "Sem nome", sales=v["sales"], revenue=rev,
                average_ticket=rev / v["sales"] if v["sales"] else 0,
                percentage=(rev / total_revenue * 100) if total_revenue > 0 else 0))
        by_seller.sort(key=lambda x: -x.revenue)

        # 10. Canceladas (só para informar; fora de tudo acima)
        canc_filter = and_(
            Sale.tenant_id == tenant_id, Sale.is_active == True, Sale.status == SaleStatus.CANCELLED,
            Sale.created_at >= s_utc, Sale.created_at <= e_utc)
        if seller_id:
            canc_filter = and_(canc_filter, Sale.seller_id == seller_id)
        canc = (await db.execute(
            select(func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0)).where(canc_filter))).one()

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
            returns_count=led.returns_count,
            returns_total=float(led.refunds),
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
