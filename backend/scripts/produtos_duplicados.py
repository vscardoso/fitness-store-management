"""
Produtos repetidos na mesma loja (mesmo nome, ex.: "Macacão Fitness Tipo Meia Com Zíper" como #001 e #002).

Fica o produto de menor código. Em cada produto repetido, a variação EXATAMENTE igual a uma do que fica (mesma cor e
mesmo tamanho, sem diferenciar maiúscula nem espaço) sai por exclusão lógica (is_active=False). Variação sem par
igual não é tocada. Se todas as variações do repetido saírem, o produto repetido sai também.

O estoque fica nas entradas (entry_items.quantity_remaining), não na variação: variação repetida que ainda tem
peças NÃO é excluída no --apply, a não ser com --com-estoque (aí as peças restantes dela são zeradas, porque eram
a contagem em dobro). As vendas antigas continuam gravadas.

Uso (a partir de backend/, ou dentro do container do backend):
    python scripts/produtos_duplicados.py --loja 2                  # só mostra o que seria excluído
    python scripts/produtos_duplicados.py --loja 2 --apply          # exclui as variações iguais sem estoque
    python scripts/produtos_duplicados.py --loja 2 --apply --com-estoque   # também as que têm peças (zera o resto)

A base usada é a do DATABASE_URL.
"""
import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select, update  # noqa: E402

from app.core.database import async_session_maker  # noqa: E402
from app.core.rls import bypass_on  # noqa: E402
from app.models.entry_item import EntryItem  # noqa: E402
from app.models.product import Product  # noqa: E402
from app.models.product_variant import ProductVariant  # noqa: E402
from app.models.sale import Sale, SaleItem  # noqa: E402
from app.models.store import Store  # noqa: E402


def _key(s) -> str:
    return " ".join(str(s or "").split()).lower()


def _code(product_code, variant_number=None) -> str:
    if not product_code:
        return "(sem código)"
    base = f"#{int(product_code):03d}"
    return f"{base}-{variant_number}" if variant_number else base


def _desc(v) -> str:
    return " · ".join(x.strip() for x in (v.color, v.size) if x and x.strip()) or "(sem cor e tamanho)"


async def plan_store(db, store_id: int) -> list[dict]:
    """Uma linha por variação repetida: a que fica, a que sai, peças e vendas de cada uma."""
    products = (await db.execute(
        select(Product).where(Product.tenant_id == store_id, Product.is_active == True)  # noqa: E712
    )).scalars().all()
    groups: dict[str, list[Product]] = defaultdict(list)
    for p in products:
        groups[_key(p.name)].append(p)
    groups = {k: sorted(v, key=lambda p: (p.code_number or 10**9, p.id)) for k, v in groups.items() if len(v) > 1}
    if not groups:
        return []

    ids = [p.id for ps in groups.values() for p in ps]
    variants = (await db.execute(
        select(ProductVariant).where(ProductVariant.product_id.in_(ids), ProductVariant.is_active == True)  # noqa: E712
    )).scalars().all()
    by_product: dict[int, list[ProductVariant]] = defaultdict(list)
    for v in variants:
        by_product[v.product_id].append(v)
    vids = [v.id for v in variants]
    stock = dict((await db.execute(
        select(EntryItem.variant_id, func.coalesce(func.sum(EntryItem.quantity_remaining), 0))
        .where(EntryItem.variant_id.in_(vids), EntryItem.is_active == True)  # noqa: E712
        .group_by(EntryItem.variant_id)
    )).all()) if vids else {}
    sales = dict((await db.execute(
        select(SaleItem.variant_id, func.count(SaleItem.id))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(SaleItem.variant_id.in_(vids), Sale.is_active == True)  # noqa: E712
        .group_by(SaleItem.variant_id)
    )).all()) if vids else {}

    rows = []
    for ps in groups.values():
        keep = ps[0]
        keep_by_desc = {(_key(v.color), _key(v.size)): v for v in by_product[keep.id]}
        for dup in ps[1:]:
            dup_variants = by_product[dup.id]
            for v in sorted(dup_variants, key=lambda v: v.variant_number or 0):
                twin = keep_by_desc.get((_key(v.color), _key(v.size)))
                rows.append({
                    "product": keep.name, "keep_product": keep, "dup_product": dup,
                    "keep": twin, "dup": v,
                    "keep_stock": int(stock.get(twin.id, 0)) if twin else None,
                    "dup_stock": int(stock.get(v.id, 0)), "dup_sales": int(sales.get(v.id, 0)),
                    "dup_variant_count": len(dup_variants),
                })
    return rows


