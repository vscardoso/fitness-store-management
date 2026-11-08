"""Bloqueio simples de loja suspensa (decisão do dono, 08/11/2026).

Loja marcada inativa (`stores.is_active = false`, pelo painel admin) não entra e não usa a API: login e toda chamada autenticada
respondem 403 "Conta suspensa. Fale com o suporte.". É só isto: não olha assinatura, vencimento nem teste grátis (isso fica para
quando a cobrança estiver ligada).

A loja 2 (W.A, o piloto) NUNCA é bloqueada, mesmo marcada inativa por engano. Outras lojas protegidas: variável de ambiente
`NEVER_SUSPEND_STORE_IDS` (ids separados por vírgula), somada à lista fixa.
"""
import os
import time
from typing import Dict, Set, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.store import Store

PILOT_STORE_IDS: Set[int] = {2}          # W.A Fitness: loja real do dono, nunca bloqueada
SUSPENDED_MESSAGE = "Conta suspensa. Fale com o suporte."
_TTL_SECONDS = 30
_cache: Dict[int, Tuple[bool, float]] = {}   # tenant_id -> (ativa?, quando foi lida)


def protected_store_ids() -> Set[int]:
    extra = {int(x) for x in os.environ.get("NEVER_SUSPEND_STORE_IDS", "").replace(" ", "").split(",") if x.isdigit()}
    return PILOT_STORE_IDS | extra


def clear_cache() -> None:
    _cache.clear()


async def store_is_blocked(db: AsyncSession, tenant_id) -> bool:
    """True só se a loja existe, está marcada inativa e não é protegida. Leitura guardada por 30 s para não pesar em toda chamada."""
    if tenant_id is None or int(tenant_id) in protected_store_ids():
        return False
    tid = int(tenant_id)
    now = time.monotonic()
    hit = _cache.get(tid)
    if hit and now - hit[1] < _TTL_SECONDS:
        return not hit[0]
    active = (await db.execute(select(Store.is_active).where(Store.id == tid))).scalar_one_or_none()
    active = True if active is None else bool(active)     # loja não encontrada: não é caso de suspensão
    _cache[tid] = (active, now)
    return not active


async def ensure_store_not_suspended(db: AsyncSession, tenant_id) -> None:
    if await store_is_blocked(db, tenant_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SUSPENDED_MESSAGE)
