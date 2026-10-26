"""
Código curto da etiqueta (#0001, #0002...): um número por variação, por loja, em ordem de criação.

- Nunca repete nem reaproveita: o contador fica em `catalog_counters` (uma linha por loja). A reserva é um
  UPDATE ... RETURNING, que trava a linha até o fim da transação: duas criações ao mesmo tempo esperam
  uma pela outra. Se a transação desfizer (rollback), o contador volta junto, então não sobra buraco.
- Atribuído sozinho ao gravar variação NOVA com SKU (evento before_flush, vale para todos os caminhos
  que criam variação). Variação de catálogo (sem SKU) não ganha número.
- Variações antigas: `scripts/short_codes_backfill.py` numera por ordem de criação.
"""
import re
from typing import Iterable, Optional

from sqlalchemy import event, func, select, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.models.catalog_counter import CatalogCounter
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.utils.variant_code import format_variant_code, parse_variant_code, variant_qr_payload  # noqa: F401
from app.utils.variant_grid import size_sort_key

QR_PREFIX = "PV#"
_CODE_RE = re.compile(r"^\s*(?:PV)?#?\s*0*(\d{1,9})\s*$", re.IGNORECASE)


def format_short_code(n: Optional[int]) -> Optional[str]:
    """123 -> '#0123' (pelo menos 4 dígitos; cresce sozinho depois de 9999)."""
    return None if n is None else f"#{n:04d}"


def qr_payload(n: int) -> str:
    """O que vai no QR: 'PV#0123' (prefixo evita confundir com código de barras de fornecedor)."""
    return f"{QR_PREFIX}{n:04d}"


def parse_short_code(text: Optional[str]) -> Optional[int]:
    """Aceita o que vem do leitor ou da digitação: 'PV#0123', '#0123', '0123', '123'."""
    if not text:
        return None
    m = _CODE_RE.match(str(text))
    if not m:
        return None
    n = int(m.group(1))
    return n if n > 0 else None


def _reserve(connection, tenant_id: int, count: int, which: str) -> int:
    """Reserva `count` números seguidos ('short' = variação, 'product' = produto) e devolve o primeiro."""
    from sqlalchemy import case
    dialect = connection.dialect.name
    short_start = (
        select(func.coalesce(func.max(ProductVariant.short_code), 0) + 1)
        .where(ProductVariant.tenant_id == tenant_id)
        .scalar_subquery()
    )
    product_start = (
        select(func.coalesce(func.max(Product.code_number), 0) + 1)
        .where(Product.tenant_id == tenant_id)
        .scalar_subquery()
    )
    values = dict(tenant_id=tenant_id, next_short_code=short_start, next_product_code=product_start, is_active=True,
                  created_at=func.now(), updated_at=func.now())
    table = CatalogCounter.__table__
    if dialect == "postgresql":
        ins = postgresql.insert(table).values(**values).on_conflict_do_nothing(index_elements=["tenant_id"])
    else:
        ins = sqlite.insert(table).values(**values).on_conflict_do_nothing(index_elements=["tenant_id"])
    connection.execute(ins)
    if which == "short":
        col, floor = table.c.next_short_code, short_start
    else:
        col, floor = table.c.next_product_code, product_start
    # nunca devolve número menor que max+1 (linha antiga do contador, criada antes da coluna existir)
    base = case((col > floor, col), else_=floor)
    first = connection.execute(
        update(table)
        .where(table.c.tenant_id == tenant_id)
        .values({col.key: base + count, "updated_at": func.now()})
        .returning(col - count)   # RETURNING enxerga o valor novo: tira o que somamos
    ).scalar_one()
    return int(first)


def reserve(connection, tenant_id: int, count: int) -> int:
    """Reserva `count` números de VARIAÇÃO (legado #0123) e devolve o primeiro. Roda na transação atual."""
    return _reserve(connection, tenant_id, count, "short")


