"""Database configuration and session management usando SQLAlchemy 2.0.

Driver de produção: asyncpg com Python ssl.SSLContext.
  - asyncpg aceita connect_args={"ssl": ssl.SSLContext} diretamente
  - Usa implementação Python/ssl (não libpq), compatível com proxies do Render
  - psycopg3/psycopg2 usam libpq para SSL — incompatível com o proxy do Render

Driver de dev/testes: aiosqlite (SQLite).

Alembic (migrations): usa psycopg2 síncrono — veja alembic/env.py.
  Startup: alembic upgrade head é executado automaticamente (não-test).
  Fallback: create_all garante tabelas novas ainda sem migration.
"""

import asyncio
import logging
import os
import ssl
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.pool import NullPool, StaticPool

from app.core.config import settings
from app.models.base import BaseModel

# Importar todos os modelos para garantir que estejam no metadata do create_all
import app.models.refresh_token  # noqa: F401 — estende Base diretamente
import app.models.audit_log       # noqa: F401 — estende Base diretamente

logger = logging.getLogger(__name__)

# ── Normalização da DATABASE_URL ─────────────────────────────────────
database_url = os.getenv("DATABASE_URL", settings.DATABASE_URL)

# Render/Heroku fornecem "postgres://" — normaliza para "postgresql://"
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

# Remove variantes de driver para ficar com a URL canônica "postgresql://"
for _driver in ("+asyncpg", "+psycopg2", "+psycopg"):
    if f"postgresql{_driver}://" in database_url:
        database_url = database_url.replace(f"postgresql{_driver}://", "postgresql://", 1)
        break

_is_postgres = database_url.startswith("postgresql")
_is_sqlite = database_url.startswith("sqlite")

# Log sanitizado (oculta senha)
_safe = database_url
if "@" in _safe:
    _safe = _safe.split("@")[0].rsplit(":", 1)[0] + ":***@" + _safe.split("@")[1]
logger.info("Database URL normalizada: %s", _safe)

# ── Construção do engine ───────────────────────────────────────────────
if _is_postgres:
    _ssl_env = os.getenv("DATABASE_SSL", "").lower().strip()

    # URL sem query params (SSL gerenciado via connect_args)
    _base = database_url.split("?")[0]
    ASYNC_DATABASE_URL = _base.replace("postgresql://", "postgresql+asyncpg://", 1)

    if _ssl_env == "disable":
        engine = create_async_engine(
            ASYNC_DATABASE_URL,
            echo=settings.DEBUG,
            poolclass=NullPool,
        )
        logger.info("PostgreSQL driver: asyncpg, SSL: DISABLED")
    else:
        # Python ssl.SSLContext — asyncpg usa ssl nativo Python (não libpq).
        # Isso é necessário porque sslmode=require via libpq falha com o proxy
        # do Render ("SSL connection has been closed unexpectedly").
        _ssl_ctx = ssl.create_default_context()
        _ssl_ctx.check_hostname = False
        _ssl_ctx.verify_mode = ssl.CERT_NONE

        engine = create_async_engine(
            ASYNC_DATABASE_URL,
            echo=settings.DEBUG,
            poolclass=NullPool,
            connect_args={"ssl": _ssl_ctx},
        )
        logger.info("PostgreSQL driver: asyncpg, SSL: Python SSLContext (CERT_NONE)")

elif _is_sqlite and settings.ENVIRONMENT == "test":
    ASYNC_DATABASE_URL = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=False,  # SQLite test: sem spam de PRAGMA no output
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

else:
    # SQLite dev local
    # Evita duplo "+aiosqlite" caso DATABASE_URL já inclua o driver
    if "+aiosqlite" not in database_url:
        ASYNC_DATABASE_URL = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
    else:
        ASYNC_DATABASE_URL = database_url
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=False,  # SQLite dev: sem spam de PRAGMA no output
        connect_args={"check_same_thread": False},
    )

# ── Session factory ───────────────────────────────────────────────────
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency para obter sessão async do banco."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def _run_alembic_upgrade() -> None:
    """Executa 'alembic upgrade head' sincronamente (chamado via asyncio.to_thread).

    Aplica todas as migrations pendentes na cadeia, incluindo retroativas.
    Roda em thread para não bloquear o event loop.
    """
    import logging as _logging
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_command

    # Silenciar logs verbosos do alembic durante startup
    _logging.getLogger("alembic.runtime.migration").setLevel(_logging.WARNING)
    _logging.getLogger("alembic.env").setLevel(_logging.WARNING)

    # backend/alembic.ini — 3 dirs acima de backend/app/core/database.py
    alembic_ini = Path(__file__).parent.parent.parent / "alembic.ini"
    if not alembic_ini.exists():
        logger.warning("alembic.ini não encontrado em %s — pulando auto-migrate", alembic_ini)
        return

    cfg = AlembicConfig(str(alembic_ini))
    alembic_command.upgrade(cfg, "head")
    logger.info("Alembic: migrations aplicadas com sucesso")


async def init_db() -> None:
    """Aplica migrations e verifica conectividade com o banco.

    Estratégia:
      1. alembic upgrade head  — aplica migrations pendentes (não-test)
      2. create_all (checkfirst) — cria tabelas de modelos novos sem migration
      3. Falha com retry        — aguarda banco ficar disponível (PostgreSQL)
    """
    # ── Passo 1: executar migrations alembic (dev + prod, nunca em tests) ──
    if settings.ENVIRONMENT != "test":
        try:
            await asyncio.to_thread(_run_alembic_upgrade)
        except Exception as exc:
            # Não mata o servidor; create_all abaixo serve de fallback
            logger.warning("Alembic upgrade head falhou: %s — continuando com create_all", exc)

    # ── Passo 2: create_all como rede de segurança + verificar conectividade ──
    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.connect() as conn:
                if _is_sqlite:
                    # Cria tabelas que ainda não existem (novos modelos sem migration)
                    await conn.run_sync(BaseModel.metadata.create_all)
                    await conn.commit()
                else:
                    await conn.execute(text("SELECT 1"))

            logger.info("Database initialized successfully")
            return

        except Exception as exc:
            if attempt == max_retries:
                raise
            wait = attempt * 3
            logger.warning(
                "DB init tentativa %d/%d falhou: %s. Tentando novamente em %ds...",
                attempt, max_retries, exc, wait,
            )
            await asyncio.sleep(wait)


async def close_db() -> None:
    """Fecha conexões do banco."""
    await engine.dispose()
