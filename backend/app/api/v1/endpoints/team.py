"""
Endpoints para gerenciamento de equipe (usuários da loja).
Permite que admins/managers gerenciem os membros da sua loja.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_password_hash
from app.api.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.user import (
    TeamMemberCreate,
    TeamMemberUpdate,
    TeamMemberResponse,
    TeamMemberListResponse,
    ChangeRoleRequest,
    ResetPasswordRequest,
)

router = APIRouter()


def _user_to_response(user: User) -> TeamMemberResponse:
    """Converte User para TeamMemberResponse."""
    return TeamMemberResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("", response_model=TeamMemberListResponse)
async def list_team_members(
    skip: int = 0,
    limit: int = 100,
    include_inactive: bool = False,
    role: Optional[UserRole] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER])),
):
    """
    Lista todos os membros da equipe (usuários da mesma loja).
    Requer role ADMIN ou MANAGER.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não está vinculado a nenhuma loja"
        )

    repo = UserRepository(db)

    if role:
        users = await repo.get_by_tenant_and_role(current_user.tenant_id, role)
        total = len(users)
    else:
        users = await repo.get_by_tenant(
            current_user.tenant_id,
            skip=skip,
            limit=limit,
            include_inactive=include_inactive
        )
        total = await repo.count_by_tenant(current_user.tenant_id, include_inactive)

    return TeamMemberListResponse(
        items=[_user_to_response(u) for u in users],
        total=total
    )


@router.get("/{user_id}", response_model=TeamMemberResponse)
async def get_team_member(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER])),
):
    """
    Obtém detalhes de um membro da equipe.
    Requer role ADMIN ou MANAGER.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não está vinculado a nenhuma loja"
        )

    repo = UserRepository(db)
    user = await repo.get_user_in_tenant(user_id, current_user.tenant_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membro da equipe não encontrado"
        )

    return _user_to_response(user)


@router.post("", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def create_team_member(
    member_data: TeamMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    """
    Cria um novo membro da equipe (usuário na mesma loja).
    Requer role ADMIN.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não está vinculado a nenhuma loja"
        )

    repo = UserRepository(db)

    # Verificar se email já existe globalmente
    existing = await repo.get_by_email(member_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este email já está em uso"
        )

    # Criar usuário
    user_dict = {
        "email": member_data.email,
        "full_name": member_data.full_name,
        "phone": member_data.phone,
        "hashed_password": get_password_hash(member_data.password),
        "role": member_data.role,
        "is_active": True,
    }

    new_user = await repo.create_for_tenant(current_user.tenant_id, user_dict)
    await db.commit()
    await db.refresh(new_user)

    return _user_to_response(new_user)


@router.put("/{user_id}", response_model=TeamMemberResponse)
async def update_team_member(
    user_id: int,
    member_data: TeamMemberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    """
    Atualiza um membro da equipe.
    Requer role ADMIN.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não está vinculado a nenhuma loja"
        )

    # Não pode editar a si mesmo por aqui
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use a tela de perfil para editar seus próprios dados"
        )

    repo = UserRepository(db)

    # Verificar se usuário existe na loja
    user = await repo.get_user_in_tenant(user_id, current_user.tenant_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membro da equipe não encontrado"
        )

    # Atualizar apenas campos fornecidos
    update_dict = member_data.model_dump(exclude_unset=True)
    if update_dict:
        updated = await repo.update_in_tenant(user_id, current_user.tenant_id, update_dict)
        await db.commit()
        await db.refresh(updated)
        return _user_to_response(updated)

    return _user_to_response(user)


@router.patch("/{user_id}/role", response_model=TeamMemberResponse)
async def change_member_role(
    user_id: int,
    role_data: ChangeRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    """
    Altera a role de um membro da equipe.
    Requer role ADMIN.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não está vinculado a nenhuma loja"
        )

    # Não pode mudar própria role
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode alterar sua própria função"
        )

    repo = UserRepository(db)
    user = await repo.get_user_in_tenant(user_id, current_user.tenant_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membro da equipe não encontrado"
        )

    updated = await repo.update_in_tenant(
        user_id,
        current_user.tenant_id,
        {"role": role_data.role}
    )
    await db.commit()
    await db.refresh(updated)

    return _user_to_response(updated)


@router.patch("/{user_id}/reset-password")
async def reset_member_password(
    user_id: int,
    password_data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    """
    Reseta a senha de um membro da equipe.
    Requer role ADMIN.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não está vinculado a nenhuma loja"
        )

    repo = UserRepository(db)
    user = await repo.get_user_in_tenant(user_id, current_user.tenant_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membro da equipe não encontrado"
        )

    # Atualizar senha
    hashed = get_password_hash(password_data.new_password)
    await repo.update_in_tenant(
        user_id,
        current_user.tenant_id,
        {"hashed_password": hashed}
    )
    await db.commit()

    return {"message": "Senha alterada com sucesso"}


@router.delete("/{user_id}")
async def deactivate_team_member(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    """
    Desativa um membro da equipe (soft delete).
    Requer role ADMIN.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não está vinculado a nenhuma loja"
        )

    # Não pode desativar a si mesmo
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode desativar sua própria conta"
        )

    repo = UserRepository(db)

    success = await repo.deactivate_in_tenant(user_id, current_user.tenant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membro da equipe não encontrado"
        )

    await db.commit()
    return {"message": "Membro desativado com sucesso"}


@router.patch("/{user_id}/activate")
async def activate_team_member(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    """
    Reativa um membro da equipe.
    Requer role ADMIN.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não está vinculado a nenhuma loja"
        )

    repo = UserRepository(db)

    success = await repo.activate_in_tenant(user_id, current_user.tenant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membro da equipe não encontrado"
        )

    await db.commit()
    return {"message": "Membro reativado com sucesso"}
