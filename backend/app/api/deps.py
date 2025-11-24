"""
Dependências de autenticação e autorização para a API.
"""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from typing import List

from app.core.database import get_db
from app.core.config import settings
from app.repositories.user_repository import UserRepository
from app.models.user import User, UserRole
from app.models.store import Store

# Configuração do HTTPBearer para extrair token do header Authorization
# auto_error=False para retornarmos 401 (e não 403) quando header estiver ausente
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
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
    import logging
    logger = logging.getLogger(__name__)

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Se não veio Authorization header, retornar 401
        if credentials is None:
            raise credentials_exception
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

    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"Error in get_current_user (token processing): {e}", exc_info=True)
        raise credentials_exception

    # Buscar usuário no banco de dados
    try:
        user_repo = UserRepository(db)
        user = await user_repo.get(int(user_id))

        if user is None:
            logger.error(f"User {user_id} not found in database")
            raise credentials_exception

        logger.info(f"User {user_id} authenticated successfully")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_current_user (database): {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar usuário: {str(e)}"
        )


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
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário inativo",
            headers={"WWW-Authenticate": "Bearer"},
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


async def get_current_tenant_id(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> int:
    """
    Resolve o tenant atual a partir de headers/host/user, ou retorna o tenant padrão.

    Prioridade:
    1) user.tenant_id (do JWT/database) - NOVO ✅
    2) request.state.tenant_id (definido via middleware)
    3) Header 'X-Tenant-Id' (int)
    4) Header 'X-Store-Slug' (slug)
    5) Host header (domain) mapeado em Store.domain
    6) Store com is_default = True
    """
    # 1) Prioridade: tenant_id do usuário autenticado
    if current_user and current_user.tenant_id:
        return current_user.tenant_id

    # 2) Usa o valor resolvido pelo middleware, quando existir
    if hasattr(request.state, "tenant_id") and request.state.tenant_id:
        return int(request.state.tenant_id)

    # 3) Tenta X-Tenant-Id
    tenant_id_hdr = request.headers.get("X-Tenant-Id")
    if tenant_id_hdr and tenant_id_hdr.isdigit():
        return int(tenant_id_hdr)

    # 4) Tenta X-Store-Slug
    slug = request.headers.get("X-Store-Slug")
    if slug:
        result = await db.execute(select(Store.id).where(Store.slug == slug, Store.is_active == True))
        tid = result.scalar_one_or_none()
        if tid:
            return tid

    # 5) Tenta pelo domínio (Host)
    host = request.headers.get("host") or request.headers.get("Host")
    if host:
        # Remove porta se vier (ex: localhost:8000)
        domain = host.split(":")[0]
        result = await db.execute(select(Store.id).where(Store.domain == domain, Store.is_active == True))
        tid = result.scalar_one_or_none()
        if tid:
            return tid

    # 6) Fallback: store default
    result = await db.execute(select(Store.id).where(Store.is_default == True))
    tid = result.scalar_one_or_none()
    if tid:
        return tid

    raise HTTPException(status_code=400, detail="Tenant não resolvido e nenhuma store padrão encontrada.")


async def require_seller_or_admin(
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER]))
) -> User:
    """Requer que o usuário seja SELLER ou ADMIN"""
    return current_user
