"""Conferir recebimento de uma entrada: é a MESMA conferência compartilhada da Conferência de estoque (mesmo serviço, mesmas
operações +1/-1/digitar/limpar, mesma revisão), só que com escopo de UMA entrada. Esta rota é fina: abre/acha a conferência da
entrada, chama o serviço e monta o que a tela precisa (linhas da nota, peças de fora e totais). Toda a equipe da loja confere
junto (vendedora para cima); zerar para todos é do gerente."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.api.v1.endpoints.stock_counts import CountOp
from app.core.database import get_db
from app.models.entry_item import EntryItem  # noqa: F401  (garante o mapeamento antes das consultas)
from app.models.stock_entry import StockEntry
from app.models.user import User
from app.services.stock_check_service import StockCheckService
from app.services.stock_count_service import StockCountError, StockCountNotFound, StockCountService
from sqlalchemy import select

router = APIRouter(prefix="/stock-entries/{entry_id}/receipt-check", tags=["Conferir recebimento"])


class ReceiptApply(BaseModel):
    ops: List[CountOp] = Field(default_factory=list, max_length=2000)
    batch_id: Optional[str] = Field(None, max_length=64, description="Identifica o lote: reenviado depois de falha de rede, não conta de novo")


def _raise(exc: StockCountError):
    if isinstance(exc, StockCountNotFound):
        raise HTTPException(status_code=404, detail=str(exc))
    raise HTTPException(status_code=400, detail=str(exc))


async def _state(db: AsyncSession, tenant_id: int, entry_id: int) -> Dict[str, Any]:
    entry = (await db.execute(
        select(StockEntry).where(StockEntry.id == entry_id, StockEntry.tenant_id == tenant_id, StockEntry.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if entry is None:
        raise StockCountNotFound("Entrada não encontrada.")
    svc = StockCountService(db)
    rows = (await StockCheckService(db).entry_report(tenant_id=tenant_id, entry_id=entry_id))["rows"]
    count = await svc.find_for_entry(tenant_id=tenant_id, entry_id=entry_id)
    items = (await svc.get(tenant_id=tenant_id, count_id=count.id))["items"] if count else []
    by_variant = {i.variant_id: i for i in items}

    lines: List[Dict[str, Any]] = []
    expected = read = missing = over = 0
    for r in rows:
        it = by_variant.get(r["variant_id"])
        qty = int(it.counted_quantity) if it else 0
        exp = int(r["system_quantity"])
        expected += exp
        read += qty
        if qty < exp:
            missing += exp - qty
        else:
            over += qty - exp
        lines.append({
            "variant_id": r["variant_id"], "product_name": r["product_name"], "label": r["label"],
            "display_code": r["display_code"], "expected": exp, "counted": qty,
            "counted_by_name": it.counted_by_name if it else None,
        })
    in_entry = {r["variant_id"] for r in rows}
    extras = [{
        "variant_id": i.variant_id, "product_name": i.product_name,
        "label": " · ".join(x for x in (i.color, i.size) if x) or "Único", "display_code": i.display_code,
        "quantity": int(i.counted_quantity), "counted_by_name": i.counted_by_name,
    } for i in items if i.variant_id not in in_entry and i.counted_quantity > 0]
    return {
        "entry": {"id": entry.id, "entry_code": entry.entry_code},
        "count_id": count.id if count else None,
        "revision": int(count.revision) if count else 0,
        "lines": lines,
        "extras": extras,
        "totals": {"expected": expected, "read": read, "missing": missing, "over": over, "extra": sum(e["quantity"] for e in extras)},
    }


@router.get("", summary="Estado da conferência de recebimento da entrada")
async def get_receipt_check(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
) -> Dict[str, Any]:
    try:
        return await _state(db, tenant_id, entry_id)
    except StockCountError as exc:
        _raise(exc)


@router.post("/apply", summary="Aplicar as bipadas deste aparelho (somam com as das outras pessoas)")
async def apply_receipt_check(
    entry_id: int,
    body: ReceiptApply,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
) -> Dict[str, Any]:
    svc = StockCountService(db)
    try:
        count = await svc.open_for_entry(tenant_id=tenant_id, user=current_user, entry_id=entry_id)
        await svc.apply(tenant_id=tenant_id, user=current_user, count_id=count.id,
                        ops=[o.model_dump() for o in body.ops], batch_id=body.batch_id)
        return await _state(db, tenant_id, entry_id)
    except StockCountError as exc:
        _raise(exc)


@router.delete("", summary="Zerar as leituras para todas as pessoas (gerente e admin)")
async def reset_receipt_check(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
) -> Dict[str, Any]:
    svc = StockCountService(db)
    try:
        await _state(db, tenant_id, entry_id)   # 404 se a entrada não é desta loja
        count = await svc.find_for_entry(tenant_id=tenant_id, entry_id=entry_id)
        if count is not None:
            await svc.discard(tenant_id=tenant_id, count_id=count.id)
        return await _state(db, tenant_id, entry_id)
    except StockCountError as exc:
        _raise(exc)
