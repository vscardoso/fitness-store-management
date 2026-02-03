#!/usr/bin/env python3
"""Reset password for specific user"""
import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import async_session_maker
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select


async def reset_password(email: str, new_password: str):
    """Reset password for user."""
    async with async_session_maker() as db:
        result = await db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            print(f"\n❌ Usuário {email} não encontrado!")
            return False
        
        print(f"\n👤 Usuário encontrado:")
        print(f"   Nome: {user.full_name}")
        print(f"   Email: {user.email}")
        print(f"   Role: {user.role}")
        
        # Update password
        user.hashed_password = get_password_hash(new_password)
        await db.commit()
        
        print(f"\n✅ Senha alterada com sucesso!")
        print(f"   Nova senha: {new_password}")
        return True


async def main():
    email = "vscardoso2005@gmail.com"
    new_password = "Victor2024"
    
    print("="*70)
    print("REDEFINIR SENHA DE USUÁRIO")
    print("="*70)
    
    success = await reset_password(email, new_password)
    
    if success:
        print("\n" + "="*70)
        print("CREDENCIAIS ATUALIZADAS")
        print("="*70)
        print(f"📧 Email: {email}")
        print(f"🔑 Senha: {new_password}")
        print("="*70 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
