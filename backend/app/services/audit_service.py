"""
Serviço central de audit log.
Chamado nos pontos críticos do sistema para registrar ações.
"""
import json
import logging
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


class AuditService:
    @staticmethod
    async def log(
        db: AsyncSession,
        action: str,
        *,
        tenant_id: Optional[int] = None,
        user_id: Optional[int] = None,
        user_email: Optional[str] = None,
        entity: Optional[str] = None,
        entity_id: Optional[int] = None,
        detail: Optional[Any] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        """Registra uma ação crítica. Falhas são silenciosas para não bloquear o fluxo."""
        try:
            detail_str = json.dumps(detail, default=str) if detail and not isinstance(detail, str) else detail
            entry = AuditLog(
                tenant_id=tenant_id,
                user_id=user_id,
                user_email=user_email,
                action=action,
                entity=entity,
                entity_id=entity_id,
                detail=detail_str,
                ip_address=ip_address,
            )
            db.add(entry)
            await db.flush()
        except Exception as e:
            logger.warning(f"AuditLog falhou (não crítico): {e}")
