"""
Trava de estoque no Postgres: serializa quem mexe nas MESMAS peças, sem travar a loja inteira.

Por que existe: o FIFO lê `quantity_remaining`, decide e grava, e a devolução confere "quanto já voltou" antes de gravar.
Sem trava, dois pedidos simultâneos (2 workers, 2 celulares) leem o mesmo saldo e os dois passam: a última peça é vendida
duas vezes, ou a devolução passa do vendido. A trava é `pg_advisory_xact_lock`: liberada sozinha no commit/rollback.

Regras (evitam deadlock): travar sempre na mesma ordem, a venda primeiro e depois as variações em ordem crescente de id;
chamar ANTES de ler saldo/estado; a trava é reentrante na mesma transação, então chamar de novo mais abaixo é inofensivo.
No SQLite (testes unitários) não faz nada.
"""
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_CLASS_SALE = 7302
_CLASS_VARIANT = 7301
_CLASS_PRODUCT = 7303  # estoque legado sem variação
_CLASS_SHIPMENT = 7304  # envio condicional


async def lock_stock(
    db: AsyncSession,
    *,
    sale_ids: Iterable[int | None] = (),
    shipment_ids: Iterable[int | None] = (),
    variant_ids: Iterable[int | None] = (),
    product_ids: Iterable[int | None] = (),
) -> None:
    if db.get_bind().dialect.name != "postgresql":
        return
    plan = (
        [(_CLASS_SALE, i) for i in sorted({int(x) for x in sale_ids if x})]
        + [(_CLASS_SHIPMENT, i) for i in sorted({int(x) for x in shipment_ids if x})]
        + [(_CLASS_VARIANT, i) for i in sorted({int(x) for x in variant_ids if x})]
        + [(_CLASS_PRODUCT, i) for i in sorted({int(x) for x in product_ids if x})]
    )
    for cls, key in plan:
        await db.execute(text("SELECT pg_advisory_xact_lock(:c, :k)"), {"c": cls, "k": key})
