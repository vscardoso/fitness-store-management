"""
Dashboard API endpoints.

Fornece estatísticas e métricas para o dashboard do app mobile.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, Integer, and_
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional
from decimal import Decimal
from datetime import date, timedelta
from enum import Enum
from zoneinfo import ZoneInfo

from app.core.database import get_db
from app.core.timezone import today_brazil, get_day_range_utc, get_period_range_utc
from app.api.deps import get_current_tenant_id, get_current_active_user
from app.models.product import Product
from app.models.category import Category
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.customer import Customer
from app.models.sale import Sale, SaleItem
from app.models.sale_return import SaleReturn, ReturnItem
from app.models.user import User
from app.models.stock_entry import StockEntry, EntryType

router = APIRouter()


class PeriodFilter(str, Enum):
    """Filtros de período predefinidos para o dashboard."""
    THIS_MONTH = "this_month"
    LAST_30_DAYS = "last_30_days"
    LAST_2_MONTHS = "last_2_months"
    LAST_3_MONTHS = "last_3_months"
    LAST_6_MONTHS = "last_6_months"
    THIS_YEAR = "this_year"


def get_period_dates(period: PeriodFilter) -> tuple[date, date]:
    """Retorna (start_date, end_date) baseado no filtro de período.
    
    IMPORTANTE: Usa timezone brasileiro (America/Sao_Paulo) para determinar
    "hoje", garantindo que o dia vire à meia-noite local, não UTC.
    """
    today = today_brazil()

    if period == PeriodFilter.THIS_MONTH:
        start = date(today.year, today.month, 1)
        end = today
    elif period == PeriodFilter.LAST_30_DAYS:
        start = today - timedelta(days=30)
        end = today
    elif period == PeriodFilter.LAST_2_MONTHS:
        # Início de 2 meses atrás
        month = today.month - 2
        year = today.year
        if month <= 0:
            month += 12
            year -= 1
        start = date(year, month, 1)
        end = today
    elif period == PeriodFilter.LAST_3_MONTHS:
        month = today.month - 3
        year = today.year
        if month <= 0:
            month += 12
            year -= 1
        start = date(year, month, 1)
        end = today
    elif period == PeriodFilter.LAST_6_MONTHS:
        month = today.month - 6
        year = today.year
        if month <= 0:
            month += 12
            year -= 1
        start = date(year, month, 1)
        end = today
    elif period == PeriodFilter.THIS_YEAR:
        start = date(today.year, 1, 1)
        end = today
    else:
        # Default: este mês
        start = date(today.year, today.month, 1)
        end = today

    return start, end


def get_previous_period_dates(start: date, end: date) -> tuple[date, date]:
    """Calcula o período anterior de mesma duração para comparação."""
    duration = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=duration - 1)
    return prev_start, prev_end


@router.get("/stats", response_model=Dict[str, Any])
async def get_dashboard_stats(
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna estatísticas do dashboard com rastreabilidade completa.

    Métricas calculadas com base em EntryItems para garantir precisão:
    - Valor investido em estoque (custo real de compra)
    - Valor potencial (receita se vender tudo)
    - Margem média
    - Quantidade total em estoque
    - Produtos com estoque baixo
    - Total de clientes
    - Vendas do dia
    """

    # 1. Estatísticas de Estoque (baseadas em Entry Items)
    # Valor investido = soma de (quantity_remaining * unit_cost) de todos entry_items
    # Garantir que só conta itens de entradas ativas (StockEntry.is_active == True)
    from app.models.stock_entry import StockEntry
    entry_items_query = (
        select(
            func.coalesce(func.sum(EntryItem.quantity_remaining * EntryItem.unit_cost), 0).label("invested_value"),
            func.coalesce(func.sum(EntryItem.quantity_remaining), 0).label("total_quantity"),
        )
        .select_from(EntryItem)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            StockEntry.is_active == True,
            EntryItem.quantity_remaining > 0,
        )
    )

    result = await db.execute(entry_items_query)
    stock_stats = result.first()
    invested_value = float(stock_stats.invested_value) if stock_stats.invested_value else 0.0
    total_quantity = int(stock_stats.total_quantity) if stock_stats.total_quantity else 0

    # 2. Valor potencial (receita se vender todo o estoque)
    # Para cada produto, pegar o preço de venda e multiplicar pela quantidade restante
    # Usar base_price ou preço da variante (não podemos usar a property Product.price em SQL)
    from app.models.product_variant import ProductVariant
    
    potential_revenue_query = (
        select(
            func.coalesce(
                func.sum(EntryItem.quantity_remaining * func.coalesce(ProductVariant.price, Product.base_price, 0)), 0
            ).label("potential_revenue")
        )
        .select_from(EntryItem)
        .join(Product, EntryItem.product_id == Product.id)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .outerjoin(ProductVariant, and_(
            ProductVariant.product_id == Product.id,
            ProductVariant.is_active == True
        ))
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            StockEntry.is_active == True,
            EntryItem.quantity_remaining > 0,
            Product.is_active == True,
        )
    )

    result = await db.execute(potential_revenue_query)
    potential_revenue_row = result.first()
    potential_revenue = float(potential_revenue_row.potential_revenue) if potential_revenue_row.potential_revenue else 0.0

    # 3. Margem média
    average_margin = 0.0
    if invested_value > 0:
        average_margin = ((potential_revenue - invested_value) / invested_value) * 100

    # 4. Total de produtos VINCULADOS A ENTRADAS (com estoque)
    # Conta apenas produtos que têm entry_items ativos com quantidade > 0
    # Produtos com estoque: precisam ter entry_item com quantidade >0, entrada ativa e produto não ser catálogo
    products_with_entries_query = (
        select(func.count(func.distinct(EntryItem.product_id)))
        .select_from(EntryItem)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .join(Product, EntryItem.product_id == Product.id)
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            StockEntry.is_active == True,
            EntryItem.quantity_remaining > 0,
            Product.is_active == True,
            Product.is_catalog == False,
            Product.tenant_id == tenant_id,
        )
    )
    result = await db.execute(products_with_entries_query)
    total_products = result.scalar() or 0

    # 4.1 Total de produtos cadastrados ativos (independente de ter estoque)
    products_registered_query = select(func.count(Product.id)).where(
        Product.tenant_id == tenant_id,
        Product.is_active == True,
        Product.is_catalog == False,
    )
    result = await db.execute(products_registered_query)
    total_products_registered = result.scalar() or 0

    # 5. Produtos com estoque baixo
    low_stock_query = select(func.count(Inventory.id)).where(
        Inventory.tenant_id == tenant_id,
        Inventory.quantity <= Inventory.min_stock,
        Inventory.quantity > 0,
    )
    result = await db.execute(low_stock_query)
    low_stock_count = result.scalar() or 0

    # 6. Total de clientes
    customers_query = select(func.count(Customer.id)).where(
        Customer.tenant_id == tenant_id,
        Customer.is_active == True,
    )
    result = await db.execute(customers_query)
    total_customers = result.scalar() or 0

    # 7. Vendas de hoje (usar timezone brasileiro com range UTC!)
    today = today_brazil()
    yesterday = today - timedelta(days=1)

    # Obter range UTC para hoje e ontem em horário de Brasília
    today_start, today_end = get_day_range_utc(today)
    yesterday_start, yesterday_end = get_day_range_utc(yesterday)

    sales_today_query = select(
        func.coalesce(func.sum(Sale.total_amount), 0).label("total_today"),
        func.count(Sale.id).label("count_today"),
    ).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= today_start,
        Sale.created_at <= today_end,
        Sale.is_active == True,
    )

    result = await db.execute(sales_today_query)
    sales_stats = result.first()
    total_sales_today = float(sales_stats.total_today) if sales_stats.total_today else 0.0
    sales_count_today = int(sales_stats.count_today) if sales_stats.count_today else 0

    # 7.0.1 CMV de hoje (custo FIFO das vendas do dia)
    cmv_today_query = select(
        func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("cmv_today"),
    ).join(Sale, SaleItem.sale_id == Sale.id).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= today_start,
        Sale.created_at <= today_end,
        Sale.is_active == True,
        SaleItem.is_active == True,
    )
    result = await db.execute(cmv_today_query)
    cmv_today = float(result.scalar() or 0.0)
    
    # 7.0.2 Devoluções de vendas feitas HOJE (subtrair das vendas de hoje)
    # IMPORTANTE: Só subtrair se a venda ORIGINAL foi feita hoje
    # Devolução de venda de ontem NÃO afeta "vendas de hoje"
    returns_today_query = select(
        func.coalesce(func.sum(SaleReturn.total_refund), 0).label("returns_today"),
    ).join(Sale, SaleReturn.sale_id == Sale.id).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
        # Filtrar pela data da VENDA, não pela data da devolução
        Sale.created_at >= today_start,
        Sale.created_at <= today_end,
    )
    result = await db.execute(returns_today_query)
    returns_today = float(result.scalar() or 0.0)
    
    # Ajustar vendas e CMV com devoluções
    total_sales_today = max(0, total_sales_today - returns_today)
    
    # Custo dos itens devolvidos de vendas feitas hoje (para ajustar CMV)
    returns_cmv_today_query = select(
        func.coalesce(func.sum(ReturnItem.quantity_returned * ReturnItem.unit_cost), 0).label("returns_cmv"),
    ).join(SaleReturn, ReturnItem.return_id == SaleReturn.id).join(Sale, SaleReturn.sale_id == Sale.id).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
        ReturnItem.is_active == True,
        # Filtrar pela data da VENDA, não pela data da devolução
        Sale.created_at >= today_start,
        Sale.created_at <= today_end,
    )
    result = await db.execute(returns_cmv_today_query)
    returns_cmv_today = float(result.scalar() or 0.0)
    cmv_today = max(0, cmv_today - returns_cmv_today)
    
    profit_today = total_sales_today - cmv_today
    margin_today = (profit_today / total_sales_today * 100) if total_sales_today > 0 else 0.0

    # 7.1 Vendas de ontem (para calcular trend)
    sales_yesterday_query = select(
        func.coalesce(func.sum(Sale.total_amount), 0).label("total_yesterday"),
        func.count(Sale.id).label("count_yesterday"),
    ).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= yesterday_start,
        Sale.created_at <= yesterday_end,
        Sale.is_active == True,
    )

    result = await db.execute(sales_yesterday_query)
    sales_yesterday_stats = result.first()
    total_sales_yesterday = float(sales_yesterday_stats.total_yesterday) if sales_yesterday_stats.total_yesterday else 0.0
    sales_count_yesterday = int(sales_yesterday_stats.count_yesterday) if sales_yesterday_stats.count_yesterday else 0
    
    # Devoluções de vendas feitas ONTEM (subtrair das vendas de ontem)
    # Filtrar pela data da VENDA, não pela data da devolução
    returns_yesterday_query = select(
        func.coalesce(func.sum(SaleReturn.total_refund), 0).label("returns_yesterday"),
    ).join(Sale, SaleReturn.sale_id == Sale.id).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
        # Filtrar pela data da VENDA, não pela data da devolução
        Sale.created_at >= yesterday_start,
        Sale.created_at <= yesterday_end,
    )
    result = await db.execute(returns_yesterday_query)
    returns_yesterday = float(result.scalar() or 0.0)
    total_sales_yesterday = max(0, total_sales_yesterday - returns_yesterday)

    # Calcular trend de vendas (% de mudança)
    sales_trend_percent = 0.0
    if total_sales_yesterday > 0:
        sales_trend_percent = ((total_sales_today - total_sales_yesterday) / total_sales_yesterday) * 100
    elif total_sales_today > 0:
        # Se ontem foi 0 e hoje tem vendas, considerar 100% de crescimento
        sales_trend_percent = 100.0

    # 8. Ticket médio
    average_ticket = 0.0
    if sales_count_today > 0:
        average_ticket = total_sales_today / sales_count_today

    # 9. Total de vendas (todas as vendas ativas)
    sales_total_query = select(
        func.coalesce(func.sum(Sale.total_amount), 0).label("total_all"),
        func.count(Sale.id).label("count_all"),
    ).where(
        Sale.tenant_id == tenant_id,
        Sale.is_active == True,
    )

    result = await db.execute(sales_total_query)
    sales_total_stats = result.first()
    total_sales_all = float(sales_total_stats.total_all) if sales_total_stats.total_all else 0.0
    sales_count_all = int(sales_total_stats.count_all) if sales_total_stats.count_all else 0

    # 9.1 Total de devoluções (todas as devoluções concluídas)
    returns_total_query = select(
        func.coalesce(func.sum(SaleReturn.total_refund), 0).label("returns_all"),
    ).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
    )
    result = await db.execute(returns_total_query)
    returns_all = float(result.scalar() or 0.0)
    total_sales_all = max(0, total_sales_all - returns_all)

    # 10. Custo das Mercadorias Vendidas (CMV) - soma dos custos dos itens vendidos
    cmv_query = select(
        func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("total_cmv"),
    ).join(Sale, SaleItem.sale_id == Sale.id).where(
        Sale.tenant_id == tenant_id,
        Sale.is_active == True,
        SaleItem.is_active == True,
    )

    result = await db.execute(cmv_query)
    total_cmv = float(result.scalar() or 0.0)
    
    # 10.1 Custo dos itens devolvidos (para ajustar CMV)
    returns_cmv_total_query = select(
        func.coalesce(func.sum(ReturnItem.quantity_returned * ReturnItem.unit_cost), 0).label("returns_cmv_all"),
    ).join(SaleReturn, ReturnItem.return_id == SaleReturn.id).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
        ReturnItem.is_active == True,
    )
    result = await db.execute(returns_cmv_total_query)
    returns_cmv_all = float(result.scalar() or 0.0)
    total_cmv = max(0, total_cmv - returns_cmv_all)

    # Lucro realizado = Vendas totais - CMV
    realized_profit = total_sales_all - total_cmv
    # Margem = Lucro / Vendas (não Lucro / Custo!)
    realized_margin_percent = (realized_profit / total_sales_all * 100) if total_sales_all > 0 else 0.0

    # Retornar todas as estatísticas
    return {
        "stock": {
            "invested_value": invested_value,
            "potential_revenue": potential_revenue,
            "potential_profit": potential_revenue - invested_value,
            "average_margin_percent": round(average_margin, 2),
            "total_quantity": total_quantity,
            "total_products": total_products,  # produtos com estoque ativo
            "products_registered": total_products_registered,  # todos produtos ativos
            "low_stock_count": low_stock_count,
        },
        "sales": {
            "total_today": total_sales_today,
            "count_today": sales_count_today,
            "average_ticket": average_ticket,
            "profit_today": profit_today,
            "cmv_today": cmv_today,
            "margin_today": round(margin_today, 2),
            "total_yesterday": total_sales_yesterday,
            "count_yesterday": sales_count_yesterday,
            "trend_percent": round(sales_trend_percent, 2),
            "total_all": total_sales_all,
            "count_all": sales_count_all,
            "total_cmv": total_cmv,
            "realized_profit": realized_profit,
            "realized_margin_percent": round(realized_margin_percent, 2),
        },
        "customers": {
            "total": total_customers,
        },
        "metadata": {
            "calculated_at": str(today),
            "traceability_enabled": True,
            "note": "Valores calculados com base em EntryItems para rastreabilidade completa",
        },
    }


