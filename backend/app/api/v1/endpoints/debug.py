"""
Endpoint de debug para receber logs do mobile em tempo real.
Salva em arquivo DEBUG_LOG.txt na raiz do projeto.
APENAS PARA DESENVOLVIMENTO.
"""

from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json

from app.core.database import get_db
from app.models.product import Product

router = APIRouter()

# Caminho do arquivo de log (raiz do projeto)
LOG_FILE = Path(__file__).parent.parent.parent.parent.parent.parent / "DEBUG_LOG.txt"


class LogEntry(BaseModel):
    level: str = "info"  # debug, info, warn, error
    source: str = "mobile"  # mobile, backend
    category: str = ""
    message: str
    data: dict | None = None


@router.post("/log")
async def receive_log(entry: LogEntry, request: Request):
    """Recebe log do mobile e salva em arquivo."""
    timestamp = datetime.now().strftime("%H:%M:%S")

    # Formatar linha de log
    icon = {"error": "", "warn": "", "info": "", "debug": ""}.get(entry.level, "")

    log_line = f"{icon} [{timestamp}] [{entry.source}] [{entry.category}] {entry.message}"

    if entry.data:
        log_line += f"\n   Data: {json.dumps(entry.data, ensure_ascii=False)}"

    log_line += "\n"

    # Append no arquivo
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(log_line)

    # Também printa no console do backend
    print(log_line.strip())

    return {"ok": True}


@router.post("/clear")
async def clear_log():
    """Limpa o arquivo de log (nova sessão)."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write(f"═══════════════════════════════════════════════════════\n")
        f.write(f"  DEBUG LOG - Sessão iniciada: {timestamp}\n")
        f.write(f"═══════════════════════════════════════════════════════\n\n")

    return {"ok": True, "message": "Log limpo"}


@router.get("/logs")
async def get_logs():
    """Retorna conteúdo do log."""
    if not LOG_FILE.exists():
        return {"content": ""}

    with open(LOG_FILE, "r", encoding="utf-8") as f:
        return {"content": f.read()}


@router.get("/products-summary")
async def get_products_summary(db: AsyncSession = Depends(get_db)):
    """
    Lista produtos ativos com campos usados para detecção de duplicados.
    Útil para debug do AI Scanner.
    """
    stmt = select(Product).where(
        Product.is_active == True,
        Product.is_catalog == False,
    ).order_by(Product.id.desc()).limit(50)

    result = await db.execute(stmt)
    products = result.scalars().all()

    summary = []
    for p in products:
        summary.append({
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "brand": p.brand,
            "color": p.color,
            "size": p.size,
            "category_id": p.category_id,
            "barcode": p.barcode,
            "has_identity": bool(p.brand or p.color or p.size),
        })

    # Estatísticas
    total = len(summary)
    with_brand = sum(1 for p in summary if p["brand"])
    with_color = sum(1 for p in summary if p["color"])
    with_size = sum(1 for p in summary if p["size"])
    with_all = sum(1 for p in summary if p["brand"] and p["color"] and p["size"])

    return {
        "stats": {
            "total": total,
            "with_brand": with_brand,
            "with_color": with_color,
            "with_size": with_size,
            "with_all_fields": with_all,
            "detection_ready": f"{(with_all/total*100) if total > 0 else 0:.0f}%",
        },
        "products": summary,
    }
