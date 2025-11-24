"""Script para listar todos os usuários usando a DATABASE_URL real (.env).

Evita confusão entre SQLite residual e PostgreSQL atual.
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.models.user import User


def _build_async_url(db_url: str) -> str:
    if db_url.startswith("postgresql://"):
        return db_url.replace("postgresql://", "postgresql+asyncpg://")
    if db_url.startswith("sqlite:///"):
        return db_url.replace("sqlite:///", "sqlite+aiosqlite:///")
    return db_url


ASYNC_DATABASE_URL = _build_async_url(settings.DATABASE_URL)


async def list_users():
    engine = create_async_engine(ASYNC_DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            result = await session.execute(select(User))
            users = result.scalars().all()
        except Exception as e:
            print(f"❌ Erro ao consultar usuários: {e}")
            await engine.dispose()
            return

        if not users:
            print("❌ Nenhum usuário encontrado no banco de dados")
        else:
            print(f"✅ Encontrados {len(users)} usuário(s):\n")
            for user in users:
                print(f"ID: {user.id}")
                print(f"Email: {user.email}")
                print(f"Nome: {user.full_name}")
                print(f"Cargo: {user.role}")
                print(f"Ativo: {user.is_active}")
                print(f"Tenant ID: {getattr(user, 'tenant_id', None)}")
                print("-" * 50)

    await engine.dispose()


if __name__ == "__main__":
    print(f"🔌 Usando DATABASE_URL={settings.DATABASE_URL}")
    asyncio.run(list_users())
