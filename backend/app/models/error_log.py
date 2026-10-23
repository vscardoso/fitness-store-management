"""
Registro de erros do sistema (API e app), para diagnóstico.

Cada erro relevante vira uma linha aqui: o que aconteceu, em qual rota, para qual usuário e loja, com o
rastro técnico. Nunca guarda senha, token ou chave (ver app/services/error_log_service.py, que limpa isso).
Consulta: no VPS, `psql -c "select ... from error_logs order by id desc limit 30"` (ver CLAUDE.md).
"""
from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class ErrorLog(BaseModel):
    __tablename__ = "error_logs"

    level: Mapped[str] = mapped_column(String(10), nullable=False, default="error", comment="error | warning | info")
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="api", comment="api | app")
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    error_type: Mapped[str | None] = mapped_column(String(120), nullable=True, comment="classe da exceção ou tipo do evento")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True, comment="rastro técnico e contexto, já sem segredos")
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    app_version: Mapped[str | None] = mapped_column(String(40), nullable=True)

    __table_args__ = (
        Index("ix_error_logs_created_at", "created_at"),
    )
