"""
Dependências de autenticação e autorização para a API.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from typing import List

from app.core.database import get_db
from app.core.config import settings
from app.repositories.user_repository import UserRepository
from app.models.user import User, UserRole

# Configuração do HTTPBearer para extrair token do header Authorization
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Obtém usuário atual a partir do JWT token.
    
    Args:
        credentials: Credenciais extraídas do header Authorization
        db: Sessão do banco de dados
        
    Returns:
        User: Usuário autenticado
        
    Raises:
        HTTPException: Se o token for inválido ou usuário não existir
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Extrair token das credenciais
        token = credentials.credentials
        
        # Decodificar JWT token
        payload = jwt.decode(
            token, 
            settings.SECRET_KEY, 
            algorithms=[settings.ALGORITHM]
        )
        
        # Extrair user_id do payload
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
    
    # Buscar usuário no banco de dados
    user_repo = UserRepository(db)
    user = await user_repo.get(int(user_id))

    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Verifica se usuário está ativo.
    
    Args:
        current_user: Usuário autenticado
        
    Returns:
        User: Usuário ativo
        
    Raises:
        HTTPException: Se usuário estiver inativo
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo"
        )
    return current_user


def require_role(allowed_roles: List[UserRole]):
    """
    Decorator para verificar permissões de role.
    
    Args:
        allowed_roles: Lista de roles permitidas para acessar o endpoint
        
    Returns:
        Função que verifica se o usuário tem uma das roles permitidas
        
    Example:
        @router.get("/admin-only")
        async def admin_endpoint(
            user: User = Depends(require_role([UserRole.ADMIN]))
        ):
            return {"message": "Admin access granted"}
    """
    async def role_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permissão negada. Roles permitidas: {[role.value for role in allowed_roles]}"
            )
        return current_user
    
    return role_checker


# Atalhos para roles específicas
async def require_admin(
    current_user: User = Depends(require_role([UserRole.ADMIN]))
) -> User:
    """Requer que o usuário seja ADMIN"""
    return current_user


async def require_seller_or_admin(
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER]))
) -> User:
    """Requer que o usuário seja SELLER ou ADMIN"""
    return current_user
