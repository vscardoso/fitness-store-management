"""
Inicialização inteligente do banco:
- Banco novo (sem alembic_version): create_all + stamp head
- Banco existente: alembic upgrade head (só migrations novas)
"""
import asyncio
import os
import subprocess
import sys


def get_asyncpg_url() -> str:
    db = os.getenv("DATABASE_URL", "")
    if db.startswith("postgres://"):
        db = db.replace("postgres://", "postgresql://", 1)
    for d in ("+asyncpg", "+psycopg", "+psycopg2"):
        if f"postgresql{d}://" in db:
            db = db.replace(f"postgresql{d}://", "postgresql://", 1)
            break
    base = db.split("?")[0]
    return base.replace("postgresql://", "postgresql+asyncpg://", 1)


async def is_fresh_db(url: str) -> bool:
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='alembic_version')"
            ))
            return not result.scalar()
    except Exception as e:
        print(f"[db_init] Erro ao verificar schema: {e}")
        return True
    finally:
        await engine.dispose()


async def create_all(url: str) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine
    import app.models  # noqa: registra todos os modelos no metadata
    from app.models.base import BaseModel
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    await engine.dispose()


def main():
    url = get_asyncpg_url()
    fresh = asyncio.run(is_fresh_db(url))

    if fresh:
        print("[db_init] Banco novo — criando schema completo via create_all...")
        asyncio.run(create_all(url))
        print("[db_init] Marcando alembic como head (sem rodar migrations)...")
        subprocess.run(["alembic", "stamp", "head"], check=True)
        print("[db_init] Schema pronto!")
    else:
        print("[db_init] Banco existente — aplicando migrations pendentes...")
        subprocess.run(["alembic", "upgrade", "head"], check=True)
        print("[db_init] Migrations aplicadas!")


if __name__ == "__main__":
    main()