@router.get("/inventory/valuation", response_model=Dict[str, Any])
async def get_inventory_valuation(
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Valoração do estoque separada por custo e preço de venda, com breakdown por categoria.

    - cost_value: soma (unit_cost * quantity_remaining)
    - retail_value: soma (variant.price ou base_price * quantity_remaining)
    - potential_margin: retail - cost
    - by_category: lista com custo/venda/margem por categoria
    """
    from app.models.stock_entry import StockEntry
    from app.models.product_variant import ProductVariant

    # Total por custo
    total_cost_q = (
        select(
            func.coalesce(func.sum(EntryItem.quantity_remaining * EntryItem.unit_cost), 0).label("cost_value")
        )
        .select_from(EntryItem)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            EntryItem.quantity_remaining > 0,
            StockEntry.is_active == True,
        )
    )
    res = await db.execute(total_cost_q)
    cost_value = float(res.scalar() or 0.0)

    # Total por preço de venda (usar variante ou base_price)
    total_retail_q = (
        select(
            func.coalesce(func.sum(EntryItem.quantity_remaining * func.coalesce(ProductVariant.price, Product.base_price, 0)), 0).label("retail_value")
        )
        .select_from(EntryItem)
        .join(Product, EntryItem.product_id == Product.id)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .outerjoin(ProductVariant, and_(
            ProductVariant.product_id == Product.id,
            ProductVariant.is_active == True
        ))
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            EntryItem.quantity_remaining > 0,
            StockEntry.is_active == True,
            Product.is_active == True,
            Product.is_catalog == False,
            Product.tenant_id == tenant_id,
        )
    )
    res = await db.execute(total_retail_q)
    retail_value = float(res.scalar() or 0.0)

    # Breakdown por categoria (custo, venda, margem)
    by_category_q = (
        select(
            Category.id.label("category_id"),
            Category.name.label("category_name"),
            func.coalesce(func.sum(EntryItem.quantity_remaining * EntryItem.unit_cost), 0).label("cost_value"),
            func.coalesce(func.sum(EntryItem.quantity_remaining * func.coalesce(ProductVariant.price, Product.base_price, 0)), 0).label("retail_value"),
        )
        .select_from(EntryItem)
        .join(Product, EntryItem.product_id == Product.id)
        .join(Category, Product.category_id == Category.id)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .outerjoin(ProductVariant, and_(
            ProductVariant.product_id == Product.id,
            ProductVariant.is_active == True
        ))
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            EntryItem.quantity_remaining > 0,
            StockEntry.is_active == True,
            Product.is_active == True,
            Product.is_catalog == False,
            Product.tenant_id == tenant_id,
            Category.is_active == True,
        )
        .group_by(Category.id, Category.name)
        .order_by(Category.name.asc())
    )
    res = await db.execute(by_category_q)
    by_category_rows = res.fetchall()
    by_category = []
    for row in by_category_rows:
        c = float(row.cost_value or 0.0)
        r = float(row.retail_value or 0.0)
        by_category.append({
            "category_id": row.category_id,
            "category_name": row.category_name,
            "cost_value": c,
            "retail_value": r,
            "potential_margin": r - c,
        })

    return {
        "cost_value": cost_value,
        "retail_value": retail_value,
        "potential_margin": retail_value - cost_value,
        "by_category": by_category,
    }


@router.get("/inventory/health", response_model=Dict[str, Any])
async def get_inventory_health(
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Saúde do estoque: cobertura em dias, baixo estoque, aging e giro (proxy).
    """
    from datetime import date, timedelta
    from app.models.stock_entry import StockEntry

    # Quantidade disponível total
    total_qty_q = (
        select(func.coalesce(func.sum(EntryItem.quantity_remaining), 0))
        .select_from(EntryItem)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            EntryItem.quantity_remaining > 0,
            StockEntry.is_active == True,
        )
    )
    res = await db.execute(total_qty_q)
    total_available_qty = int(res.scalar() or 0)

    # Média diária de vendas (quantidade) nos últimos 30 dias
    today = today_brazil()
    start_date = today - timedelta(days=30)
    # Converter para range UTC
    health_start_utc, health_end_utc = get_period_range_utc(start_date, today)
    sales_qty_q = (
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .select_from(SaleItem)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            Sale.created_at >= health_start_utc,
            Sale.created_at <= health_end_utc,
        )
    )
    res = await db.execute(sales_qty_q)
    total_sold_last_30 = int(res.scalar() or 0)
    
    # Subtrair devoluções do período
    returns_qty_q = (
        select(func.coalesce(func.sum(ReturnItem.quantity_returned), 0))
        .select_from(ReturnItem)
        .join(SaleReturn, ReturnItem.return_id == SaleReturn.id)
        .where(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.status == "completed",
            SaleReturn.is_active == True,
            SaleReturn.created_at >= health_start_utc,
            SaleReturn.created_at <= health_end_utc,
            ReturnItem.is_active == True,
        )
    )
    res = await db.execute(returns_qty_q)
    total_returned_last_30 = int(res.scalar() or 0)
    total_sold_last_30 = max(0, total_sold_last_30 - total_returned_last_30)
    
    avg_daily_sold = total_sold_last_30 / 30.0 if total_sold_last_30 > 0 else 0.0

    coverage_days = (total_available_qty / avg_daily_sold) if avg_daily_sold > 0 else None

    # Baixo estoque
    low_stock_q = select(func.count(Inventory.id)).where(
        Inventory.tenant_id == tenant_id,
        Inventory.quantity <= Inventory.min_stock,
        Inventory.quantity > 0,
    )
    res = await db.execute(low_stock_q)
    low_stock_count = int(res.scalar() or 0)

    # Aging: percentuais de quantidade por faixas de tempo da entrada
    # Buckets: <=30, 31-60, 61-90, >90 dias
    # Calcular por quantidade (quantity_remaining)
    
    # Detectar banco de dados e usar sintaxe apropriada
    db_dialect = db.bind.dialect.name
    
    if db_dialect == 'postgresql':
        # PostgreSQL: usar date_part e age
        entry_age_days = func.date_part('day', func.age(func.date(today), StockEntry.entry_date))
    else:
        # SQLite: usar julianday para calcular diferença em dias
        entry_age_days = func.cast(
            func.julianday(func.date(today)) - func.julianday(StockEntry.entry_date),
            Integer
        )
    
    bucket_case = case(
        (entry_age_days <= 30, '0-30'),
        (entry_age_days <= 60, '31-60'),
        (entry_age_days <= 90, '61-90'),
        else_='90+'
    )
    aging_q = (
        select(
            bucket_case.label('bucket'),
            func.coalesce(func.sum(EntryItem.quantity_remaining), 0).label('qty')
        )
        .select_from(EntryItem)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            EntryItem.quantity_remaining > 0,
            StockEntry.is_active == True,
        )
        .group_by(bucket_case)
    )
    res = await db.execute(aging_q)
    aging_rows = res.fetchall()
    aging = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    total_qty = 0
    for row in aging_rows:
        q = int(row.qty or 0)
        aging[row.bucket] = q
        total_qty += q
    aging_percent = {
        k: (round((v / total_qty) * 100, 2) if total_qty > 0 else 0.0)
        for k, v in aging.items()
    }

    # Giro (proxy): custo das vendas nos últimos 30 dias / custo atual do estoque
    invested_q = (
        select(func.coalesce(func.sum(EntryItem.quantity_remaining * EntryItem.unit_cost), 0))
        .select_from(EntryItem)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            EntryItem.quantity_remaining > 0,
            StockEntry.is_active == True,
        )
    )
    res = await db.execute(invested_q)
    invested_value = float(res.scalar() or 0.0)

    # Custo das vendas 30d via sale_sources (JSON) - iterar no service
    # Buscar itens vendidos nas últimas 30d e somar total_cost das fontes
    items_q = (
        select(SaleItem.sale_sources)
        .select_from(SaleItem)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            Sale.created_at >= health_start_utc,
            Sale.created_at <= health_end_utc,
        )
    )
    res = await db.execute(items_q)
    rows = res.fetchall()
    cost_of_sales_30d = 0.0
    for (sources,) in rows:
        if isinstance(sources, list):
            for src in sources:
                cost_of_sales_30d += float(src.get("total_cost", 0.0) or 0.0)

    turnover_30d = (cost_of_sales_30d / invested_value) if invested_value > 0 else None

    # Score de saúde (simples, ponderado)
    score = 100.0
    # Penalizar cobertura baixa (<7 dias)
    if coverage_days is not None and coverage_days < 7:
        score -= 20
    # Penalizar aging alto (>50% acima de 90 dias)
    if aging_percent.get("90+", 0) >= 50:
        score -= 20
    # Penalizar baixo estoque
    if low_stock_count > 0:
        score -= min(20, low_stock_count * 2)
    # Penalizar giro muito baixo
    if turnover_30d is not None and turnover_30d < 0.2:
        score -= 20
    score = max(0.0, min(100.0, score))

    return {
        "coverage_days": coverage_days,
        "low_stock_count": low_stock_count,
        "aging": aging_percent,
        "turnover_30d": turnover_30d,
        "health_score": round(score, 1),
        "period": {
            "from": str(start_date),
            "to": str(today),
        },
    }


