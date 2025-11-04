#!/usr/bin/env python3
"""
Criar usuario admin simples
"""
import asyncio
import sys
import os

# Adicionar o diretório do projeto ao Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import async_session_maker
from app.models.user import User, UserRole
from app.core.security import get_password_hash


async def create_admin():
    """Criar usuario admin."""
    print("Criando admin...")

    async with async_session_maker() as db:
        # Verificar se admin já existe
        from sqlalchemy import select
        result = await db.execute(
            select(User).where(User.email == "admin@fitness.com")
        )
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print("Admin ja existe!")
            return

        # Criar novo admin
        hashed_password = get_password_hash("admin123")
        admin_user = User(
            email="admin@fitness.com",
            full_name="Administrator",
            hashed_password=hashed_password,
            role=UserRole.ADMIN,
            is_active=True
        )

        db.add(admin_user)
        await db.commit()
        print("Admin criado: admin@fitness.com / admin123")


if __name__ == "__main__":
    asyncio.run(create_admin())