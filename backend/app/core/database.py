"""Database configuration and session management usando SQLAlchemy 2.0.

Driver de produção: psycopg3 (psycopg[binary]) com Python ssl.SSLContext.
Driver de dev/testes: aiosqlite (SQLite).

Por que Python SSLContext em vez de sslmode=require na URL?
  O sslmode=require usa libpq para o handshake SSL. Em alguns proxies gerenciados
  (Render, Railway), o handshake via libpq falha com "SSL connection has been
  closed unexpectedly". Passando ssl=SSLContext diretamente ao psycopg3, o
  handshake usa a implementação Python/ssl que é mais compatível.
"""

import asyncio
import logging
import os
import ssl
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

    # URL sem query params (sslmode etc. — gerenciado via connect_args abaixo)
    _base = database_url.split("?")[0]
    ASYNC_DATABASE_URL = _base.replace("postgresql://", "postgresql+psycopg://", 1)

    if _ssl_env == "disable":
        engine = create_async_engine(
            ASYNC_DATABASE_URL,
            echo=settings.DEBUG,
            poolclass=NullPool,
        )
        logger.info("PostgreSQL driver: psycopg3, SSL: DISABLED")
    else:
        # Python ssl.SSLContext — mais compatível com proxies gerenciados
        # (Render, Railway, Heroku) do que sslmode=require via libpq.
        _ssl_ctx = ssl.create_default_context()
        _ssl_ctx.check_hostname = False
        _ssl_ctx.verify_mode = ssl.CERT_NONE

        engine = create_async_engine(
            ASYNC_DATABASE_URL,
            echo=settings.DEBUG,
            poolclass=NullPool,
            connect_args={"ssl": _ssl_ctx},
        )
        logger.info("PostgreSQL driver: psycopg3, SSL: Python SSLContext (CERT_NONE)")

elif _is_sqlite and settings.ENVIRONMENT == "test":
    ASYNC_DATABASE_URL = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=settings.DEBUG,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

else:
    # SQLite dev local
    ASYNC_DATABASE_URL = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=settings.DEBUG,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=300,
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


async def init_db() -> None:
    """Verifica conectividade com o banco (com retry).

    SQLite dev  → cria tabelas automaticamente via create_all.
    PostgreSQL  → apenas verifica conexão (schema gerenciado pelo Alembic).
    """
    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.connect() as conn:
                if _is_sqlite:
                    # Dev local: cria tabelas automaticamente
                    await conn.run_sync(BaseModel.metadata.create_all)
                    await conn.commit()
                else:
                    # Produção: apenas verifica conectividade.
                    # O schema é gerenciado pelo Alembic (entrypoint.sh).
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
