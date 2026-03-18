"""Database configuration and session management using SQLAlchemy 2.0."""

import asyncio
import logging
import os
import ssl as ssl_module
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.base import BaseModel

logger = logging.getLogger(__name__)

# Get database URL from environment or settings
database_url = os.getenv("DATABASE_URL", settings.DATABASE_URL)

# Render/Heroku às vezes fornecem "postgres://" (sem "ql") — normaliza
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

# Convert database URL to async driver
if database_url.startswith("postgresql://"):
    ASYNC_DATABASE_URL = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif database_url.startswith("postgresql+asyncpg://"):
    ASYNC_DATABASE_URL = database_url
elif database_url.startswith("sqlite:///"):
    ASYNC_DATABASE_URL = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
else:
    ASYNC_DATABASE_URL = database_url

# ── SSL para PostgreSQL ──────────────────────────────────────────────
# asyncpg NÃO aceita ssl='require' de forma confiável; a documentação do
# Render (e do asyncpg) recomenda passar um ssl.SSLContext explícito.
#
# Estratégia:
#   • Detecta se está rodando no Render (env RENDER=true, injetada automaticamente)
#   • Ou se a URL tem host externo conhecido
#   → Em ambos os casos: usa SSLContext com verificação de certificado desativada
#     (Render usa certificados internos que não passam em verify padrão)
#   • Localhost / SQLite / testes: sem SSL
# ─────────────────────────────────────────────────────────────────────
_is_postgres = ASYNC_DATABASE_URL.startswith("postgresql")
_on_render = bool(os.getenv("RENDER"))  # Render injeta RENDER=true em todo serviço
_is_external_host = any(
    h in database_url
    for h in [".render.com", "amazonaws.com", "supabase", "neon.tech", "planetscale"]
)

_connect_args: dict = {}

if _is_postgres and settings.ENVIRONMENT != "test":
    if _on_render or _is_external_host:
        # SSLContext permissivo — Render/provedores cloud
        _ssl_ctx = ssl_module.create_default_context()
        _ssl_ctx.check_hostname = False
        _ssl_ctx.verify_mode = ssl_module.CERT_NONE
        _connect_args = {"ssl": _ssl_ctx}
        logger.info("PostgreSQL SSL: SSLContext(CERT_NONE) — Render/cloud detectado")
    else:
        logger.info("PostgreSQL SSL: desativado (localhost/dev)")

# Pool reduzido para produção (Render free tier limite: ~97 conexões)
_pool_size = settings.DATABASE_POOL_SIZE if not _is_postgres else min(settings.DATABASE_POOL_SIZE, 5)
_max_overflow = settings.DATABASE_MAX_OVERFLOW if not _is_postgres else min(settings.DATABASE_MAX_OVERFLOW, 5)

# Create async engine
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_timeout=30,
    connect_args=_connect_args,
    poolclass=NullPool if settings.ENVIRONMENT == "test" else None,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting async database session.
    
    Yields:
        AsyncSession: Database session
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database tables (com retry para DBs lentos no startup)."""
    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(BaseModel.metadata.create_all)
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
    """Close database connections."""
    await engine.dispose()
