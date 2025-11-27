"""Script para criar usuário admin (Windows-friendly)"""
import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.core.security import get_password_hash
from app.models.user import User
from app.models.store import Store


async def create_admin():
    """Cria store e admin."""
    async with async_session_maker() as db:
        try:
            # 1. Criar Store
            store_result = await db.execute(
                select(Store).where(Store.slug == "fitness-store")
            )
            store = store_result.scalar_one_or_none()

            if not store:
                store = Store(
                    name="Fitness Store",
                    slug="fitness-store",
                    subdomain="fitness",
                    is_default=True,
                    plan="pro",
                    is_active=True
                )
                db.add(store)
                await db.flush()
                print("[1/2] Store criado")
            else:
                print("[1/2] Store ja existe")

            # 2. Criar/Atualizar User Admin
            user_result = await db.execute(
                select(User).where(User.email == "admin@fitness.com")
            )
            user = user_result.scalar_one_or_none()

            if not user:
                user = User(
                    email="admin@fitness.com",
                    hashed_password=get_password_hash("admin123"),
                    full_name="Administrador",
                    role="ADMIN",
                    tenant_id=store.id,
                    is_active=True
                )
                db.add(user)
                print("[2/2] Admin criado")
            else:
                # Atualizar tenant_id se estiver vazio
                if not user.tenant_id:
                    user.tenant_id = store.id
                    print("[2/2] Admin atualizado (tenant_id vinculado)")
                else:
                    print("[2/2] Admin ja existe e ja esta vinculado")

            await db.commit()
            print()
            print("="*60)
            print("CONFIGURACAO COMPLETA!")
            print("="*60)
            print(f"Email:    admin@fitness.com")
            print(f"Senha:    admin123")
            print(f"Nome:     {user.full_name}")
            print(f"Cargo:    {user.role}")
            print(f"Store:    {store.name} (ID: {store.id})")
            print("="*60)

        except Exception as e:
            await db.rollback()
            print(f"[ERRO] {e}")
            raise


if __name__ == "__main__":
    asyncio.run(create_admin())
