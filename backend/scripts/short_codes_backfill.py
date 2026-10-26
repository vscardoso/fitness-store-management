"""
Numera com o código da etiqueta as variações que ainda não têm: o antigo por variação (#0123) e o novo
"#produto-variação" (ex.: #101-1: produto 101, variação 1 dele).

Por loja, em ordem de criação; só variações com SKU (as de catálogo ficam sem número). Produto novo ganha
o próximo número de produto; as variações dele recebem 1, 2, 3... na ordem da grade. Continua de onde o contador da loja parou e nunca mexe em variação que já tem número
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
from app.services.short_code_service import (  # noqa: E402
    assign_product_codes,
    format_short_code,
    format_variant_code,
    reserve,
)


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
            if pending:
                first = await db.run_sync(lambda s: reserve(s.connection(), store_id, len(pending)))
                print(f"Loja {store_id} ({store_name}): {len(pending)} variações sem número antigo (#0123), de {format_short_code(first)} a {format_short_code(first + len(pending) - 1)}")
                for i, (v, _) in enumerate(pending):
                    v.short_code = first + i

            # Código da etiqueta "#produto-variação": só variações com SKU que ainda não têm
            to_code = (await db.execute(
                select(ProductVariant)
                .where(ProductVariant.tenant_id == store_id,
                       ProductVariant.variant_number.is_(None),
                       ProductVariant.sku.is_not(None))
                .order_by(ProductVariant.product_id, ProductVariant.id)
            )).scalars().all()
            if to_code:
                n = await db.run_sync(lambda s: assign_product_codes(s.connection(), to_code))
                products = {v.product_id for v in to_code}
                print(f"Loja {store_id} ({store_name}): {n} variações de {len(products)} produtos ganham o código produto-variação")
                names = {pid: name for pid, name in (await db.execute(
                    select(Product.id, Product.name).where(Product.id.in_(products)))).all()}
                for v in sorted(to_code, key=lambda x: (x.product_code or 0, x.variant_number or 0))[:6]:
                    print(f"  {format_variant_code(v.product_code, v.variant_number)}  {names.get(v.product_id, '')} {v.color or ''} {v.size or ''} (SKU {v.sku})")
                if len(to_code) > 6:
                    print(f"  ... e mais {len(to_code) - 6}")
            if not pending and not to_code:
                print(f"Loja {store_id} ({store_name}): nada a numerar")
                continue
            if apply:
                await db.commit()
                print("  Gravado.")
            else:
                await db.rollback()  # devolve a reserva dos contadores
            total += max(len(pending), len(to_code))
    print(("Gravadas" if apply else "Simulação: seriam numeradas") + f" {total} variações." + ("" if apply else " Nada gravado (use --apply)."))
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="grava (sem isso é só simulação)")
    p.add_argument("--loja", type=int, help="só esta loja (stores.id)")
    a = p.parse_args()
    sys.exit(asyncio.run(main(a.apply, a.loja)))
