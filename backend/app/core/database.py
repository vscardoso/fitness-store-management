"""Database configuration and session management using SQLAlchemy 2.0."""

import asyncio
import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.base import BaseModel


# Get database URL from environment or settings
database_url = os.getenv("DATABASE_URL", settings.DATABASE_URL)

# Render/Heroku às vezes fornecem "postgres://" (sem "ql") — normaliza primeiro
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

# SSL para PostgreSQL:
# - Render INTERNO (hostname sem ".render.com"): NÃO precisa de SSL — rede privada
#   Forçar ssl='require' causa ConnectionDoesNotExistError no startup
# - Render EXTERNO (.oregon-postgres.render.com): já vem com ?sslmode=require na URL
#   asyncpg lê o sslmode da URL automaticamente — não precisa de connect_args
# - Outros provedores externos (Heroku, Supabase, etc.): verifica sslmode na URL
# Regra: só adicionar ssl='require' se a URL não tiver sslmode E for claramente externa
_is_postgres = ASYNC_DATABASE_URL.startswith("postgresql")
_has_sslmode_in_url = "sslmode=" in database_url
_is_external_host = any(
    h in database_url
    for h in [".render.com", "amazonaws.com", "supabase", "neon.tech", "planetscale"]
)

if _is_postgres and settings.ENVIRONMENT != "test":
    if _has_sslmode_in_url:
        # sslmode já está na URL → asyncpg lê direto, não precisa de connect_args
        _connect_args: dict = {}
    elif _is_external_host:
        # Host externo sem sslmode → forçar SSL
        _connect_args = {"ssl": "require"}
    else:
        # Host interno (Render interno, localhost) → sem SSL
        _connect_args = {}
else:
    _connect_args = {}

# Pool reduzido para produção (Render free tier limite: ~97 conexões)
# pool_size alto + múltiplos workers = conexões esgotadas rapidamente
_pool_size = settings.DATABASE_POOL_SIZE if not _is_postgres else min(settings.DATABASE_POOL_SIZE, 5)
_max_overflow = settings.DATABASE_MAX_OVERFLOW if not _is_postgres else min(settings.DATABASE_MAX_OVERFLOW, 5)

# Create async engine
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_pre_ping=True,
    pool_recycle=300,   # recicla conexões a cada 5 min (evita conexões obsoletas)
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
    import logging
    logger = logging.getLogger(__name__)
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
