"""Aceite dos termos: consulta e gravação (sem commit; quem chama decide)."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.legal import LEGAL_VERSION
from app.models.legal_acceptance import LegalAcceptance


class LegalVersionMismatch(ValueError):
    """O cliente aceitou um texto que não é o atual."""


async def accepted_current(db: AsyncSession, user_id: int) -> Optional[LegalAcceptance]:
    return (await db.execute(
        select(LegalAcceptance).where(
            LegalAcceptance.user_id == user_id,
            LegalAcceptance.version == LEGAL_VERSION,
            LegalAcceptance.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none()


async def record_acceptance(
    db: AsyncSession, *, user_id: int, tenant_id: int, version: Optional[str], channel: str,
    ip: Optional[str] = None, user_agent: Optional[str] = None,
) -> LegalAcceptance:
    """Grava o aceite da versão atual. Idempotente: aceitar de novo devolve o registro existente."""
    if version != LEGAL_VERSION:
        raise LegalVersionMismatch("Os termos foram atualizados. Abra a versão atual e aceite de novo.")
    existing = await accepted_current(db, user_id)
    if existing:
        return existing
    acc = LegalAcceptance(
        tenant_id=tenant_id, user_id=user_id, version=LEGAL_VERSION, channel=channel,
        accepted_at=datetime.now(timezone.utc), ip=(ip or None) and ip[:45],
        user_agent=(user_agent or None) and user_agent[:255],
    )
    db.add(acc)
    await db.flush()
    return acc


def client_ip(headers, fallback: Optional[str]) -> Optional[str]:
    """IP real atrás do nginx (X-Real-IP), senão o da conexão."""
    return headers.get("x-real-ip") or (headers.get("x-forwarded-for") or "").split(",")[0].strip() or fallback
