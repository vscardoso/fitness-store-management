"""
Repositório para operações de usuários (User).
"""
from typing import Any, Optional, Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User, Any, Any]):
    """Repositório para operações específicas de usuários."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(User)
        self.db = db
    
    async def create(self, obj_in: dict) -> User:
        """Wrapper para criar usuário."""
        return await super().create(self.db, obj_in)
    
    async def get_by_email(self, email: str) -> Optional[User]:
        """
        Busca um usuário pelo email.
        
        Args:
            email: Email do usuário
            
        Returns:
            Usuário encontrado ou None
        """
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_active_users(self) -> Sequence[User]:
        """
        Busca todos os usuários ativos.
        
        Returns:
            Lista de usuários ativos ordenada por nome
        """
        query = select(User).where(User.is_active == True).order_by(User.full_name)
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_by_role(self, role: UserRole) -> Sequence[User]:
        """
        Busca usuários por função/cargo.
        
        Args:
            role: Função do usuário (ADMIN, MANAGER, SELLER)
            
        Returns:
            Lista de usuários com a função especificada
        """
        query = select(User).where(User.role == role).order_by(User.full_name)
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def exists_by_email(self, email: str, exclude_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um usuário com o email especificado.
        
        Args:
            email: Email a verificar
            exclude_id: ID do usuário a excluir da verificação (para updates)
            
        Returns:
            True se o email já existe
        """
        conditions = [User.email == email]
        
        if exclude_id is not None:
            conditions.append(User.id != exclude_id)
        
        query = select(User.id).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def authenticate(self, email: str, password: str) -> Optional[User]:
        """
        Autentica um usuário pelo email e senha.
        
        Args:
            email: Email do usuário
            password: Senha (já hasheada)
            
        Returns:
            Usuário autenticado ou None se credenciais inválidas
        """
        query = select(User).where(
            User.email == email,
            User.password_hash == password,
            User.is_active == True
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def deactivate_user(self, user_id: int) -> bool:
        """
        Desativa um usuário (soft delete).
        
        Args:
            user_id: ID do usuário
            
        Returns:
            True se o usuário foi desativado com sucesso
        """
        user = await self.get(user_id)
        if user:
            user.is_active = False
            await self.db.commit()
            return True
        return False
    
    async def activate_user(self, user_id: int) -> bool:
        """
        Ativa um usuário.
        
        Args:
            user_id: ID do usuário
            
        Returns:
            True se o usuário foi ativado com sucesso
        """
        user = await self.get(user_id)
        if user:
            user.is_active = True
            await self.db.commit()
            return True
        return False
    
    async def get_admins(self) -> Sequence[User]:
        """
        Busca todos os usuários administradores ativos.
        
        Returns:
            Lista de administradores ativos
        """
        query = select(User).where(
            User.role == UserRole.ADMIN,
            User.is_active == True
        ).order_by(User.full_name)
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_sellers(self) -> Sequence[User]:
        """
        Busca todos os usuários vendedores ativos.
        
        Returns:
            Lista de vendedores ativos
        """
        query = select(User).where(
            User.role == UserRole.SELLER,
            User.is_active == True
        ).order_by(User.full_name)
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_managers(self) -> Sequence[User]:
        """
        Busca todos os usuários gerentes ativos.
        
        Returns:
            Lista de gerentes ativos
        """
        query = select(User).where(
            User.role == UserRole.MANAGER,
            User.is_active == True
        ).order_by(User.full_name)
        result = await self.db.execute(query)
        return result.scalars().all()