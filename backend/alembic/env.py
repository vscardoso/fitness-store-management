"""Alembic env.py — usa psycopg2 SÍNCRONO para migrations.

Por que psycopg2 e não asyncpg/psycopg3?
  - Alembic foi projetado para engines síncronos.
  - asyncpg/psycopg3 com asyncio.run() + greenlet bridge cria falhas SSL no Render.
  - psycopg2 síncrono conecta diretamente via libpq sem asyncio — simples e confiável.
  - psycopg2-binary já está em requirements.txt.
"""

import logging
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool as sa_pool

# Alembic Config object
config = context.config

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")

# Metadata para autogenerate
from app.models.base import BaseModel
target_metadata = BaseModel.metadata


# ── Normalização da URL ────────────────────────────────────────────────
def _get_sync_url() -> str:
    """Retorna URL síncrona com psycopg2 para uso no Alembic."""
    db_url = os.getenv("DATABASE_URL", "")

    if not db_url:
        from app.core.config import settings
        db_url = settings.DATABASE_URL

    # Normaliza prefixo
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    # Remove variante de driver async
    for driver in ("+asyncpg", "+psycopg", "+psycopg2"):
        if f"postgresql{driver}://" in db_url:
            db_url = db_url.replace(f"postgresql{driver}://", "postgresql://", 1)
            break

    if db_url.startswith("postgresql"):
        base = db_url.split("?")[0]
        ssl_env = os.getenv("DATABASE_SSL", "").lower().strip()
        if ssl_env == "disable":
            return base.replace("postgresql://", "postgresql+psycopg2://", 1)
        else:
            return base.replace("postgresql://", "postgresql+psycopg2://", 1) + "?sslmode=require"

    # SQLite (dev/test) — remove driver async aiosqlite
    if db_url.startswith("sqlite+aiosqlite://"):
        return db_url.replace("sqlite+aiosqlite://", "sqlite://", 1)
    return db_url


def run_migrations_offline() -> None:
    """Modo offline: gera SQL sem conectar ao banco."""
    url = _get_sync_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Modo online: conecta via psycopg2 síncrono e aplica migrations."""
    url = _get_sync_url()
    logger.info("Alembic conectando com: %s", url.split("@")[0].rsplit(":", 1)[0] + ":***@" + url.split("@")[1] if "@" in url else url)

    connectable = create_engine(url, poolclass=sa_pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
