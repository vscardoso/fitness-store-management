"""Regra de produto SEM ESTOQUE (decisão do Victor, 08/11/2026).

Produto com estoque zerado não entra em contagem nenhuma (produtos ativos, estoque baixo, alertas...). A única exceção é o
produto que esgotou por VENDA (vendeu e zerou): só ele conta, e só em "Sem estoque". Zerado que nunca vendeu (variação
excluída, baixa, cadastro só de catálogo) serve apenas para o catálogo.
"""
from typing import Iterable, Optional, Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sale import Sale, SaleItem
from app.services.money_ledger import VALID_STATUS


def sold_products_subquery(tenant_id: int):
    """product_id de todo produto que já teve venda válida (concluída, parcialmente devolvida ou devolvida)."""
    return (
        select(SaleItem.product_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(
            Sale.tenant_id == tenant_id, Sale.is_active == True,  # noqa: E712
            Sale.status.in_(VALID_STATUS), SaleItem.is_active == True,  # noqa: E712
            SaleItem.product_id.is_not(None),
        )
        .distinct()
    )


async def sold_product_ids(db: AsyncSession, tenant_id: int, product_ids: Optional[Iterable[int]] = None) -> Set[int]:
    q = sold_products_subquery(tenant_id)
    if product_ids is not None:
        ids = list(product_ids)
        if not ids:
            return set()
        q = q.where(SaleItem.product_id.in_(ids))
    return {r[0] for r in (await db.execute(q)).all()}


def counts_as_out_of_stock(stock: int, has_sales: bool) -> bool:
    """Só conta como "sem estoque" o produto zerado que já foi vendido."""
    return stock <= 0 and has_sales


async def sold_variant_ids(db: AsyncSession, tenant_id: int, variant_ids: Optional[Iterable[int]] = None) -> Set[int]:
    """variant_id de toda variação que já teve venda válida. Variação que nunca vendeu e zerou é cadastro errado ou sobra."""
    q = (
        select(SaleItem.variant_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(
            Sale.tenant_id == tenant_id, Sale.is_active == True,  # noqa: E712
            Sale.status.in_(VALID_STATUS), SaleItem.is_active == True,  # noqa: E712
            SaleItem.variant_id.is_not(None),
        )
        .distinct()
    )
    if variant_ids is not None:
        ids = list(variant_ids)
        if not ids:
            return set()
        q = q.where(SaleItem.variant_id.in_(ids))
    return {r[0] for r in (await db.execute(q)).all()}
