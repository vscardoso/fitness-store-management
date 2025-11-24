"""
Configuração compartilhada para testes
"""
import pytest
import asyncio
from typing import Generator, AsyncGenerator
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import BaseModel
from app import models  # Importa todos os modelos para registrar tabelas no metadata
from app.core.database import get_db
from app.core.security import create_access_token


# URL do banco de teste
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Cria event loop para testes assíncronos"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def test_engine():
    """Cria engine de teste"""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True
    )

    # Criar tabelas
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    
    # Criar dados iniciais necessários para os testes
    from app.models.user import User
    from app.models.category import Category
    from app.core.security import get_password_hash
    
    async_session_maker_temp = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async with async_session_maker_temp() as session:
        # Criar usuário admin para testes
        admin_user = User(
            email="admin@fitness.com",
            full_name="Admin User",
            hashed_password=get_password_hash("admin123"),
            role="ADMIN",
            is_active=True
        )
        session.add(admin_user)
        
        # Criar categorias básicas para testes
        categories = [
            Category(name="Suplementos", slug="suplementos", description="Suplementos alimentares"),
            Category(name="Equipamentos", slug="equipamentos", description="Equipamentos fitness"),
            Category(name="Acessórios", slug="acessorios", description="Acessórios diversos"),
        ]
        session.add_all(categories)
        
        await session.commit()
    
    yield engine
    
    # Limpar tabelas
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture
async def async_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Cria sessão de banco de dados para testes"""
    async_session_maker = sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async with async_session_maker() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def test_client(async_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Cria cliente HTTP de teste"""
    
    async def override_get_db():
        yield async_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    
    app.dependency_overrides.clear()


@pytest.fixture
async def auth_token(test_client: AsyncClient, async_session: AsyncSession) -> str:
    """Cria token de autenticação para testes"""
    # Gerar token diretamente com o usuário admin criado no test_engine
    # O usuário já existe no banco com id=1, email=admin@fitness.com
    token = create_access_token(data={"sub": "1"})  # ID do admin criado no setUp

    return token


@pytest.fixture
async def db(async_session: AsyncSession) -> AsyncSession:
    """Alias para async_session (compatibilidade)"""
    return async_session


@pytest.fixture
async def test_user(async_session: AsyncSession):
    """Fixture para obter o usuário de teste criado no setUp"""
    from app.models.user import User
    from sqlalchemy import select

    result = await async_session.execute(
        select(User).where(User.email == "admin@fitness.com")
    )
    user = result.scalar_one_or_none()

    if not user:
        # Criar usuário se não existir
        from app.core.security import get_password_hash
        user = User(
            email="admin@fitness.com",
            full_name="Admin User",
            hashed_password=get_password_hash("admin123"),
            role="ADMIN",
            is_active=True,
            tenant_id=1,
        )
        async_session.add(user)
        await async_session.commit()
        await async_session.refresh(user)

    return user


@pytest.fixture
async def test_category(async_session: AsyncSession, test_user):
    """Fixture para obter uma categoria de teste"""
    from app.models.category import Category
    from sqlalchemy import select

    result = await async_session.execute(
        select(Category).where(Category.slug == "suplementos")
    )
    category = result.scalar_one_or_none()

    if not category:
        # Criar categoria se não existir
        category = Category(
            name="Suplementos",
            slug="suplementos",
            description="Suplementos alimentares",
            tenant_id=test_user.tenant_id,
            is_active=True,
        )
        async_session.add(category)
        await async_session.commit()
        await async_session.refresh(category)

    return category
