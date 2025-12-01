"""
Dashboard API endpoints.

Fornece estatísticas e métricas para o dashboard do app mobile.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, case, Integer
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
from decimal import Decimal

from app.core.database import get_db
from app.api.deps import get_current_tenant_id, get_current_active_user
from app.models.product import Product
from app.models.category import Category
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.customer import Customer
from app.models.sale import Sale, SaleItem
from app.models.user import User

router = APIRouter()


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
    potential_revenue_query = (
        select(
            func.coalesce(
                func.sum(EntryItem.quantity_remaining * Product.price), 0
            ).label("potential_revenue")
        )
        .select_from(EntryItem)
        .join(Product, EntryItem.product_id == Product.id)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
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

    # 7. Vendas de hoje
    from datetime import date, timedelta
    today = date.today()
    yesterday = today - timedelta(days=1)

    sales_today_query = select(
        func.coalesce(func.sum(Sale.total_amount), 0).label("total_today"),
        func.count(Sale.id).label("count_today"),
    ).where(
        Sale.tenant_id == tenant_id,
        func.date(Sale.created_at) == today,
        Sale.is_active == True,
    )

    result = await db.execute(sales_today_query)
    sales_stats = result.first()
    total_sales_today = float(sales_stats.total_today) if sales_stats.total_today else 0.0
    sales_count_today = int(sales_stats.count_today) if sales_stats.count_today else 0

    # 7.1 Vendas de ontem (para calcular trend)
    sales_yesterday_query = select(
        func.coalesce(func.sum(Sale.total_amount), 0).label("total_yesterday"),
        func.count(Sale.id).label("count_yesterday"),
    ).where(
        Sale.tenant_id == tenant_id,
        func.date(Sale.created_at) == yesterday,
        Sale.is_active == True,
    )

    result = await db.execute(sales_yesterday_query)
    sales_yesterday_stats = result.first()
    total_sales_yesterday = float(sales_yesterday_stats.total_yesterday) if sales_yesterday_stats.total_yesterday else 0.0
    sales_count_yesterday = int(sales_yesterday_stats.count_yesterday) if sales_yesterday_stats.count_yesterday else 0

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
    - retail_value: soma (product.price * quantity_remaining)
    - potential_margin: retail - cost
    - by_category: lista com custo/venda/margem por categoria
    """
    from app.models.stock_entry import StockEntry

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

    # Total por preço de venda
    total_retail_q = (
        select(
            func.coalesce(func.sum(EntryItem.quantity_remaining * Product.price), 0).label("retail_value")
        )
        .select_from(EntryItem)
        .join(Product, EntryItem.product_id == Product.id)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
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
            func.coalesce(func.sum(EntryItem.quantity_remaining * Product.price), 0).label("retail_value"),
        )
        .select_from(EntryItem)
        .join(Product, EntryItem.product_id == Product.id)
        .join(Category, Product.category_id == Category.id)
        .join(StockEntry, EntryItem.entry_id == StockEntry.id)
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
    today = date.today()
    start_date = today - timedelta(days=30)
    sales_qty_q = (
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .select_from(SaleItem)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(
            Sale.tenant_id == tenant_id,
            Sale.is_active == True,
            func.date(Sale.created_at) >= start_date,
            func.date(Sale.created_at) <= today,
        )
    )
    res = await db.execute(sales_qty_q)
    total_sold_last_30 = int(res.scalar() or 0)
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
            func.date(Sale.created_at) >= start_date,
            func.date(Sale.created_at) <= today,
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
