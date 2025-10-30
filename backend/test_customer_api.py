"""Script para testar o endpoint de clientes"""
import asyncio
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.models.user import User
from app.core.security import create_access_token

DATABASE_URL = "sqlite+aiosqlite:///./fitness_store.db"
API_URL = "http://192.168.100.158:8000"

async def test_customer_endpoint():
    """Testa o endpoint de clientes simulando o que o mobile faz"""

    # 1. Buscar usuário admin no banco
    print("\n1. Buscando usuario admin no banco...")
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.email == "admin@fitness.com")
        )
        user = result.scalar_one_or_none()

        if not user:
            print("ERRO: Usuario admin nao encontrado!")
            return

        print(f"   Email: {user.email}")
        print(f"   ID: {user.id}")
        print(f"   Ativo: {user.is_active}")
        print(f"   Cargo: {user.role}")

    await engine.dispose()

    # 2. Gerar token JWT
    print("\n2. Gerando token JWT...")
    token = create_access_token(data={"sub": str(user.id)})
    print(f"   Token: {token[:50]}...")

    # 3. Testar endpoint de clientes
    print("\n3. Testando GET /api/v1/customers/...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{API_URL}/api/v1/customers/",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                timeout=10.0
            )

            print(f"   Status: {response.status_code}")

            if response.status_code == 200:
                customers = response.json()
                print(f"   Clientes encontrados: {len(customers)}")
                print("\n   SUCESSO: Endpoint funcionando!")
            elif response.status_code == 403:
                print(f"   Erro 403: {response.json()}")
                print("\n   PROBLEMA: Usuario sendo rejeitado!")
            else:
                print(f"   Resposta: {response.text}")

        except httpx.ConnectError:
            print("   ERRO: Nao foi possivel conectar ao servidor!")
            print("   Verifique se o backend esta rodando em http://192.168.100.158:8000")
        except Exception as e:
            print(f"   ERRO: {e}")

if __name__ == "__main__":
    asyncio.run(test_customer_endpoint())
