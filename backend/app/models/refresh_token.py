"""Modelo de Refresh Token para gerenciamento de sessões."""
import hashlib
import secrets
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RefreshToken(Base):
    """
    Refresh tokens rastreados no banco para controle de sessão.

    Regras de validade:
    - max 24h desde created_at (sessão absoluta)
    - max 1h desde last_used_at (inatividade)
    - revoked=True → inválido imediatamente (logout explícito)
    - Token rotation: a cada refresh, o token atual é revogado e um novo é emitido
    """
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)  # created_at + 24h
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_refresh_tokens_user_id", "user_id"),
        Index("ix_refresh_tokens_last_used_at", "last_used_at"),
    )

    # ── Helpers estáticos ─────────────────────────────────────────────────────

    @staticmethod
    def generate_raw_token() -> str:
        """Gera token opaco seguro (não armazenado — apenas o hash vai ao banco)."""
        return secrets.token_urlsafe(48)

    @staticmethod
    def hash_token(raw_token: str) -> str:
        """SHA-256 do token raw. Nunca armazenar o token em texto puro."""
        return hashlib.sha256(raw_token.encode()).hexdigest()
