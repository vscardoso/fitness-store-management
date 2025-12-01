"""
Computa os valores dos cards do dashboard para um tenant específico e gera um relatório Markdown.
"""
import asyncio
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import select, func, distinct, and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.sale import Sale, SaleItem
from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.customer import Customer

TENANT_ID = 2  # Tenant solicitado


async def compute_values():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    today = date.today()

    async with Session() as db:
        # Vendas hoje
        sales_today_q = select(
            func.coalesce(func.sum(Sale.total_amount), 0),
            func.count(Sale.id),
        ).where(
            Sale.is_active == True,
            Sale.tenant_id == TENANT_ID,
            func.date(Sale.created_at) == today,
        )
        total_today, count_today = (await db.execute(sales_today_q)).one()

        # Vendas totais
        sales_all_q = select(
            func.coalesce(func.sum(Sale.total_amount), 0),
            func.count(Sale.id),
        ).where(
            Sale.is_active == True,
            Sale.tenant_id == TENANT_ID,
        )
        total_all, count_all = (await db.execute(sales_all_q)).one()

        # CMV total (unit_cost foi adicionado)
        cmv_q = select(
            func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_cost), 0)
        ).join(Sale, SaleItem.sale_id == Sale.id).where(
            Sale.is_active == True,
            SaleItem.is_active == True,
            Sale.tenant_id == TENANT_ID,
            SaleItem.tenant_id == TENANT_ID,
        )
        (total_cmv,) = (await db.execute(cmv_q)).one()

        realized_profit = (total_all or 0) - (total_cmv or 0)
        realized_margin_percent = float(
            (realized_profit / total_all * 100) if total_all and total_all > 0 else 0
        )

        # Valuation do estoque atual (custo e venda) via EntryItem + Product
        # Custo
        cost_q = select(
            func.coalesce(func.sum(EntryItem.quantity_remaining * EntryItem.unit_cost), 0)
        ).where(
            EntryItem.is_active == True,
            EntryItem.tenant_id == TENANT_ID,
        )
        (stock_cost,) = (await db.execute(cost_q)).one()

        # Venda (retail): precisa juntar com preço do produto
        retail_q = select(
            func.coalesce(func.sum(EntryItem.quantity_remaining * Product.price), 0)
        ).join(Product, EntryItem.product_id == Product.id).where(
            EntryItem.is_active == True,
            EntryItem.tenant_id == TENANT_ID,
            Product.is_active == True,
            Product.tenant_id == TENANT_ID,
        )
        (stock_retail,) = (await db.execute(retail_q)).one()

        potential_profit = (stock_retail or 0) - (stock_cost or 0)
        average_margin = float(
            ((stock_retail - stock_cost) / stock_cost * 100) if stock_cost and stock_cost > 0 else 0
        )

        # Produtos com estoque (distinct por product_id com quantity_remaining > 0)
        products_with_stock_q = select(
            func.count(distinct(EntryItem.product_id))
        ).where(
            EntryItem.is_active == True,
            EntryItem.tenant_id == TENANT_ID,
            EntryItem.quantity_remaining > 0,
        )
        (products_with_stock,) = (await db.execute(products_with_stock_q)).one()

        # Clientes ativos
        customers_q = select(func.count(Customer.id)).where(
            Customer.is_active == True,
            Customer.tenant_id == TENANT_ID,
        )
        (customers_total,) = (await db.execute(customers_q)).one()

        await engine.dispose()

        return {
            "tenant_id": TENANT_ID,
            "sales_today": {"total": float(total_today or 0), "count": int(count_today or 0)},
            "sales_all": {"total": float(total_all or 0), "count": int(count_all or 0)},
            "cmv": float(total_cmv or 0),
            "realized_profit": float(realized_profit or 0),
            "realized_margin_percent": round(realized_margin_percent, 2),
            "stock": {
                "cost_value": float(stock_cost or 0),
                "retail_value": float(stock_retail or 0),
                "potential_profit": float(potential_profit or 0),
                "average_margin_percent": round(average_margin, 2),
                "products_with_stock": int(products_with_stock or 0),
            },
            "customers_total": int(customers_total or 0),
            "generated_at": datetime.utcnow().isoformat(),
        }


def format_currency(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def build_markdown(data: dict) -> str:
    lines = []
    lines.append(f"# Relatório de Cards do Dashboard (Tenant {data['tenant_id']})\n")
    lines.append(f"Gerado em: {data['generated_at']} UTC\n")

    lines.append("## Resumo\n")
    lines.append(f"- Vendas Hoje: {format_currency(data['sales_today']['total'])} ({data['sales_today']['count']} vendas)")
    lines.append(f"- Vendas Totais: {format_currency(data['sales_all']['total'])} ({data['sales_all']['count']} vendas)")
    lines.append(f"- CMV: {format_currency(data['cmv'])}")
    lines.append(f"- Lucro Realizado: {format_currency(data['realized_profit'])} ({data['realized_margin_percent']}% margem)")
    lines.append(f"- Estoque (Custo): {format_currency(data['stock']['cost_value'])}")
    lines.append(f"- Estoque (Venda): {format_currency(data['stock']['retail_value'])}")
    lines.append(f"- Margem Potencial: {format_currency(data['stock']['potential_profit'])} ({data['stock']['average_margin_percent']}% média)")
    lines.append(f"- Produtos com estoque: {data['stock']['products_with_stock']}")
    lines.append(f"- Clientes ativos: {data['customers_total']}\n")

    # Soma dos valores monetários exibidos nos cards
    soma_monetaria = (
        data['sales_today']['total']
        + data['sales_all']['total']
        + data['realized_profit']
        + data['stock']['cost_value']
        + data['stock']['retail_value']
        + data['stock']['potential_profit']
    )
    lines.append("## Soma Monetária (auditoria)\n")
    lines.append("Nota: Soma aritmética dos valores em moeda exibidos, sem significado financeiro direto (apenas auditoria visual).")
    lines.append(f"- Total: {format_currency(soma_monetaria)}\n")

    lines.append("## Detalhes e Fórmulas\n")
    lines.append("- Vendas Hoje: soma de `Sale.total_amount` do dia atual.")
    lines.append("- Vendas Totais: soma de `Sale.total_amount` de todas as vendas ativas.")
    lines.append("- CMV: soma de `SaleItem.quantity × SaleItem.unit_cost`.")
    lines.append("- Lucro Realizado: `Vendas Totais - CMV`; Margem: `Lucro / Vendas Totais`.")
    lines.append("- Estoque (Custo): soma de `EntryItem.quantity_remaining × EntryItem.unit_cost`.")
    lines.append("- Estoque (Venda): soma de `EntryItem.quantity_remaining × Product.price`.")
    lines.append("- Margem Potencial: `Estoque (Venda) - Estoque (Custo)`; Margem média: `(Venda - Custo)/Custo`.")

    return "\n".join(lines) + "\n"


async def main():
    data = await compute_values()
    md = build_markdown(data)
    # Escrever arquivo na raiz
    with open("DASHBOARD_VALUES_REPORT.md", "w", encoding="utf-8") as f:
        f.write(md)
    print("Relatório gerado: DASHBOARD_VALUES_REPORT.md")
    print(md)


if __name__ == "__main__":
    asyncio.run(main())