@router.get("/sales/monthly", response_model=Dict[str, Any])
async def get_monthly_sales_stats(
    period: Optional[PeriodFilter] = Query(
        default=PeriodFilter.THIS_MONTH,
        description="Filtro de período predefinido"
    ),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna estatísticas de vendas do período selecionado.

    **Filtros disponíveis:**
    - this_month: Mês atual (padrão)
    - last_30_days: Últimos 30 dias
    - last_2_months: Últimos 2 meses
    - last_3_months: Últimos 3 meses
    - last_6_months: Últimos 6 meses
    - this_year: Este ano

    **Retorno:**
    - total: total de vendas do período
    - count: quantidade de vendas
    - profit: lucro realizado (vendas - CMV)
    - average_ticket: ticket médio
    - margin_percent: margem de lucro (%)
    - cmv: custo das mercadorias vendidas
    - comparison: comparação com período anterior
    """
    start_date, end_date = get_period_dates(period)
    prev_start, prev_end = get_previous_period_dates(start_date, end_date)

    # Converter datas para ranges UTC (timezone brasileiro)
    period_start_utc, period_end_utc = get_period_range_utc(start_date, end_date)
    prev_start_utc, prev_end_utc = get_period_range_utc(prev_start, prev_end)

    # Vendas do período atual
    sales_query = select(
        func.coalesce(func.sum(Sale.total_amount), 0).label("total"),
        func.count(Sale.id).label("count"),
    ).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= period_start_utc,
        Sale.created_at <= period_end_utc,
        Sale.is_active == True,
    )

    result = await db.execute(sales_query)
    sales_stats = result.first()
    total = float(sales_stats.total) if sales_stats.total else 0.0
    count = int(sales_stats.count) if sales_stats.count else 0

    # CMV do período
    cmv_query = select(
        func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("cmv"),
    ).join(Sale, SaleItem.sale_id == Sale.id).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= period_start_utc,
        Sale.created_at <= period_end_utc,
        Sale.is_active == True,
        SaleItem.is_active == True,
    )

    result = await db.execute(cmv_query)
    cmv = float(result.scalar() or 0.0)

    # Devoluções do período atual (baseado na data da VENDA)
    returns_query = select(
        func.coalesce(func.sum(SaleReturn.total_refund), 0).label("returns"),
    ).join(Sale, SaleReturn.sale_id == Sale.id).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
        Sale.created_at >= period_start_utc,
        Sale.created_at <= period_end_utc,
    )
    result = await db.execute(returns_query)
    returns = float(result.scalar() or 0.0)
    
    # Custo dos itens devolvidos do período
    returns_cmv_query = select(
        func.coalesce(func.sum(ReturnItem.quantity_returned * ReturnItem.unit_cost), 0).label("returns_cmv"),
    ).join(SaleReturn, ReturnItem.return_id == SaleReturn.id).join(Sale, SaleReturn.sale_id == Sale.id).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
        ReturnItem.is_active == True,
        Sale.created_at >= period_start_utc,
        Sale.created_at <= period_end_utc,
    )
    result = await db.execute(returns_cmv_query)
    returns_cmv = float(result.scalar() or 0.0)
    
    # Ajustar valores com devoluções
    total = max(0, total - returns)
    cmv = max(0, cmv - returns_cmv)

    # Vendas do período anterior (para comparação)
    prev_sales_query = select(
        func.coalesce(func.sum(Sale.total_amount), 0).label("total"),
        func.count(Sale.id).label("count"),
    ).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= prev_start_utc,
        Sale.created_at <= prev_end_utc,
        Sale.is_active == True,
    )

    result = await db.execute(prev_sales_query)
    prev_stats = result.first()
    prev_total = float(prev_stats.total) if prev_stats.total else 0.0
    prev_count = int(prev_stats.count) if prev_stats.count else 0

    # CMV do período anterior
    prev_cmv_query = select(
        func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("cmv"),
    ).join(Sale, SaleItem.sale_id == Sale.id).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= prev_start_utc,
        Sale.created_at <= prev_end_utc,
        Sale.is_active == True,
        SaleItem.is_active == True,
    )

    result = await db.execute(prev_cmv_query)
    prev_cmv = float(result.scalar() or 0.0)

    # Devoluções do período anterior (baseado na data da VENDA)
    prev_returns_query = select(
        func.coalesce(func.sum(SaleReturn.total_refund), 0).label("returns"),
    ).join(Sale, SaleReturn.sale_id == Sale.id).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
        Sale.created_at >= prev_start_utc,
        Sale.created_at <= prev_end_utc,
    )
    result = await db.execute(prev_returns_query)
    prev_returns = float(result.scalar() or 0.0)
    
    # Custo dos itens devolvidos do período anterior
    prev_returns_cmv_query = select(
        func.coalesce(func.sum(ReturnItem.quantity_returned * ReturnItem.unit_cost), 0).label("returns_cmv"),
    ).join(SaleReturn, ReturnItem.return_id == SaleReturn.id).join(Sale, SaleReturn.sale_id == Sale.id).where(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.status == "completed",
        SaleReturn.is_active == True,
        ReturnItem.is_active == True,
        Sale.created_at >= prev_start_utc,
        Sale.created_at <= prev_end_utc,
    )
    result = await db.execute(prev_returns_cmv_query)
    prev_returns_cmv = float(result.scalar() or 0.0)
    
    # Ajustar valores do período anterior com devoluções
    prev_total = max(0, prev_total - prev_returns)
    prev_cmv = max(0, prev_cmv - prev_returns_cmv)

    # Cálculos
    profit = total - cmv
    margin_percent = (profit / total * 100) if total > 0 else 0.0
    average_ticket = total / count if count > 0 else 0.0

    prev_profit = prev_total - prev_cmv

    # Calcular variações percentuais
    total_change = ((total - prev_total) / prev_total * 100) if prev_total > 0 else (100.0 if total > 0 else 0.0)
    count_change = ((count - prev_count) / prev_count * 100) if prev_count > 0 else (100.0 if count > 0 else 0.0)
    profit_change = ((profit - prev_profit) / prev_profit * 100) if prev_profit > 0 else (100.0 if profit > 0 else 0.0)

    # Labels para período
    period_labels = {
        PeriodFilter.THIS_MONTH: "Este Mês",
        PeriodFilter.LAST_30_DAYS: "Últimos 30 dias",
        PeriodFilter.LAST_2_MONTHS: "Últimos 2 meses",
        PeriodFilter.LAST_3_MONTHS: "Últimos 3 meses",
        PeriodFilter.LAST_6_MONTHS: "Últimos 6 meses",
        PeriodFilter.THIS_YEAR: "Este Ano",
    }

    return {
        # Dados do período atual
        "total": total,
        "count": count,
        "profit": profit,
        "average_ticket": average_ticket,
        "margin_percent": round(margin_percent, 2),
        "cmv": cmv,

        # Compatibilidade com versão anterior
        "total_month": total,
        "count_month": count,
        "profit_month": profit,
        "average_ticket_month": average_ticket,
        "margin_percent_month": round(margin_percent, 2),
        "cmv_month": cmv,

        # Comparação com período anterior
        "comparison": {
            "prev_total": prev_total,
            "prev_count": prev_count,
            "prev_profit": prev_profit,
            "total_change_percent": round(total_change, 2),
            "count_change_percent": round(count_change, 2),
            "profit_change_percent": round(profit_change, 2),
        },

        # Metadados do período
        "period": {
            "filter": period.value,
            "label": period_labels.get(period, "Período"),
            "from": str(start_date),
            "to": str(end_date),
        },
        "previous_period": {
            "from": str(prev_start),
            "to": str(prev_end),
        },
    }


@router.get("/sales/daily", response_model=Dict[str, Any])
async def get_daily_sales(
    days: int = Query(default=7, ge=1, le=30, description="Quantidade de dias"),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna vendas dos últimos N dias para gráfico.

    **Retorno:**
    - daily: lista com data, total, count, profit, margin
    - totals: soma do período
    - best_day: dia com maior venda
    """
    today = today_brazil()
    start_date = today - timedelta(days=days - 1)

    # Buscar vendas do período
    period_start_utc, period_end_utc = get_period_range_utc(start_date, today)

    sales_query = (
        select(
            Sale.total_amount,
            Sale.created_at,
        )
        .where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= period_start_utc,
            Sale.created_at <= period_end_utc,
            Sale.is_active == True,
        )
        .order_by(Sale.created_at.asc())
    )

    result = await db.execute(sales_query)
    sales = result.fetchall()

    # Buscar CMV por dia
    cmv_query = (
        select(
            SaleItem.quantity,
            SaleItem.unit_cost,
            Sale.created_at,
        )
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= period_start_utc,
            Sale.created_at <= period_end_utc,
            Sale.is_active == True,
            SaleItem.is_active == True,
        )
    )

    result = await db.execute(cmv_query)
    cmv_items = result.fetchall()

    # Buscar devoluções do período (baseado na data da VENDA)
    returns_query = (
        select(
            SaleReturn.total_refund,
            Sale.created_at,
        )
        .join(Sale, SaleReturn.sale_id == Sale.id)
        .where(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.status == "completed",
            SaleReturn.is_active == True,
            Sale.created_at >= period_start_utc,
            Sale.created_at <= period_end_utc,
        )
    )
    result = await db.execute(returns_query)
    returns = result.fetchall()

    # Buscar custo dos itens devolvidos
    returns_cmv_query = (
        select(
            ReturnItem.quantity_returned,
            ReturnItem.unit_cost,
            Sale.created_at,
        )
        .join(SaleReturn, ReturnItem.return_id == SaleReturn.id)
        .join(Sale, SaleReturn.sale_id == Sale.id)
        .where(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.status == "completed",
            SaleReturn.is_active == True,
            ReturnItem.is_active == True,
            Sale.created_at >= period_start_utc,
            Sale.created_at <= period_end_utc,
        )
    )
    result = await db.execute(returns_cmv_query)
    returns_cmv_items = result.fetchall()

    # Agrupar por dia (usar data brasileira)
    from collections import defaultdict
    daily_totals = defaultdict(lambda: {"total": 0.0, "count": 0, "cmv": 0.0, "returns": 0.0, "returns_cmv": 0.0})

    for sale in sales:
        # Converter para data brasileira
        sale_date_brazil = sale.created_at.astimezone(ZoneInfo("America/Sao_Paulo")).date()
        date_str = sale_date_brazil.isoformat()
        daily_totals[date_str]["total"] += float(sale.total_amount or 0)
        daily_totals[date_str]["count"] += 1

    for item in cmv_items:
        item_date_brazil = item.created_at.astimezone(ZoneInfo("America/Sao_Paulo")).date()
        date_str = item_date_brazil.isoformat()
        daily_totals[date_str]["cmv"] += float(item.quantity or 0) * float(item.unit_cost or 0)

    for ret in returns:
        ret_date_brazil = ret.created_at.astimezone(ZoneInfo("America/Sao_Paulo")).date()
        date_str = ret_date_brazil.isoformat()
        daily_totals[date_str]["returns"] += float(ret.total_refund or 0)

    for item in returns_cmv_items:
        item_date_brazil = item.created_at.astimezone(ZoneInfo("America/Sao_Paulo")).date()
        date_str = item_date_brazil.isoformat()
        daily_totals[date_str]["returns_cmv"] += float(item.quantity_returned or 0) * float(item.unit_cost or 0)

    # Montar lista completa de dias (preencher dias sem vendas)
    daily_data = []
    for i in range(days):
        date = start_date + timedelta(days=i)
        date_str = date.isoformat()
        day_data = daily_totals.get(date_str, {"total": 0.0, "count": 0, "cmv": 0.0, "returns": 0.0, "returns_cmv": 0.0})

        # Ajustar com devoluções
        total = max(0, day_data["total"] - day_data["returns"])
        cmv = max(0, day_data["cmv"] - day_data["returns_cmv"])
        profit = total - cmv
        margin = (profit / total * 100) if total > 0 else 0.0

        daily_data.append({
            "date": date_str,
            "day_name": date.strftime("%a"),  # Mon, Tue, Wed...
            "day_short": date.strftime("%d/%m"),  # 15/02
            "total": round(total, 2),
            "count": day_data["count"],
            "cmv": round(cmv, 2),
            "profit": round(profit, 2),
            "margin_percent": round(margin, 1),
        })

    # Calcular totais (já ajustados com devoluções)
    total_sum = sum(d["total"] for d in daily_data)
    count_sum = sum(d["count"] for d in daily_data)
    profit_sum = sum(d["profit"] for d in daily_data)
    cmv_sum = sum(d["cmv"] for d in daily_data)

    # Melhor dia
    best_day = max(daily_data, key=lambda x: x["total"]) if daily_data else None

    return {
        "daily": daily_data,
        "totals": {
            "total": round(total_sum, 2),
            "count": count_sum,
            "profit": round(profit_sum, 2),
            "cmv": round(cmv_sum, 2),
            "average_per_day": round(total_sum / days, 2),
        },
        "best_day": best_day,
        "period": {
            "days": days,
            "from": start_date.isoformat(),
            "to": today.isoformat(),
        },
    }


