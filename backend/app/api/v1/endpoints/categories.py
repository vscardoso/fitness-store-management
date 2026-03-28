"""
Endpoints de gerenciamento de categorias.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryWithChildren,
)
from app.services.category_service import CategoryService
from app.api.deps import get_current_active_user, require_role
from app.models.user import User, UserRole


router = APIRouter(prefix="/categories", tags=["Categorias"])


def get_service(db: AsyncSession = Depends(get_db)) -> CategoryService:
    return CategoryService(db)


# ============================================================================
# LISTAGEM E CONSULTA
# ============================================================================


@router.get("/", response_model=List[CategoryResponse], summary="Listar categorias")
async def list_categories(
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=1000),
    service: CategoryService = Depends(get_service),
    current_user: User = Depends(get_current_active_user),
):
    try:
        return await service.list_categories(
            tenant_id=current_user.tenant_id, skip=skip, limit=limit
        )
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get(
    "/hierarchy",
    response_model=List[CategoryWithChildren],
    summary="Árvore de categorias",
)
async def get_category_hierarchy(service: CategoryService = Depends(get_service)):
    try:
        return await service.get_hierarchy()
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get(
    "/{category_id}",
    response_model=CategoryWithChildren,
    summary="Obter categoria com subcategorias",
)
async def get_category(
    category_id: int,
    service: CategoryService = Depends(get_service),
):
    try:
        category = await service.get_category(category_id)
        if not category:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail=f"Categoria com ID {category_id} não encontrada",
            )
        return category
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ============================================================================
# CRIAÇÃO E ATUALIZAÇÃO
# ============================================================================


@router.post(
    "/",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar categoria",
)
async def create_category(
    category_data: CategoryCreate,
    service: CategoryService = Depends(get_service),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER])),
):
    try:
        return await service.create_category(
            category_data, tenant_id=current_user.tenant_id
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Atualizar categoria",
)
async def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    service: CategoryService = Depends(get_service),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER])),
):
    try:
        return await service.update_category(category_id, category_data)
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ============================================================================
# EXCLUSÃO
# ============================================================================


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletar categoria (soft delete)",
)
async def delete_category(
    category_id: int,
    service: CategoryService = Depends(get_service),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    try:
        await service.delete_category(category_id)
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
