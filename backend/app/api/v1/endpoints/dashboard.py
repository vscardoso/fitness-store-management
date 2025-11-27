"""
Dashboard API endpoints.

Fornece estatísticas e métricas para o dashboard do app mobile.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
from decimal import Decimal

from app.core.database import get_db
from app.api.deps import get_current_tenant_id, get_current_active_user
from app.models.product import Product
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.customer import Customer
from app.models.sale import Sale
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
    entry_items_query = select(
        func.coalesce(func.sum(EntryItem.quantity_remaining * EntryItem.unit_cost), 0).label("invested_value"),
        func.coalesce(func.sum(EntryItem.quantity_remaining), 0).label("total_quantity"),
    ).where(
        EntryItem.tenant_id == tenant_id,
        EntryItem.is_active == True,
        EntryItem.quantity_remaining > 0,
    )

    result = await db.execute(entry_items_query)
    stock_stats = result.first()
    invested_value = float(stock_stats.invested_value) if stock_stats.invested_value else 0.0
    total_quantity = int(stock_stats.total_quantity) if stock_stats.total_quantity else 0

    # 2. Valor potencial (receita se vender todo o estoque)
    # Para cada produto, pegar o preço de venda e multiplicar pela quantidade restante
    potential_revenue_query = select(
        func.coalesce(
            func.sum(EntryItem.quantity_remaining * Product.price), 0
        ).label("potential_revenue")
    ).select_from(EntryItem).join(
        Product, EntryItem.product_id == Product.id
    ).where(
        EntryItem.tenant_id == tenant_id,
        EntryItem.is_active == True,
        EntryItem.quantity_remaining > 0,
        Product.is_active == True,
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
    products_with_entries_query = select(
        func.count(func.distinct(EntryItem.product_id))
    ).where(
        EntryItem.tenant_id == tenant_id,
        EntryItem.is_active == True,
        EntryItem.quantity_remaining > 0,
    )
    result = await db.execute(products_with_entries_query)
    total_products = result.scalar() or 0

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
    from datetime import date
    today = date.today()

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

    # 8. Ticket médio
    average_ticket = 0.0
    if sales_count_today > 0:
        average_ticket = total_sales_today / sales_count_today

    # Retornar todas as estatísticas
    return {
        "stock": {
            "invested_value": invested_value,
            "potential_revenue": potential_revenue,
            "potential_profit": potential_revenue - invested_value,
            "average_margin_percent": round(average_margin, 2),
            "total_quantity": total_quantity,
            "total_products": total_products,
            "low_stock_count": low_stock_count,
        },
        "sales": {
            "total_today": total_sales_today,
            "count_today": sales_count_today,
            "average_ticket": average_ticket,
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