@router.get("/top-products", response_model=Dict[str, Any])
async def get_top_products(
    period: Optional[PeriodFilter] = Query(
        default=PeriodFilter.THIS_MONTH,
        description="Filtro de periodo"
    ),
    limit: int = Query(default=5, ge=1, le=20),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna os produtos mais vendidos do período (por faturamento).
    
    NOTA: Considera devoluções - subtrai itens devolvidos das vendas.

    **Retorno:**
    - products: lista com id, nome, quantidade, receita, lucro, margem
    """
    start_date, end_date = get_period_dates(period)
    period_start_utc, period_end_utc = get_period_range_utc(start_date, end_date)

    # Buscar itens vendidos no período agrupados por produto
    top_q = (
        select(
            SaleItem.product_id,
            Product.name.label("product_name"),
            func.coalesce(func.sum(SaleItem.quantity), 0).label("qty_sold"),
            func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_price), 0).label("revenue"),
            func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0).label("cmv"),
        )
        .select_from(SaleItem)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .join(Product, SaleItem.product_id == Product.id)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= period_start_utc,
            Sale.created_at <= period_end_utc,
            Sale.is_active == True,
            SaleItem.is_active == True,
            Product.is_active == True,
        )
        .group_by(SaleItem.product_id, Product.name)
        .order_by(func.sum(SaleItem.quantity * SaleItem.unit_price).desc())
        .limit(limit)
    )

    res = await db.execute(top_q)
    rows = res.fetchall()

    # Buscar devoluções do período agrupadas por produto
    returns_q = (
        select(
            ReturnItem.product_id,
            func.coalesce(func.sum(ReturnItem.quantity_returned), 0).label("qty_returned"),
            func.coalesce(func.sum(ReturnItem.quantity_returned * ReturnItem.unit_price), 0).label("revenue_returned"),
            func.coalesce(func.sum(ReturnItem.quantity_returned * ReturnItem.unit_cost), 0).label("cmv_returned"),
        )
        .select_from(ReturnItem)
        .join(SaleReturn, ReturnItem.return_id == SaleReturn.id)
        .where(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.created_at >= period_start_utc,
            SaleReturn.created_at <= period_end_utc,
            SaleReturn.status == "completed",
            SaleReturn.is_active == True,
            ReturnItem.is_active == True,
        )
        .group_by(ReturnItem.product_id)
    )
    
    res = await db.execute(returns_q)
    returns_rows = res.fetchall()
    
    # Criar dict de devoluções por produto
    returns_by_product = {}
    for row in returns_rows:
        returns_by_product[row.product_id] = {
            "qty_returned": int(row.qty_returned or 0),
            "revenue_returned": float(row.revenue_returned or 0),
            "cmv_returned": float(row.cmv_returned or 0),
        }

    products = []
    for row in rows:
        # Valores de venda
        qty_sold = int(row.qty_sold or 0)
        revenue = float(row.revenue or 0)
        cmv = float(row.cmv or 0)
        
        # Subtrair devoluções se houver
        if row.product_id in returns_by_product:
            ret = returns_by_product[row.product_id]
            qty_sold = max(0, qty_sold - ret["qty_returned"])
            revenue = max(0, revenue - ret["revenue_returned"])
            cmv = max(0, cmv - ret["cmv_returned"])
        
        profit = revenue - cmv
        margin = (profit / revenue * 100) if revenue > 0 else 0.0
        products.append({
            "product_id": row.product_id,
            "product_name": row.product_name,
            "qty_sold": qty_sold,
            "revenue": round(revenue, 2),
            "cmv": round(cmv, 2),
            "profit": round(profit, 2),
            "margin_percent": round(margin, 1),
        })

    # Total do período para calcular participação %
    total_revenue = sum(p["revenue"] for p in products)

    for p in products:
        p["share_percent"] = round(
            (p["revenue"] / total_revenue * 100) if total_revenue > 0 else 0.0, 1
        )

    return {
        "products": products,
        "period": {
            "filter": period.value,
            "from": str(start_date),
            "to": str(end_date),
        },
    }


@router.get("/fifo-performance", response_model=Dict[str, Any])
async def get_fifo_performance(
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna métricas de performance FIFO.

    - sell_through_rate: % de estoque vendido (global e por entrada)
    - negative_roi_count: quantidade de entradas com ROI negativo
    - negative_roi_entries: lista das entradas com ROI negativo
    - avg_roi: ROI médio de todas as entradas
    """
    from app.models.stock_entry import StockEntry

    # 1. Sell-through global
    totals_q = (
        select(
            func.coalesce(func.sum(EntryItem.quantity_received), 0).label("total_received"),
            func.coalesce(func.sum(EntryItem.quantity_remaining), 0).label("total_remaining"),
        )
        .select_from(EntryItem)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,
            StockEntry.is_active == True,
        )
    )
    res = await db.execute(totals_q)
    row = res.first()
    total_received = int(row.total_received or 0)
    total_remaining = int(row.total_remaining or 0)
    total_sold = total_received - total_remaining
    sell_through_rate = round((total_sold / total_received * 100) if total_received > 0 else 0.0, 1)

    # 2. ROI por entrada
    # CORREÇÃO: Calcular ROI baseado no custo dos itens VENDIDOS, não no custo total da entrada
    # Custo dos vendidos = (quantity_sold * unit_cost)
    # Receita dos vendidos = (quantity_sold * variant.price) - usar preço da variante ou base_price
    from app.models.product_variant import ProductVariant
    
    # Subquery para obter preço da primeira variante ativa de cada produto
    # Como não podemos usar a property Product.price em SQL, usamos base_price como fallback
    # ou o preço da variante se disponível via LEFT JOIN
    entries_q = (
        select(
            StockEntry.id.label("entry_id"),
            StockEntry.entry_date,
            StockEntry.total_cost,
            func.coalesce(
                func.sum((EntryItem.quantity_received - EntryItem.quantity_remaining) * EntryItem.unit_cost), 0
            ).label("cost_of_sold"),  # Custo dos itens vendidos
            func.coalesce(
                func.sum(
                    (EntryItem.quantity_received - EntryItem.quantity_remaining) * 
                    func.coalesce(ProductVariant.price, Product.base_price, 0)
                ), 0
            ).label("revenue_of_sold"),  # Receita dos itens vendidos
            func.coalesce(func.sum(EntryItem.quantity_received), 0).label("total_received"),
            func.coalesce(func.sum(EntryItem.quantity_remaining), 0).label("total_remaining"),
        )
        .select_from(StockEntry)
        .join(EntryItem, EntryItem.entry_id == StockEntry.id)
        .join(Product, EntryItem.product_id == Product.id)
        .outerjoin(ProductVariant, and_(
            ProductVariant.product_id == Product.id,
            ProductVariant.is_active == True
        ))
        .where(
            StockEntry.tenant_id == tenant_id,
            StockEntry.is_active == True,
            EntryItem.is_active == True,
            Product.is_active == True,
        )
        .group_by(StockEntry.id, StockEntry.entry_date, StockEntry.total_cost)
        .having(func.sum(EntryItem.quantity_received) > 0)
    )
    res = await db.execute(entries_q)
    entry_rows = res.fetchall()

    negative_roi_entries = []
    total_cost_of_sold_sum = 0.0
    total_profit_sum = 0.0
    entries_with_sales = 0

    for entry in entry_rows:
        cost_of_sold = float(entry.cost_of_sold or 0)  # Custo dos itens vendidos
        revenue = float(entry.revenue_of_sold or 0)  # Receita dos itens vendidos
        total_entry_cost = float(entry.total_cost or 0)  # Custo total da entrada (para referência)
        qty_received = int(entry.total_received or 0)
        qty_remaining = int(entry.total_remaining or 0)
        qty_sold = qty_received - qty_remaining
        sell_through = round((qty_sold / qty_received * 100) if qty_received > 0 else 0.0, 1)

        # Só calcular ROI para entradas que tiveram vendas
        if qty_sold > 0 and cost_of_sold > 0:
            profit = revenue - cost_of_sold
            roi = round((profit / cost_of_sold * 100), 1)
            
            # Acumular para ROI ponderado (pelo custo dos vendidos)
            total_cost_of_sold_sum += cost_of_sold
            total_profit_sum += profit
            entries_with_sales += 1

            if roi < 0:
                negative_roi_entries.append({
                    "entry_id": entry.entry_id,
                    "entry_date": str(entry.entry_date),
                    "total_cost": round(total_entry_cost, 2),
                    "cost_of_sold": round(cost_of_sold, 2),
                    "estimated_revenue": round(revenue, 2),
                    "roi": roi,
                    "sell_through": sell_through,
                })

    # ROI médio PONDERADO pelo custo dos itens vendidos
    # Isso garante que entradas com mais vendas tenham peso proporcional
    avg_roi = round((total_profit_sum / total_cost_of_sold_sum * 100) if total_cost_of_sold_sum > 0 else 0.0, 1)

    # Ordenar por ROI (mais negativo primeiro)
    negative_roi_entries.sort(key=lambda x: x["roi"])

    return {
        "sell_through": {
            "rate": sell_through_rate,
            "total_received": total_received,
            "total_sold": total_sold,
            "total_remaining": total_remaining,
        },
        "roi": {
            "avg_roi": avg_roi,
            "negative_count": len(negative_roi_entries),
            "negative_entries": negative_roi_entries[:5],  # top 5 piores
        },
    }


