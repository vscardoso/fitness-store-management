"""
Endpoints de autenticação e autorização.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token, TokenResponse
from app.schemas.signup import (
    SignupRequest,
    SignupResponse,
    CheckEmailRequest,
    CheckEmailResponse,
    CheckSlugRequest,
    CheckSlugResponse
)
from app.services.auth_service import AuthService
from app.services.signup_service import SignupService
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.store import Store

router = APIRouter(prefix="/auth", tags=["Autenticação"])
logger = logging.getLogger(__name__)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar novo usuário",
    description="Cria um novo usuário no sistema com email e senha"
)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Registrar novo usuário.
    
    Args:
        user_data: Dados do usuário (email, senha, nome completo, role, telefone)
        db: Sessão do banco de dados
        
    Returns:
        UserResponse: Dados do usuário criado
        
    Raises:
        HTTPException 400: Se email já estiver em uso ou dados inválidos
    """
    auth_service = AuthService(db)
    
    try:
        user = await auth_service.register_user(user_data)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao registrar usuário: {str(e)}"
        )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login de usuário",
    description="Autentica usuário e retorna token JWT de acesso com dados do usuário"
)
async def login(
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    Login e obter token JWT com dados do usuário.

    Args:
        credentials: Email e senha do usuário
        db: Sessão do banco de dados

    Returns:
        TokenResponse: Token de acesso JWT e dados do usuário

    Raises:
        HTTPException 401: Se credenciais forem inválidas
        HTTPException 403: Se usuário estiver inativo
    """
    auth_service = AuthService(db)

    # Validar credenciais
    if not credentials.email or not credentials.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email e senha são obrigatórios"
        )

    # Autenticar usuário
    user = await auth_service.authenticate(
        credentials.email,
        credentials.password
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Verificar se usuário está ativo
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo. Entre em contato com o administrador."
        )

    # Criar token de acesso
    try:
        access_token = await auth_service.create_token(user)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar token de acesso: {str(e)}"
        )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }




@router.get(
    "/me",
    response_model=UserResponse,
    summary="Obter dados do usuário autenticado",
    description="Retorna informações do usuário atualmente autenticado"
)
async def get_me(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Obter dados do usuário autenticado.

    Args:
        current_user: Usuário atual (injetado pela dependência)
        db: Sessão do banco de dados

    Returns:
        UserResponse: Dados do usuário autenticado (com nome da loja)

    Raises:
        HTTPException 401: Se token for inválido
        HTTPException 403: Se usuário estiver inativo
        HTTPException 500: Se erro ao buscar dados
    """
    # Buscar nome da loja se tenant_id existir
    store_name = None
    if current_user.tenant_id:
        try:
            result = await db.execute(
                select(Store.name).where(
                    Store.id == current_user.tenant_id,
                    Store.is_active == True
                )
            )
            store_name = result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching store: {e}", exc_info=True)

    # Return explicit dict to avoid ORM lazy-loading issues
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "phone": current_user.phone,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
        "updated_at": current_user.updated_at,
        "tenant_id": current_user.tenant_id,
        "store_name": store_name
    }


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout de usuário",
    description="Invalida o token atual (implementação futura com blacklist)"
)
async def logout(
    current_user: User = Depends(get_current_active_user)
):
    """
    Logout de usuário.
    
    Nota: Por enquanto, apenas valida o token. 
    Em produção, adicionar token a uma blacklist/cache.
    
    Args:
        current_user: Usuário atual (injetado pela dependência)
        
    Returns:
        None (204 No Content)
    """
    # TODO: Implementar blacklist de tokens em Redis/Cache
    # await auth_service.add_token_to_blacklist(token)
    return None


@router.post(
    "/refresh",
    response_model=Token,
    summary="Renovar token de acesso",
    description="Gera novo token de acesso usando refresh token (implementação futura)"
)
async def refresh_token(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Renovar token de acesso.
    
    Nota: Por enquanto, retorna novo token baseado no usuário atual.
    Em produção, validar refresh token separadamente.
    
    Args:
        current_user: Usuário atual (injetado pela dependência)
        db: Sessão do banco de dados
        
    Returns:
        Token: Novo token de acesso JWT
        
    Raises:
        HTTPException 401: Se refresh token for inválido
    """
    auth_service = AuthService(db)
    
    try:
        # Criar novo token de acesso
        access_token = await auth_service.create_token(current_user)
        
        return {
            "access_token": access_token,
            "refresh_token": access_token,  # Por enquanto, mesmo token
            "token_type": "bearer"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao renovar token: {str(e)}"
        )


@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastro completo (SaaS)",
    description="Cria tenant (store) + usuário (owner) + subscription atomicamente"
)
async def signup(
    signup_data: SignupRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Cadastro completo para SaaS multi-tenant:
    1. Cria Store (tenant) com slug único
    2. Cria User como owner (ADMIN)
    3. Cria Subscription (trial por padrão)
    4. Retorna JWT tokens para login automático
    
    Args:
        signup_data: Dados de cadastro (usuário + loja + plano)
        db: Sessão do banco de dados
        
    Returns:
        SignupResponse: Dados completos + tokens JWT
        
    Raises:
        HTTPException 400: Se email/slug já existir ou dados inválidos
        HTTPException 500: Se erro na transação
    """
    signup_service = SignupService(db)
    
    try:
        response = await signup_service.signup(signup_data)
        return response
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar conta: {str(e)}"
        )


@router.post(
    "/check-email",
    response_model=CheckEmailResponse,
    summary="Verificar disponibilidade de email",
    description="Verifica se email já está cadastrado no sistema"
)
async def check_email(
    request: CheckEmailRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Verifica se email está disponível para cadastro.
    Útil para validação em tempo real no frontend.
    
    Args:
        request: Email a verificar
        db: Sessão do banco de dados
        
    Returns:
        CheckEmailResponse: available (bool) + message
    """
    signup_service = SignupService(db)
    
    available, message = await signup_service.check_email_available(request.email)
    
    return CheckEmailResponse(
        available=available,
        message=message
    )


@router.post(
    "/check-slug",
    response_model=CheckSlugResponse,
    summary="Verificar disponibilidade de slug/nome da loja",
    description="Verifica se slug está disponível e sugere alternativas"
)
async def check_slug(
    request: CheckSlugRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Verifica se slug da loja está disponível.
    Se indisponível, sugere alternativa com sufixo.
    
    Args:
        request: Slug a verificar
        db: Sessão do banco de dados
        
    Returns:
        CheckSlugResponse: available (bool) + suggested_slug + message
    """
    signup_service = SignupService(db)
    
    available, suggested_slug, message = await signup_service.check_slug_available(request.slug)
    
    return CheckSlugResponse(
        available=available,
        suggested_slug=suggested_slug,
        message=message
    )
