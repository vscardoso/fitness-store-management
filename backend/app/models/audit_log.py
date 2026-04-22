"""
Modelo de audit log para rastreamento de ações críticas.
"""
from datetime import datetime
from sqlalchemy import DateTime, Integer, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class AuditLog(Base):
    """Registro imutável de ações críticas no sistema."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    action: Mapped[str] = mapped_column(String(100), index=True)   # LOGIN, SALE_CREATED, etc
    entity: Mapped[str | None] = mapped_column(String(100), nullable=True)  # sale, user, stock_entry
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON ou texto livre
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )
