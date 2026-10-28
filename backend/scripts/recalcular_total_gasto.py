"""
Recalcula o total gasto (`customers.total_spent`) e o número de compras (`customers.total_purchases`) de cada
cliente a partir das vendas, com a regra do dinheiro de 28/10/2026 (a mesma de `app/services/money_ledger.py`):

    total gasto = soma das vendas válidas da cliente (concluída, parcialmente devolvida ou devolvida, inclusive
                  as vendas de troca) - soma das devoluções concluídas dessas vendas
    compras     = número de vendas válidas que não são venda de troca

Venda cancelada ou pendente não entra, nem as devoluções dela. Antes desta regra a devolução não descontava
o total gasto e a troca não somava a peça nova, por isso clientes antigos podem estar com o valor errado.
Não mexe em pontos de fidelidade nem no tipo da cliente (REGULAR/VIP/PREMIUM). Idempotente.

Uso (a partir de backend/, ou dentro do container do backend):
    python scripts/recalcular_total_gasto.py            # simulação: mostra o que mudaria
    python scripts/recalcular_total_gasto.py --apply    # grava (uma transação por loja)
    python scripts/recalcular_total_gasto.py --loja 2   # só uma loja

A base usada é a do DATABASE_URL.
"""
import argparse
import asyncio
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select  # noqa: E402

from app.core.database import async_session_maker  # noqa: E402
from app.core.rls import bypass_on  # noqa: E402
from app.models.customer import Customer  # noqa: E402
from app.models.sale import Sale  # noqa: E402
from app.models.sale_return import SaleReturn  # noqa: E402
from app.models.store import Store  # noqa: E402
from app.services.money_ledger import VALID_STATUS  # noqa: E402

CENT = Decimal("0.01")


def _money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(CENT)


async def expected_totals(db, store_id: int) -> dict[int, tuple[Decimal, int]]:
    """{customer_id: (total gasto, compras)} das clientes que têm alguma venda válida na loja."""
    valid = (Sale.tenant_id == store_id, Sale.is_active == True, Sale.status.in_(VALID_STATUS),  # noqa: E712
             Sale.customer_id.is_not(None))
    exchange_ids = select(SaleReturn.exchange_sale_id).where(
        SaleReturn.tenant_id == store_id, SaleReturn.exchange_sale_id.is_not(None),
        SaleReturn.is_active == True)  # noqa: E712
    sold = (await db.execute(
        select(Sale.customer_id, func.sum(Sale.total_amount),
               func.count(Sale.id).filter(Sale.id.not_in(exchange_ids)))
        .where(*valid).group_by(Sale.customer_id)
    )).all()
    refunded = dict((await db.execute(
        select(Sale.customer_id, func.sum(SaleReturn.total_refund))
        .join(Sale, Sale.id == SaleReturn.sale_id)
        .where(*valid, SaleReturn.is_active == True, SaleReturn.status == "completed")  # noqa: E712
        .group_by(Sale.customer_id)
    )).all())
    return {cid: (max(Decimal("0"), _money(total) - _money(refunded.get(cid))), int(count or 0))
            for cid, total, count in sold}


async def recalculate_store(db, store_id: int) -> list[tuple]:
    """Corrige as clientes da loja na sessão (sem commit). Devolve [(cliente, gasto antigo, novo, compras antigas, novas)]."""
    expected = await expected_totals(db, store_id)
    customers = (await db.execute(
        select(Customer).where(Customer.tenant_id == store_id).order_by(Customer.id))).scalars().all()
    changes = []
    for c in customers:
        spent, purchases = expected.get(c.id, (Decimal("0"), 0))
        old_spent, old_purchases = _money(c.total_spent), int(c.total_purchases or 0)
        if old_spent != spent or old_purchases != purchases:
            changes.append((c, old_spent, spent, old_purchases, purchases))
            c.total_spent = spent
            c.total_purchases = purchases
    return changes


async def main(apply: bool, only_store: int | None) -> int:
    async with async_session_maker() as db:
        await bypass_on(db)
        stores = (await db.execute(select(Store.id, Store.name).order_by(Store.id))).all()
    changed_total = 0
    for store_id, store_name in stores:
        if only_store and store_id != only_store:
            continue
        async with async_session_maker() as db:
            await bypass_on(db)
            changes = await recalculate_store(db, store_id)
            print(f"Loja {store_id} ({store_name}): {len(changes)} clientes com valor diferente")
            for c, old_spent, spent, old_p, p in changes:
                print(f"  cliente {c.id} {c.full_name or ''}: total gasto R$ {old_spent} -> R$ {spent}"
                      f" (diferença {spent - old_spent:+}), compras {old_p} -> {p}")
            if changes and apply:
                await db.commit()
                print("  Gravado.")
            else:
                await db.rollback()
            changed_total += len(changes)
    print(("Gravados" if apply else "Simulação: seriam corrigidos") + f" {changed_total} clientes."
          + ("" if apply or not changed_total else " Nada gravado (use --apply)."))
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="grava (sem isso é só simulação)")
    p.add_argument("--loja", type=int, help="só esta loja (stores.id)")
    a = p.parse_args()
    sys.exit(asyncio.run(main(a.apply, a.loja)))
