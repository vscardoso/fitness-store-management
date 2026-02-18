"""
Serviço de autenticação de usuários.
"""
from datetime import timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password
)
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate


class AuthService:
    """Serviço para autenticação e registro de usuários."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de autenticação.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.user_repo = UserRepository(db)
    
    async def register_user(self, user_data: UserCreate) -> User:
        """
        Registra um novo usuário no sistema.
        
        Args:
            user_data: Dados do usuário a ser criado
            
        Returns:
            User: Usuário criado
            
        Raises:
            ValueError: Se o email já estiver cadastrado
        """
        # Verificar se email já existe
        existing_user = await self.user_repo.get_by_email(user_data.email)
        if existing_user:
            raise ValueError("Email já cadastrado")
        
        # Hash da senha
        hashed_password = get_password_hash(user_data.password)
        
        # Criar usuário
        user_dict = user_data.model_dump(exclude={'password'})
        user_dict['hashed_password'] = hashed_password
        
        user = await self.user_repo.create(user_dict)
        return user
    
    async def authenticate(self, email: str, password: str) -> Optional[User]:
        """
        Autentica um usuário verificando email e senha.
        
        Args:
            email: Email do usuário
            password: Senha em texto plano
            
        Returns:
            Optional[User]: Usuário autenticado ou None se credenciais inválidas
        """
        user = await self.user_repo.get_by_email(email)
        if not user:
            return None
        
        if not verify_password(password, user.hashed_password):
            return None
        
        if not user.is_active:
            return None
        
        return user
    
    async def create_token(self, user: User) -> str:
        """
        Cria um token JWT para o usuário autenticado.
        
        Args:
            user: Usuário autenticado
            
        Returns:
            str: Token JWT de acesso
        """
        access_token = create_access_token(
            data={
                "sub": str(user.id),
                "role": user.role.value,
                "tenant_id": user.tenant_id  #  ADD TENANT_ID
            },
            expires_delta=timedelta(days=7)
        )
        return access_token
    
    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        """
        Busca um usuário pelo ID.
        
        Args:
            user_id: ID do usuário
            
        Returns:
            Optional[User]: Usuário encontrado ou None
        """
        return await self.user_repo.get(self.db, user_id)
    
    async def change_password(
        self, 
        user_id: int, 
        current_password: str, 
        new_password: str
    ) -> bool:
        """
        Altera a senha de um usuário.
        
        Args:
            user_id: ID do usuário
            current_password: Senha atual
            new_password: Nova senha
            
        Returns:
            bool: True se senha alterada com sucesso
            
        Raises:
            ValueError: Se senha atual incorreta ou usuário não encontrado
        """
        user = await self.user_repo.get(self.db, user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        
        if not verify_password(current_password, user.hashed_password):
            raise ValueError("Senha atual incorreta")
        
        # Atualizar senha
        new_hashed_password = get_password_hash(new_password)
        await self.user_repo.update(
            self.db,
            user_id,
            {"hashed_password": new_hashed_password}
        )
        
        return True
    
    async def deactivate_user(self, user_id: int) -> bool:
        """
        Desativa um usuário.
        
        Args:
            user_id: ID do usuário
            
        Returns:
            bool: True se usuário desativado com sucesso
            
        Raises:
            ValueError: Se usuário não encontrado
        """
        user = await self.user_repo.get(self.db, user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        
        await self.user_repo.update(self.db, id=user_id, obj_in={"is_active": False})
        return True
    
    async def activate_user(self, user_id: int) -> bool:
        """
        Ativa um usuário.
        
        Args:
            user_id: ID do usuário
            
        Returns:
            bool: True se usuário ativado com sucesso
            
        Raises:
            ValueError: Se usuário não encontrado
        """
        user = await self.user_repo.get(self.db, user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        
        await self.user_repo.update(self.db, id=user_id, obj_in={"is_active": True})
        return True
