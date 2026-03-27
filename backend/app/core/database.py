"""Database configuration and session management using SQLAlchemy 2.0."""

import asyncio
import logging
import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.pool import NullPool, StaticPool

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

_is_postgres = ASYNC_DATABASE_URL.startswith("postgresql")
_is_sqlite = ASYNC_DATABASE_URL.startswith("sqlite")

# Log da URL sanitizada para diagnóstico
_safe_url = database_url
if "@" in _safe_url:
    _safe_url = _safe_url.split("@")[0].rsplit(":", 1)[0] + ":***@" + _safe_url.split("@")[1]
logger.info("Database URL: %s", _safe_url)

# ── Configuração de conexão ──────────────────────────────────────────
# PostgreSQL: usa NullPool (sem warmup no startup) + ssl=True via asyncpg.
#   NullPool cria conexões sob demanda — elimina falhas de SSL no startup
#   do Render. ssl=True deixa o asyncpg gerenciar o SSL internamente,
#   que é mais compatível do que passar um SSLContext manualmente.
#
# SQLite: StaticPool para testes, pool padrão para dev local.
#
# Para desativar SSL explicitamente: DATABASE_SSL=disable
# ─────────────────────────────────────────────────────────────────────

if _is_postgres:
    _ssl_env = os.getenv("DATABASE_SSL", "").lower().strip()
    if _ssl_env == "disable":
        _connect_args: dict = {"ssl": False}
        logger.info("PostgreSQL SSL: DISABLED (DATABASE_SSL=disable)")
    else:
        _connect_args = {"ssl": True}
        logger.info("PostgreSQL SSL: ENABLED (asyncpg internal SSL)")

    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=settings.DEBUG,
        poolclass=NullPool,
        connect_args=_connect_args,
    )

elif _is_sqlite and settings.ENVIRONMENT == "test":
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=settings.DEBUG,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

else:
    # SQLite local dev
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=settings.DEBUG,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=300,
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
    """Dependency for getting async database session."""
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
    """Close database connections."""
    await engine.dispose()
