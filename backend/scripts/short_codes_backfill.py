"""
Numera com o código curto da etiqueta (#0001...) as variações que ainda não têm número.

Por loja, em ordem de criação (data de criação, depois id); só variações com SKU (as de catálogo ficam
sem número). Continua de onde o contador da loja parou e nunca mexe em variação que já tem número
nem no SKU. Idempotente: rodar de novo não muda nada.

Uso (a partir de backend/, ou dentro do container do backend):
    python scripts/short_codes_backfill.py            # simulação: mostra o que faria
    python scripts/short_codes_backfill.py --apply    # grava (uma transação por loja)
    python scripts/short_codes_backfill.py --loja 1   # só uma loja

A base usada é a do DATABASE_URL.
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session_maker  # noqa: E402
from app.core.rls import bypass_on  # noqa: E402
from app.models.product import Product  # noqa: E402
from app.models.product_variant import ProductVariant  # noqa: E402
from app.models.store import Store  # noqa: E402
from app.services.short_code_service import format_short_code, reserve  # noqa: E402


async def main(apply: bool, only_store: int | None) -> int:
    async with async_session_maker() as db:
        await bypass_on(db)
        stores = (await db.execute(select(Store.id, Store.name).order_by(Store.id))).all()
    total = 0
    for store_id, store_name in stores:
        if only_store and store_id != only_store:
            continue
        async with async_session_maker() as db:
            await bypass_on(db)
            pending = (await db.execute(
                select(ProductVariant, Product.name)
                .join(Product, Product.id == ProductVariant.product_id)
                .where(ProductVariant.tenant_id == store_id,
                       ProductVariant.short_code.is_(None),
                       ProductVariant.sku.is_not(None))
                .order_by(ProductVariant.created_at, ProductVariant.id)
            )).all()
            if not pending:
                print(f"Loja {store_id} ({store_name}): nada a numerar")
                continue
            first = await db.run_sync(lambda s: reserve(s.connection(), store_id, len(pending)))
            print(f"Loja {store_id} ({store_name}): {len(pending)} variações, de {format_short_code(first)} a {format_short_code(first + len(pending) - 1)}")
            for i, (v, pname) in enumerate(pending[:5]):
                print(f"  {format_short_code(first + i)}  {pname} {v.color or ''} {v.size or ''} (SKU {v.sku})")
            if len(pending) > 5:
                print(f"  ... e mais {len(pending) - 5}")
            if apply:
                for i, (v, _) in enumerate(pending):
                    v.short_code = first + i
                await db.commit()
                print("  Gravado.")
            else:
                await db.rollback()  # devolve a reserva do contador
            total += len(pending)
    print(("Gravadas" if apply else "Simulação: seriam numeradas") + f" {total} variações." + ("" if apply else " Nada gravado (use --apply)."))
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="grava (sem isso é só simulação)")
    p.add_argument("--loja", type=int, help="só esta loja (stores.id)")
    a = p.parse_args()
    sys.exit(asyncio.run(main(a.apply, a.loja)))