def print_plan(store, rows) -> None:
    print(f"\nLoja {store.id} ({store.name})")
    if not rows:
        print("  Nenhum produto repetido.")
        return
    current = None
    for r in rows:
        if r["dup_product"].id != current:
            current = r["dup_product"].id
            print(f"\n  {r['product']}")
            print(f"    fica {_code(r['keep_product'].code_number)}, repetido {_code(r['dup_product'].code_number)}")
        v = r["dup"]
        dup_code = _code(v.product_code or r["dup_product"].code_number, v.variant_number)
        if r["keep"] is None:
            print(f"    MANTER   {dup_code} {_desc(v)}: não tem igual no produto que fica")
            continue
        k = r["keep"]
        keep_code = _code(k.product_code or r["keep_product"].code_number, k.variant_number)
        extra = f"{r['dup_stock']} peça(s) em estoque, {r['dup_sales']} venda(s)"
        tag = "EXCLUIR " if r["dup_stock"] == 0 else "EXCLUIR*"
        print(f"    {tag} {dup_code} {_desc(v)} ({extra})  igual a {keep_code} ({r['keep_stock']} peça(s))")
    if any(r["keep"] is not None and r["dup_stock"] > 0 for r in rows):
        print("\n  * tem peças em estoque: só sai com --com-estoque (as peças restantes dela são zeradas).")


async def apply_store(db, rows, with_stock: bool) -> tuple[int, int, int]:
    gone_variants = gone_products = skipped = 0
    removed_by_product: dict[int, int] = defaultdict(int)
    for r in rows:
        if r["keep"] is None:
            continue
        if r["dup_stock"] > 0 and not with_stock:
            skipped += 1
            continue
        v = r["dup"]
        if r["dup_stock"] > 0:
            await db.execute(update(EntryItem).where(EntryItem.variant_id == v.id, EntryItem.is_active == True)  # noqa: E712
                             .values(quantity_remaining=0))
        v.is_active = False
        gone_variants += 1
        removed_by_product[r["dup_product"].id] += 1
    for r in rows:
        dup = r["dup_product"]
        if dup.is_active and removed_by_product[dup.id] == r["dup_variant_count"]:
            dup.is_active = False
            gone_products += 1
    return gone_variants, gone_products, skipped


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--loja", type=int, help="só esta loja")
    ap.add_argument("--apply", action="store_true", help="grava (sem isso, só mostra)")
    ap.add_argument("--com-estoque", action="store_true", help="exclui também a variação repetida que ainda tem peças")
    args = ap.parse_args()

    async with async_session_maker() as db:
        await bypass_on(db)
        q = select(Store).where(Store.is_active == True).order_by(Store.id)  # noqa: E712
        if args.loja:
            q = q.where(Store.id == args.loja)
        stores = (await db.execute(q)).scalars().all()
        for store in stores:
            rows = await plan_store(db, store.id)
            print_plan(store, rows)
            if args.apply and rows:
                gone_v, gone_p, skipped = await apply_store(db, rows, args.com_estoque)
                await db.commit()
                print(f"  GRAVADO: {gone_v} variação(ões) e {gone_p} produto(s) excluídos; {skipped} com estoque ficaram.")
    if not args.apply:
        print("\nSimulação: nada foi gravado. Para gravar, rode de novo com --apply.")


if __name__ == "__main__":
    asyncio.run(main())