@router.get("/sales/yoy", response_model=Dict[str, Any])
async def get_yoy_comparison(
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Comparação Ano a Ano (YoY): mês a mês do ano atual vs ano anterior.

    **Retorno:**
    - months: lista com jan-dez, total atual e anterior
    - totals: soma anual atual vs anterior
    - change_percent: variação % total
    """
    today = today_brazil()
    current_year = today.year
    prev_year = current_year - 1

    # Buscar vendas mensais do ano atual (até o mês atual)
    current_year_start = date(current_year, 1, 1)
    current_year_end = today
    current_start_utc, current_end_utc = get_period_range_utc(current_year_start, current_year_end)

    current_sales_q = (
        select(Sale.total_amount, Sale.created_at)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= current_start_utc,
            Sale.created_at <= current_end_utc,
            Sale.is_active == True,
        )
    )
    current_cmv_q = (
        select(SaleItem.quantity, SaleItem.unit_cost, Sale.created_at)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= current_start_utc,
            Sale.created_at <= current_end_utc,
            Sale.is_active == True,
            SaleItem.is_active == True,
        )
    )

    # Vendas do ano anterior (mesmo período: jan até o mesmo dia/mês)
    prev_year_start = date(prev_year, 1, 1)
    prev_year_end = date(prev_year, today.month, min(today.day, 28) if today.month == 2 else today.day)
    prev_start_utc, prev_end_utc = get_period_range_utc(prev_year_start, prev_year_end)

    prev_sales_q = (
        select(Sale.total_amount, Sale.created_at)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= prev_start_utc,
            Sale.created_at <= prev_end_utc,
            Sale.is_active == True,
        )
    )
    prev_cmv_q = (
        select(SaleItem.quantity, SaleItem.unit_cost, Sale.created_at)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= prev_start_utc,
            Sale.created_at <= prev_end_utc,
            Sale.is_active == True,
            SaleItem.is_active == True,
        )
    )

    res = await db.execute(current_sales_q)
    current_sales = res.fetchall()
    res = await db.execute(current_cmv_q)
    current_cmv_items = res.fetchall()
    res = await db.execute(prev_sales_q)
    prev_sales = res.fetchall()
    res = await db.execute(prev_cmv_q)
    prev_cmv_items = res.fetchall()

    # Buscar devoluções do ano atual (baseado na data da VENDA)
    current_returns_q = (
        select(SaleReturn.total_refund, Sale.created_at)
        .join(Sale, SaleReturn.sale_id == Sale.id)
        .where(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.status == "completed",
            SaleReturn.is_active == True,
            Sale.created_at >= current_start_utc,
            Sale.created_at <= current_end_utc,
        )
    )
    res = await db.execute(current_returns_q)
    current_returns = res.fetchall()

    # Buscar custo dos itens devolvidos do ano atual
    current_returns_cmv_q = (
        select(ReturnItem.quantity_returned, ReturnItem.unit_cost, Sale.created_at)
        .join(SaleReturn, ReturnItem.return_id == SaleReturn.id)
        .join(Sale, SaleReturn.sale_id == Sale.id)
        .where(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.status == "completed",
            SaleReturn.is_active == True,
            ReturnItem.is_active == True,
            Sale.created_at >= current_start_utc,
            Sale.created_at <= current_end_utc,
        )
    )
    res = await db.execute(current_returns_cmv_q)
    current_returns_cmv_items = res.fetchall()

    # Buscar devoluções do ano anterior
    prev_returns_q = (
        select(SaleReturn.total_refund, Sale.created_at)
        .join(Sale, SaleReturn.sale_id == Sale.id)
        .where(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.status == "completed",
            SaleReturn.is_active == True,
            Sale.created_at >= prev_start_utc,
            Sale.created_at <= prev_end_utc,
        )
    )
    res = await db.execute(prev_returns_q)
    prev_returns = res.fetchall()

    # Buscar custo dos itens devolvidos do ano anterior
    prev_returns_cmv_q = (
        select(ReturnItem.quantity_returned, ReturnItem.unit_cost, Sale.created_at)
        .join(SaleReturn, ReturnItem.return_id == SaleReturn.id)
        .join(Sale, SaleReturn.sale_id == Sale.id)
        .where(
            SaleReturn.tenant_id == tenant_id,
            SaleReturn.status == "completed",
            SaleReturn.is_active == True,
            ReturnItem.is_active == True,
            Sale.created_at >= prev_start_utc,
            Sale.created_at <= prev_end_utc,
        )
    )
    res = await db.execute(prev_returns_cmv_q)
    prev_returns_cmv_items = res.fetchall()

    # Agrupar por mês (timezone brasileiro)
    from collections import defaultdict
    brazil_tz = ZoneInfo("America/Sao_Paulo")

    def group_by_month(sales_rows, cmv_rows, returns_rows, returns_cmv_rows):
        monthly = defaultdict(lambda: {"total": 0.0, "count": 0, "cmv": 0.0, "returns": 0.0, "returns_cmv": 0.0})
        for sale in sales_rows:
            m = sale.created_at.astimezone(brazil_tz).month
            monthly[m]["total"] += float(sale.total_amount or 0)
            monthly[m]["count"] += 1
        for item in cmv_rows:
            m = item.created_at.astimezone(brazil_tz).month
            monthly[m]["cmv"] += float(item.quantity or 0) * float(item.unit_cost or 0)
        for ret in returns_rows:
            m = ret.created_at.astimezone(brazil_tz).month
            monthly[m]["returns"] += float(ret.total_refund or 0)
        for item in returns_cmv_rows:
            m = item.created_at.astimezone(brazil_tz).month
            monthly[m]["returns_cmv"] += float(item.quantity_returned or 0) * float(item.unit_cost or 0)
        return monthly

    current_monthly = group_by_month(current_sales, current_cmv_items, current_returns, current_returns_cmv_items)
    prev_monthly = group_by_month(prev_sales, prev_cmv_items, prev_returns, prev_returns_cmv_items)

    month_names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                   "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

    months = []
    for m in range(1, today.month + 1):
        curr = current_monthly.get(m, {"total": 0.0, "count": 0, "cmv": 0.0, "returns": 0.0, "returns_cmv": 0.0})
        prev = prev_monthly.get(m, {"total": 0.0, "count": 0, "cmv": 0.0, "returns": 0.0, "returns_cmv": 0.0})

        # Ajustar com devoluções
        curr_total = max(0, curr["total"] - curr["returns"])
        curr_cmv = max(0, curr["cmv"] - curr["returns_cmv"])
        curr_profit = curr_total - curr_cmv
        
        prev_total = max(0, prev["total"] - prev["returns"])
        prev_cmv = max(0, prev["cmv"] - prev["returns_cmv"])
        prev_profit = prev_total - prev_cmv

        change = round(
            ((curr_total - prev_total) / prev_total * 100) if prev_total > 0 else
            (100.0 if curr_total > 0 else 0.0),
            1
        )

        months.append({
            "month": m,
            "month_name": month_names[m - 1],
            "current_total": round(curr_total, 2),
            "current_profit": round(curr_profit, 2),
            "prev_total": round(prev_total, 2),
            "prev_profit": round(prev_profit, 2),
            "change_percent": change,
        })

    curr_year_total = sum(d["current_total"] for d in months)
    prev_year_total = sum(d["prev_total"] for d in months)
    curr_year_profit = sum(d["current_profit"] for d in months)
    prev_year_profit = sum(d["prev_profit"] for d in months)

    total_change = round(
        ((curr_year_total - prev_year_total) / prev_year_total * 100) if prev_year_total > 0 else
        (100.0 if curr_year_total > 0 else 0.0),
        1
    )

    return {
        "months": months,
        "totals": {
            "current_year": current_year,
            "prev_year": prev_year,
            "current_total": round(curr_year_total, 2),
            "current_profit": round(curr_year_profit, 2),
            "prev_total": round(prev_year_total, 2),
            "prev_profit": round(prev_year_profit, 2),
            "total_change_percent": total_change,
        },
    }


@router.get("/purchases", response_model=Dict[str, Any])
async def get_period_purchases(
    period: Optional[PeriodFilter] = Query(
        default=PeriodFilter.THIS_MONTH,
        description="Filtro de periodo predefinido"
    ),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna estatisticas de compras/entradas de estoque do periodo.

    **Metricas:**
    - total_invested: valor total investido em compras
    - entries_count: quantidade de entradas
    - items_count: quantidade de itens/produtos comprados
    - by_type: distribuicao por tipo de entrada (trip, online, local)
    - comparison: comparacao com periodo anterior
    """
    start_date, end_date = get_period_dates(period)
    prev_start, prev_end = get_previous_period_dates(start_date, end_date)

    # Compras do periodo atual
    purchases_query = select(
        func.coalesce(func.sum(StockEntry.total_cost), 0).label("total_invested"),
        func.count(StockEntry.id).label("entries_count"),
    ).where(
        StockEntry.tenant_id == tenant_id,
        StockEntry.entry_date >= start_date,
        StockEntry.entry_date <= end_date,
        StockEntry.is_active == True,
    )

    result = await db.execute(purchases_query)
    stats = result.first()
    total_invested = float(stats.total_invested) if stats.total_invested else 0.0
    entries_count = int(stats.entries_count) if stats.entries_count else 0

    # Quantidade de itens comprados no periodo
    items_query = select(
        func.coalesce(func.sum(EntryItem.quantity_received), 0).label("items_count"),
    ).join(StockEntry, EntryItem.entry_id == StockEntry.id).where(
        StockEntry.tenant_id == tenant_id,
        StockEntry.entry_date >= start_date,
        StockEntry.entry_date <= end_date,
        StockEntry.is_active == True,
        EntryItem.is_active == True,
    )

    result = await db.execute(items_query)
    items_count = int(result.scalar() or 0)

    # Distribuicao por tipo de entrada
    by_type_query = select(
        StockEntry.entry_type,
        func.coalesce(func.sum(StockEntry.total_cost), 0).label("total"),
        func.count(StockEntry.id).label("count"),
    ).where(
        StockEntry.tenant_id == tenant_id,
        StockEntry.entry_date >= start_date,
        StockEntry.entry_date <= end_date,
        StockEntry.is_active == True,
    ).group_by(StockEntry.entry_type)

    result = await db.execute(by_type_query)
    by_type_rows = result.fetchall()

    by_type = {}
    for row in by_type_rows:
        entry_type = row.entry_type.value if hasattr(row.entry_type, 'value') else str(row.entry_type)
        by_type[entry_type] = {
            "total": float(row.total or 0),
            "count": int(row.count or 0),
        }

    # Compras do periodo anterior (para comparacao)
    prev_purchases_query = select(
        func.coalesce(func.sum(StockEntry.total_cost), 0).label("total_invested"),
        func.count(StockEntry.id).label("entries_count"),
    ).where(
        StockEntry.tenant_id == tenant_id,
        StockEntry.entry_date >= prev_start,
        StockEntry.entry_date <= prev_end,
        StockEntry.is_active == True,
    )

    result = await db.execute(prev_purchases_query)
    prev_stats = result.first()
    prev_total = float(prev_stats.total_invested) if prev_stats.total_invested else 0.0
    prev_count = int(prev_stats.entries_count) if prev_stats.entries_count else 0

    # Calcular variacoes
    total_change = ((total_invested - prev_total) / prev_total * 100) if prev_total > 0 else (100.0 if total_invested > 0 else 0.0)
    count_change = ((entries_count - prev_count) / prev_count * 100) if prev_count > 0 else (100.0 if entries_count > 0 else 0.0)

    # Labels para tipo de entrada
    type_labels = {
        "trip": "Viagem",
        "online": "Online",
        "local": "Local",
        "initial": "Estoque Inicial",
        "adjustment": "Ajuste",
        "return": "Devolucao",
        "donation": "Doacao",
    }

    # Labels para periodo
    period_labels = {
        PeriodFilter.THIS_MONTH: "Este Mes",
        PeriodFilter.LAST_30_DAYS: "Ultimos 30 dias",
        PeriodFilter.LAST_2_MONTHS: "Ultimos 2 meses",
        PeriodFilter.LAST_3_MONTHS: "Ultimos 3 meses",
        PeriodFilter.LAST_6_MONTHS: "Ultimos 6 meses",
        PeriodFilter.THIS_YEAR: "Este Ano",
    }

    return {
        # Dados do periodo atual
        "total_invested": total_invested,
        "entries_count": entries_count,
        "items_count": items_count,
        "average_per_entry": round(total_invested / entries_count, 2) if entries_count > 0 else 0.0,

        # Distribuicao por tipo
        "by_type": by_type,
        "type_labels": type_labels,

        # Comparacao com periodo anterior
        "comparison": {
            "prev_total": prev_total,
            "prev_count": prev_count,
            "total_change_percent": round(total_change, 2),
            "count_change_percent": round(count_change, 2),
        },

        # Metadados do periodo
        "period": {
            "filter": period.value,
            "label": period_labels.get(period, "Periodo"),
            "from": str(start_date),
            "to": str(end_date),
        },
    }
