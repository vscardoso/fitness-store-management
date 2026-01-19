"""Script para criar usuário de teste"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.security import get_password_hash
from app.models.user import User
from app.core.config import settings

async def create_test_user():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Verificar se já existe usuário admin
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.email == "admin@fitness.com"))
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print("✅ Usuário admin já existe!")
            print(f"   Email: admin@fitness.com")
            print(f"   Senha: admin123")
            print(f"   Nome: {existing_user.full_name}")
            print(f"   Cargo: {existing_user.role}")
        else:
            # Criar novo usuário admin
            user = User(
                email="admin@fitness.com",
                hashed_password=get_password_hash("admin123"),
                full_name="Administrador",
                role="admin",
                is_active=True
            )
            session.add(user)
            await session.commit()
            print("✅ Usuário admin criado com sucesso!")
            print(f"   Email: admin@fitness.com")
            print(f"   Senha: admin123")
            print(f"   Nome: Administrador")
            print(f"   Cargo: admin")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(create_test_user())
