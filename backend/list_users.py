"""Script para listar todos os usuários"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.models.user import User

DATABASE_URL = "sqlite+aiosqlite:///./fitness_store.db"

async def list_users():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        
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
                print("-" * 50)
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(list_users())
