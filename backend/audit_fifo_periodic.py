"""Auditoria periódica FIFO e inventário.

Executa verificações por tenant:
- Quantidades inválidas em entry_items
- Divergência sale_items.quantity vs sale_sources.sources.quantity_taken
- Divergência soma FIFO (quantity_remaining) vs inventory.quantity
- Reconciliação de custos (recebido, restante, vendido, diferença)

Uso (PowerShell):

    cd backend
    python audit_fifo_periodic.py --db sqlite:///fitness_store.db --log-level INFO

Pode ser agendado (ex: Windows Task Scheduler ou cron em ambiente Linux/Docker).
"""
from __future__ import annotations
import argparse
import asyncio
import logging
from pathlib import Path
from typing import Any, Dict, List
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_engine, get_async_session  # assume engine configurado em .env
from app.models.store import Store
from app.models.product import Product
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.sale import SaleItem, Sale
from app.services.inventory_service import InventoryService

LOG_DIR = Path(__file__).parent / "logs"
LOG_FILE = LOG_DIR / "fifo_audit.log"
LOG_DIR.mkdir(exist_ok=True)

logger = logging.getLogger("fifo_audit")
handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)


async def audit_tenant(session: AsyncSession, tenant_id: int) -> Dict[str, Any]:
    """Realiza auditoria de um tenant e retorna métricas e listas de discrepâncias."""
    logger.info(f"Iniciando auditoria tenant={tenant_id}")
    inventory_service = InventoryService(session)

    # 1. Quantidades inválidas em entry_items
    invalid_items: List[Dict[str, Any]] = []
    stmt_items = select(EntryItem.id, EntryItem.product_id, EntryItem.quantity_received, EntryItem.quantity_remaining).where(
        EntryItem.tenant_id == tenant_id, EntryItem.is_active == True
    )
    rows = (await session.execute(stmt_items)).all()
    for iid, pid, qrec, qrem in rows:
        if qrem < 0 or qrem > qrec:
            invalid_items.append({"entry_item_id": iid, "product_id": pid, "received": qrec, "remaining": qrem})

    # 2. Divergência sale_items.quantity vs soma fontes FIFO
    sale_mismatches: List[Dict[str, Any]] = []
    stmt_sales = select(SaleItem.id, SaleItem.sale_id, SaleItem.quantity, SaleItem.sale_sources).join(Sale, SaleItem.sale_id == Sale.id).where(
        Sale.tenant_id == tenant_id, SaleItem.is_active == True, Sale.is_active == True
    )
    srows = (await session.execute(stmt_sales)).all()
    for sid, sale_id, qty, sources in srows:
        if not sources or "sources" not in sources:
            sale_mismatches.append({"sale_item_id": sid, "sale_id": sale_id, "error": "SEM_FONTES"})
            continue
        taken = sum(int(src.get("quantity_taken", 0)) for src in sources.get("sources", []))
        if taken != qty:
            sale_mismatches.append({"sale_item_id": sid, "sale_id": sale_id, "expected": qty, "taken_sum": taken})

    # 3. Divergência FIFO vs inventory
    fifo_vs_inventory: List[Dict[str, Any]] = []
    stmt_products = select(Product.id).where(
        Product.tenant_id == tenant_id, Product.is_active == True, Product.is_catalog == False
    )
    prod_ids = [r[0] for r in (await session.execute(stmt_products)).all()]
    for pid in prod_ids:
        fifo_sum_stmt = select(func.coalesce(func.sum(EntryItem.quantity_remaining), 0)).where(
            EntryItem.product_id == pid, EntryItem.tenant_id == tenant_id, EntryItem.is_active == True
        )
        fifo_sum = int((await session.execute(fifo_sum_stmt)).scalar_one() or 0)
        inv_stmt = select(Inventory.quantity).where(Inventory.product_id == pid, Inventory.tenant_id == tenant_id)
        inv_row = (await session.execute(inv_stmt)).scalar_one_or_none()
        inv_qty = int(inv_row or 0)
        if fifo_sum != inv_qty:
            fifo_vs_inventory.append({"product_id": pid, "fifo_sum": fifo_sum, "inventory": inv_qty})

    # 4. Reconciliação de custos (usando serviço existente)
    cost_summary = await inventory_service.reconcile_costs(tenant_id=tenant_id)

    # 5. Ações corretivas automáticas: opcional (aqui apenas rebuild se divergências > 0)
    rebuild_deltas = []
    if fifo_vs_inventory:
        logger.info(f"Divergências detectadas em {len(fifo_vs_inventory)} produtos - iniciando rebuild.")
        rebuild_deltas = await inventory_service.rebuild_all_from_fifo(tenant_id=tenant_id)
    else:
        logger.info("Inventário já alinhado - nenhum rebuild necessário.")

    summary = {
        "tenant_id": tenant_id,
        "invalid_entry_items": invalid_items,
        "sale_source_mismatches": sale_mismatches,
        "inventory_divergences": fifo_vs_inventory,
        "cost_reconciliation": cost_summary,
        "rebuild_deltas": rebuild_deltas,
        "timestamp": datetime.utcnow().isoformat(),
    }

    # Logging humano
    logger.info(f"Resumo tenant={tenant_id}: invalid_items={len(invalid_items)} sale_mismatches={len(sale_mismatches)} divergences={len(fifo_vs_inventory)} diff_custo={cost_summary['diferenca']}")
    return summary


async def audit_all_tenants(session: AsyncSession) -> List[Dict[str, Any]]:
    """Audita todos os tenants (stores) ativos."""
    stmt_stores = select(Store.id).where(Store.is_active == True)
    tenant_ids = [r[0] for r in (await session.execute(stmt_stores)).all()]
    results: List[Dict[str, Any]] = []
    for tid in tenant_ids:
        summary = await audit_tenant(session, tid)
        results.append(summary)
    return results


async def main() -> None:
    parser = argparse.ArgumentParser(description="Auditoria periódica FIFO")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"], help="Nível de log")
    args = parser.parse_args()
    logger.setLevel(getattr(logging, args.log_level))

    async with get_async_session() as session:  # type: ignore
        summaries = await audit_all_tenants(session)
    # Resumo final no console
    print("=== AUDITORIA FIFO (TENANTS) ===")
    for s in summaries:
        print(f"Tenant {s['tenant_id']}: divergências={len(s['inventory_divergences'])} invalid_items={len(s['invalid_entry_items'])} sale_mismatches={len(s['sale_source_mismatches'])} diff_custo={s['cost_reconciliation']['diferenca']}")
    print(f"Log detalhado: {LOG_FILE}")

if __name__ == "__main__":
    asyncio.run(main())
