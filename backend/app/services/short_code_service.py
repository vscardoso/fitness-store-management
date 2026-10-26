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


def reserve(connection, tenant_id: int, count: int) -> int:
    """Reserva `count` números seguidos para a loja e devolve o primeiro. Roda na transação atual."""
    dialect = connection.dialect.name
    start_from_existing = (
        select(func.coalesce(func.max(ProductVariant.short_code), 0) + 1)
        .where(ProductVariant.tenant_id == tenant_id)
        .scalar_subquery()
    )
    values = dict(tenant_id=tenant_id, next_short_code=start_from_existing, is_active=True,
                  created_at=func.now(), updated_at=func.now())
    table = CatalogCounter.__table__
    if dialect == "postgresql":
        ins = postgresql.insert(table).values(**values).on_conflict_do_nothing(index_elements=["tenant_id"])
    else:
        ins = sqlite.insert(table).values(**values).on_conflict_do_nothing(index_elements=["tenant_id"])
    connection.execute(ins)
    first = connection.execute(
        update(table)
        .where(table.c.tenant_id == tenant_id)
        .values(next_short_code=table.c.next_short_code + count, updated_at=func.now())
        .returning(table.c.next_short_code - count)
    ).scalar_one()
    return int(first)


def _variant_order(v: ProductVariant):
    return (v.product_id or 0, (v.color or "").casefold(), size_sort_key(v.size), v.sku or "")


def assign_codes(connection, variants: Iterable[ProductVariant]) -> int:
    """Dá número às variações sem código (por loja, em ordem de grade). Devolve quantas numerou."""
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
    return done


@event.listens_for(Session, "before_flush")
def _assign_on_create(session: Session, flush_context, instances) -> None:
    new = [o for o in session.new if isinstance(o, ProductVariant) and o.short_code is None and o.sku]
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
    pending = [v for v in variants if v.short_code is None and v.sku]
    if not pending:
        return 0
    n = await db.run_sync(lambda sync_session: assign_codes(sync_session.connection(), pending))
    await db.flush()
    return n
