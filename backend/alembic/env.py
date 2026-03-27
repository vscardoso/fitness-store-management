from logging.config import fileConfig
from alembic import context
import asyncio

# Alembic Config object
config = context.config

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Reutiliza o engine já configurado em database.py (SSL, driver, pool).
# Isso garante que as migrations usem exatamente a mesma conexão que a app.
from app.core.database import engine, _is_postgres
from app.models.base import BaseModel

target_metadata = BaseModel.metadata


def run_migrations_offline() -> None:
    """Modo offline: gera SQL sem conectar ao banco."""
    from app.core.database import ASYNC_DATABASE_URL
    context.configure(
        url=ASYNC_DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Modo online: conecta ao banco e aplica migrations."""
    async with engine.begin() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
