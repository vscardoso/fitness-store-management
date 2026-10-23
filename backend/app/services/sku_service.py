"""
SKU sem corrida: bloqueio por loja e próximo número livre.

Quem cria produto/variação/entrada chama resolve_free_skus() ANTES de gravar:
- o bloqueio (pg_advisory_xact_lock) faz dois cadastros simultâneos da mesma loja esperarem um ao outro;
- SKU que já existe (ou repetido no mesmo envio) recebe o próximo número livre em vez de dar erro.
"""
import re
from typing import Iterable, List, Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession


async def lock_catalog(db: AsyncSession, tenant_id: int) -> None:
    """Serializa a criação de catálogo (produto, variação, entrada) da MESMA loja; liberado no commit/rollback."""
    if db.get_bind().dialect.name != "postgresql":
        return
    await db.execute(text("SELECT pg_advisory_xact_lock(CAST(:k AS bigint))"), {"k": 7_300_000_000 + int(tenant_id)})


def bump_sku(sku: str) -> str:
    """...-001 vira ...-002 (mantém os zeros); sem número no fim, acrescenta -002."""
    m = re.match(r"^(.*?)(\d+)$", sku)
    if not m:
        return f"{sku}-002"
    num = m.group(2)
    return f"{m.group(1)}{int(num) + 1:0{len(num)}d}"


async def resolve_free_skus(db: AsyncSession, skus: Iterable[Optional[str]], tenant_id: int) -> List[Optional[str]]:
    from app.models.product_variant import ProductVariant
    from app.services.error_log_service import record_error

    await lock_catalog(db, tenant_id)
    wanted = [str(s).strip().upper() if s and str(s).strip() else None for s in skus]
    cache: dict = {}

    async def taken(cand: str) -> bool:
        if cand not in cache:
            row = await db.execute(
                select(ProductVariant.id).where(
                    ProductVariant.tenant_id == tenant_id,
                    ProductVariant.is_active == True,  # noqa: E712
                    func.upper(ProductVariant.sku) == cand,
                ).limit(1)
            )
            cache[cand] = row.first() is not None
        return cache[cand]

    chosen: set = set()
    out: list = []
    adjusted = []
    for w in wanted:
        if w is None:
            out.append(None)
            continue
        cand = w
        while cand in chosen or await taken(cand):
            cand = bump_sku(cand)
        if cand != w:
            adjusted.append({"pedido": w, "gravado": cand})
        chosen.add(cand)
        out.append(cand)
    if adjusted:
        await record_error(
            message=f"SKU ja existia; ajustado automaticamente ({len(adjusted)})", level="info", source="api",
            error_type="sku_ajustado", detail={"ajustes": adjusted}, tenant_id=tenant_id,
        )
    return out
