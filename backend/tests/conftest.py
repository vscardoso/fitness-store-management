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
    from app.models.store import Store
    from app.models.subscription import Subscription
    from app.core.security import get_password_hash
    from datetime import datetime, timedelta
    
    async_session_maker_temp = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async with async_session_maker_temp() as session:
        # Criar store (tenant) primeiro
        store = Store(
            name="Loja Teste",
            slug="test",
            domain="test",
            is_default=True,
            is_active=True
        )
        session.add(store)
        await session.flush()  # Garante que store.id está disponível
        
        # Criar subscription para o tenant
        subscription = Subscription(
            tenant_id=store.id,
            plan="PRO",
            status="active",
            is_trial=False,
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow() + timedelta(days=365),
            max_products=999999,
            max_users=5,
            feature_advanced_reports=True,
            feature_api_access=True,
            is_active=True
        )
        session.add(subscription)
        
        # Criar usuário admin para testes
        # Usamos hash fixo para evitar problemas com bcrypt durante testes
        admin_user = User(
            email="admin@fitness.com",
            full_name="Admin User",
            hashed_password="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7qNVlQzKH2",  # Hash de "admin123"
            role="ADMIN",
            tenant_id=store.id,
            is_active=True
        )
        session.add(admin_user)
        
        # Criar categorias básicas para testes
        categories = [
            Category(name="Suplementos", slug="suplementos", description="Suplementos alimentares", tenant_id=store.id),
            Category(name="Equipamentos", slug="equipamentos", description="Equipamentos fitness", tenant_id=store.id),
            Category(name="Acessórios", slug="acessorios", description="Acessórios diversos", tenant_id=store.id),
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
async def test_client(async_session: AsyncSession, test_engine) -> AsyncGenerator[AsyncClient, None]:
    """Cria cliente HTTP de teste com banco de teste compartilhado"""
    from app.api.deps import get_current_tenant_id
    from app.core.database import async_session_maker as app_session_maker
    from app.middleware.tenant import TenantMiddleware
    
    # Override database session maker for the whole app
    # This makes middleware queries use test database
    import app.core.database as db_module
    import app.middleware.tenant as tenant_module
    
    original_session_maker = db_module.async_session_maker
    original_tenant_session_maker = tenant_module.async_session_maker
    
    # Replace with test session maker
    from sqlalchemy.orm import sessionmaker
    test_session_maker = sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    db_module.async_session_maker = test_session_maker
    tenant_module.async_session_maker = test_session_maker
    
    # Override da função get_db
    async def override_get_db():
        yield async_session
    
    # Override get_current_tenant_id
    async def override_get_current_tenant_id():
        return 1
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_tenant_id] = override_get_current_tenant_id
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    
    # Restore original session makers
    db_module.async_session_maker = original_session_maker
    tenant_module.async_session_maker = original_tenant_session_maker
    
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