def reserve_products(connection, tenant_id: int, count: int) -> int:
    """Reserva `count` números de PRODUTO (o 101 de #101-1) e devolve o primeiro."""
    return _reserve(connection, tenant_id, count, "product")


def _variant_order(v: ProductVariant):
    return (v.product_id or 0, (v.color or "").casefold(), size_sort_key(v.size), v.sku or "")


def assign_codes(connection, variants: Iterable[ProductVariant]) -> int:
    """Dá número às variações sem código (por loja, em ordem de grade). Devolve quantas numerou."""
    variants = list(variants)
    by_tenant: dict[int, list[ProductVariant]] = {}
    for v in variants:
        if v.short_code is None and v.tenant_id is not None and v.sku:
            by_tenant.setdefault(v.tenant_id, []).append(v)
    done = 0
    for tenant_id in sorted(by_tenant):
        vs = sorted(by_tenant[tenant_id], key=_variant_order)
        first = reserve(connection, tenant_id, len(vs))
        for i, v in enumerate(vs):
            v.short_code = first + i
        done += len(vs)
    assign_product_codes(connection, variants)
    return done


def assign_product_codes(connection, variants: Iterable[ProductVariant]) -> int:
    """Dá o código "#produto-variação" às variações com SKU que ainda não têm.

    O produto ganha o número dele na primeira variação numerada (por loja, sem repetir); cada variação nova
    do mesmo produto continua a contagem (1, 2, 3...), na ordem da grade, e nunca reaproveita número.
    """
    groups: dict[tuple, list[ProductVariant]] = {}
    for v in variants:
        if v.variant_number is None and v.tenant_id is not None and v.sku:
            product = v.__dict__.get("product")
            key = ("id", v.product_id) if v.product_id is not None else ("obj", id(product))
            if key[0] == "obj" and product is None:
                continue
            groups.setdefault(key, []).append(v)
    done = 0
    for key in sorted(groups, key=lambda k: (k[0] != "id", k[1] if k[0] == "id" else 0)):
        vs = sorted(groups[key], key=_variant_order)
        tenant_id = vs[0].tenant_id
        if key[0] == "id":
            product_id = key[1]
            code = connection.execute(select(Product.code_number).where(Product.id == product_id)).scalar_one_or_none()
            if code is None:
                code = reserve_products(connection, tenant_id, 1)
                connection.execute(update(Product).where(Product.id == product_id).values(code_number=code))
            last = connection.execute(
                select(func.coalesce(func.max(ProductVariant.variant_number), 0)).where(ProductVariant.product_id == product_id)
            ).scalar_one()
        else:
            product = vs[0].__dict__["product"]
            if product.code_number is None:
                product.code_number = reserve_products(connection, tenant_id, 1)
            code, last = product.code_number, 0
        for i, v in enumerate(vs):
            v.product_code = code
            v.variant_number = int(last) + 1 + i
        done += len(vs)
    return done


@event.listens_for(Session, "before_flush")
def _assign_on_create(session: Session, flush_context, instances) -> None:
    new = [o for o in session.new if isinstance(o, ProductVariant) and (o.short_code is None or o.variant_number is None) and o.sku]
    if not new:
        return
    connection = session.connection()
    for v in new:
        if v.tenant_id is None:
            product = v.__dict__.get("product")
            if product is not None and product.tenant_id is not None:
                v.tenant_id = product.tenant_id
            elif v.product_id is not None:
                v.tenant_id = connection.execute(
                    select(Product.tenant_id).where(Product.id == v.product_id)
                ).scalar_one_or_none()
    assign_codes(connection, new)


async def ensure_codes(db, variants: Iterable[ProductVariant]) -> int:
    """Para variações já gravadas sem número (ex.: antes do código existir): numera agora, sem commit."""
    pending = [v for v in variants if (v.short_code is None or v.variant_number is None) and v.sku]
    if not pending:
        return 0
    n = await db.run_sync(lambda sync_session: assign_codes(sync_session.connection(), pending))
    await db.flush()
    return n
