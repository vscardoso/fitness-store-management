"""Script para reativar usuário desativado"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update
from app.models.user import User

DATABASE_URL = "sqlite+aiosqlite:///./fitness_store.db"

async def reactivate_user():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Buscar usuário admin
        result = await session.execute(
            select(User).where(User.email == "admin@fitness.com")
        )
        user = result.scalar_one_or_none()

        if not user:
            print("ERRO: Usuario admin@fitness.com nao encontrado!")
            print("   Execute: python create_user.py")
            return

        if user.is_active:
            print("OK: Usuario ja esta ativo!")
            print(f"   Email: {user.email}")
            print(f"   Nome: {user.full_name}")
            print(f"   Cargo: {user.role}")
            print(f"   Status: Ativo")
        else:
            # Reativar usuário
            user.is_active = True
            await session.commit()
            print("SUCESSO: Usuario reativado com sucesso!")
            print(f"   Email: {user.email}")
            print(f"   Nome: {user.full_name}")
            print(f"   Cargo: {user.role}")
            print(f"   Status: Ativo")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(reactivate_user())
