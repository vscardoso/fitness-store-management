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

    async def get(self, user_id: int, *, tenant_id: int | None = None) -> Optional[User]:
        """Busca usuário por ID."""
        return await super().get(self.db, user_id, tenant_id=tenant_id)

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
        user = await super().get(self.db, user_id)
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
        user = await super().get(self.db, user_id)
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

    # ========== MÉTODOS MULTI-TENANT ==========

    async def get_by_tenant(
        self,
        tenant_id: int,
        skip: int = 0,
        limit: int = 100,
        include_inactive: bool = False
    ) -> Sequence[User]:
        """
        Busca todos os usuários de uma loja específica.

        Args:
            tenant_id: ID da loja
            skip: Offset para paginação
            limit: Limite de resultados
            include_inactive: Se True, inclui usuários inativos

        Returns:
            Lista de usuários da loja
        """
        conditions = [User.tenant_id == tenant_id]
        if not include_inactive:
            conditions.append(User.is_active == True)

        query = (
            select(User)
            .where(*conditions)
            .order_by(User.full_name)
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def count_by_tenant(self, tenant_id: int, include_inactive: bool = False) -> int:
        """
        Conta usuários de uma loja.

        Args:
            tenant_id: ID da loja
            include_inactive: Se True, conta também inativos

        Returns:
            Número de usuários
        """
        from sqlalchemy import func

        conditions = [User.tenant_id == tenant_id]
        if not include_inactive:
            conditions.append(User.is_active == True)

        query = select(func.count(User.id)).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_by_tenant_and_role(
        self,
        tenant_id: int,
        role: UserRole
    ) -> Sequence[User]:
        """
        Busca usuários de uma loja por função.

        Args:
            tenant_id: ID da loja
            role: Função do usuário

        Returns:
            Lista de usuários
        """
        query = (
            select(User)
            .where(
                User.tenant_id == tenant_id,
                User.role == role,
                User.is_active == True
            )
            .order_by(User.full_name)
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_user_in_tenant(
        self,
        user_id: int,
        tenant_id: int
    ) -> Optional[User]:
        """
        Busca um usuário específico garantindo que pertence à loja.

        Args:
            user_id: ID do usuário
            tenant_id: ID da loja

        Returns:
            Usuário ou None se não encontrado/não pertence à loja
        """
        query = select(User).where(
            User.id == user_id,
            User.tenant_id == tenant_id
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def exists_email_in_tenant(
        self,
        email: str,
        tenant_id: int,
        exclude_id: Optional[int] = None
    ) -> bool:
        """
        Verifica se email já existe na loja.

        Args:
            email: Email a verificar
            tenant_id: ID da loja
            exclude_id: ID a excluir (para updates)

        Returns:
            True se email já existe na loja
        """
        conditions = [
            User.email == email,
            User.tenant_id == tenant_id
        ]
        if exclude_id:
            conditions.append(User.id != exclude_id)

        query = select(User.id).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None

    async def create_for_tenant(
        self,
        tenant_id: int,
        user_data: dict
    ) -> User:
        """
        Cria um usuário vinculado a uma loja.

        Args:
            tenant_id: ID da loja
            user_data: Dados do usuário

        Returns:
            Usuário criado
        """
        user_data["tenant_id"] = tenant_id
        return await super().create(self.db, user_data, tenant_id=tenant_id)

    async def update_in_tenant(
        self,
        user_id: int,
        tenant_id: int,
        obj_in: dict
    ) -> Optional[User]:
        """
        Atualiza usuário garantindo que pertence à loja.

        Args:
            user_id: ID do usuário
            tenant_id: ID da loja
            obj_in: Dados a atualizar

        Returns:
            Usuário atualizado ou None
        """
        # Verificar se pertence à loja
        user = await self.get_user_in_tenant(user_id, tenant_id)
        if not user:
            return None

        # Atualizar campos diretamente no objeto já carregado
        for field, value in obj_in.items():
            if hasattr(user, field):
                setattr(user, field, value)

        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def deactivate_in_tenant(
        self,
        user_id: int,
        tenant_id: int
    ) -> bool:
        """
        Desativa usuário garantindo que pertence à loja.

        Args:
            user_id: ID do usuário
            tenant_id: ID da loja

        Returns:
            True se desativado com sucesso
        """
        user = await self.get_user_in_tenant(user_id, tenant_id)
        if not user:
            return False

        return await self.deactivate_user(user_id)

    async def activate_in_tenant(
        self,
        user_id: int,
        tenant_id: int
    ) -> bool:
        """
        Ativa usuário garantindo que pertence à loja.

        Args:
            user_id: ID do usuário
            tenant_id: ID da loja

        Returns:
            True se ativado com sucesso
        """
        user = await self.get_user_in_tenant(user_id, tenant_id)
        if not user:
            return False

        return await self.activate_user(user_id)