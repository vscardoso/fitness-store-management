"""Database configuration and session management using SQLAlchemy 2.0."""

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

# Convert database URL based on type
if database_url.startswith("postgresql://"):
    ASYNC_DATABASE_URL = database_url.replace("postgresql://", "postgresql+asyncpg://")
elif database_url.startswith("postgresql+asyncpg://"):
    ASYNC_DATABASE_URL = database_url
elif database_url.startswith("sqlite:///"):
    ASYNC_DATABASE_URL = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
else:
    ASYNC_DATABASE_URL = database_url

# SSL para PostgreSQL externo (Render, Heroku, etc.)
# Usa ssl='require' via connect_args — mais confiável com asyncpg do que
# um SSLContext customizado (evita ConnectionDoesNotExistError no startup).
_is_postgres = ASYNC_DATABASE_URL.startswith("postgresql")
if _is_postgres and settings.ENVIRONMENT != "test":
    _connect_args: dict = {"ssl": "require"}
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
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)


async def close_db() -> None:
    """Close database connections."""
    await engine.dispose()
