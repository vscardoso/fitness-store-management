"""Monta o livro do estoque (entry_item_events) dos lotes que já existiam. Sem --apply só simula.

Uso (no VPS):  docker exec -w /app -e PYTHONPATH=/app provador-backend python scripts/ledger_backfill.py --loja 2 [--apply]
"""
import argparse
import asyncio

from app.core.database import async_session_maker
from app.services.stock_ledger import reconcile
from app.services.stock_ledger_backfill import backfill


async def main(loja: int, apply: bool) -> None:
    async with async_session_maker() as db:
        r = await backfill(db, loja, apply=apply)
        print("backfill:", r)
        rec = await reconcile(db, loja)
        print("conta:", {"lotes": rec["checked"], "sem_historico": len(rec["no_history"]), "sem_registro_na_corrente": len(rec["untracked"]),
                          "por_motivo": {k: v["pieces"] for k, v in rec["by_reason"].items()}})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--loja", type=int, required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    asyncio.run(main(a.loja, a.apply))
