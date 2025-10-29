"""
Endpoints de gerenciamento de categorias.

Este módulo implementa a API REST para CRUD completo de categorias,
incluindo suporte a hierarquia (categorias e subcategorias),
visualização em árvore e validações de integridade.

Endpoints:
    - GET /categories/: Listar todas as categorias (flat)
    - GET /categories/hierarchy: Árvore completa de categorias
    - GET /categories/{category_id}: Categoria com subcategorias
    - POST /categories/: Criar nova categoria
    - PUT /categories/{category_id}: Atualizar categoria
    - DELETE /categories/{category_id}: Deletar categoria (soft delete)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryWithChildren
)
from app.repositories.category_repository import CategoryRepository
from app.api.deps import get_current_active_user, require_role
from app.models.user import User, UserRole


router = APIRouter(prefix="/categories", tags=["Categorias"])


# ============================================================================
# ENDPOINTS DE LISTAGEM E CONSULTA
# ============================================================================


@router.get(
    "/",
    response_model=List[CategoryResponse],
    summary="Listar categorias",
    description="Lista todas as categorias ativas (visualização flat)"
)
async def list_categories(
    skip: int = Query(0, ge=0, description="Número de registros a pular"),
    limit: int = Query(1000, ge=1, le=1000, description="Número máximo de registros"),
    db: AsyncSession = Depends(get_db)
):
    """
    Listar todas as categorias.
    
    Retorna lista flat (sem hierarquia) de todas as categorias ativas.
    Para visualização hierárquica, use /categories/hierarchy.
    
    Não requer autenticação (dados públicos).
    
    Args:
        skip: Número de registros a pular (padrão: 0)
        limit: Número máximo de registros (padrão: 1000, máximo: 1000)
        db: Sessão do banco de dados
        
    Returns:
        List[CategoryResponse]: Lista de categorias incluindo:
            - id: ID da categoria
            - name: Nome da categoria
            - description: Descrição (opcional)
            - parent_id: ID da categoria pai (null se for raiz)
            - is_active: Status ativo/inativo
            
    Example:
        GET /categories/
        
    Example Response:
        [
            {
                "id": 1,
                "name": "Suplementos",
                "description": "Suplementos alimentares e proteínas",
                "parent_id": null,
                "is_active": true,
                "created_at": "2025-10-28T10:00:00",
                "updated_at": "2025-10-28T10:00:00"
            },
            {
                "id": 2,
                "name": "Whey Protein",
                "description": "Proteínas de soro do leite",
                "parent_id": 1,
                "is_active": true,
                "created_at": "2025-10-28T10:00:00",
                "updated_at": "2025-10-28T10:00:00"
            }
        ]
        
    Note:
        - Retorna apenas categorias ativas (is_active=true)
        - Lista flat: não mostra estrutura hierárquica
        - Inclui categorias raiz e subcategorias misturadas
    """
    category_repo = CategoryRepository(db)
    
    try:
        categories = await category_repo.get_multi(db, skip=skip, limit=limit)
        return categories
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar categorias: {str(e)}"
        )


@router.get(
    "/hierarchy",
    response_model=List[CategoryWithChildren],
    summary="Árvore de categorias",
    description="Retorna estrutura hierárquica completa de categorias e subcategorias"
)
async def get_category_hierarchy(
    db: AsyncSession = Depends(get_db)
):
    """
    Obter árvore completa de categorias.
    
    Retorna estrutura hierárquica com categorias raiz e suas
    subcategorias aninhadas recursivamente.
    
    Não requer autenticação (dados públicos).
    
    Args:
        db: Sessão do banco de dados
        
    Returns:
        List[CategoryWithChildren]: Árvore de categorias incluindo:
            - id, name, description: Dados da categoria
            - parent_id: ID da categoria pai
            - subcategories: Lista recursiva de subcategorias
            
    Example:
        GET /categories/hierarchy
        
    Example Response:
        [
            {
                "id": 1,
                "name": "Suplementos",
                "description": "Suplementos alimentares",
                "parent_id": null,
                "is_active": true,
                "subcategories": [
                    {
                        "id": 2,
                        "name": "Whey Protein",
                        "description": "Proteínas de soro",
                        "parent_id": 1,
                        "is_active": true,
                        "subcategories": []
                    },
                    {
                        "id": 3,
                        "name": "Creatina",
                        "description": "Suplementos de creatina",
                        "parent_id": 1,
                        "is_active": true,
                        "subcategories": []
                    }
                ]
            },
            {
                "id": 4,
                "name": "Acessórios",
                "description": "Acessórios fitness",
                "parent_id": null,
                "is_active": true,
                "subcategories": [
                    {
                        "id": 5,
                        "name": "Luvas",
                        "description": "Luvas para treino",
                        "parent_id": 4,
                        "is_active": true,
                        "subcategories": []
                    }
                ]
            }
        ]
        
    Note:
        - Retorna apenas categorias raiz (parent_id=null) no primeiro nível
        - Subcategorias são aninhadas recursivamente
        - Útil para montar menus e filtros hierárquicos
        - Categorias inativas não são incluídas
    """
    category_repo = CategoryRepository(db)
    
    try:
        hierarchy = await category_repo.get_hierarchy()
        return hierarchy
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar hierarquia de categorias: {str(e)}"
        )


@router.get(
    "/{category_id}",
    response_model=CategoryWithChildren,
    summary="Obter categoria com subcategorias",
    description="Retorna uma categoria específica com suas subcategorias diretas"
)
async def get_category(
    category_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Obter categoria com subcategorias.
    
    Retorna dados da categoria e lista de suas subcategorias diretas
    (não recursivo - apenas 1 nível abaixo).
    
    Não requer autenticação (dados públicos).
    
    Args:
        category_id: ID da categoria
        db: Sessão do banco de dados
        
    Returns:
        CategoryWithChildren: Categoria com lista de subcategorias
        
    Raises:
        HTTPException 404: Se categoria não for encontrada
        HTTPException 500: Se houver erro ao buscar categoria
        
    Example:
        GET /categories/1
        
    Example Response:
        {
            "id": 1,
            "name": "Suplementos",
            "description": "Suplementos alimentares e proteínas",
            "parent_id": null,
            "is_active": true,
            "subcategories": [
                {
                    "id": 2,
                    "name": "Whey Protein",
                    "description": "Proteínas de soro do leite",
                    "parent_id": 1,
                    "is_active": true,
                    "subcategories": []
                },
                {
                    "id": 3,
                    "name": "Creatina",
                    "description": "Suplementos de creatina",
                    "parent_id": 1,
                    "is_active": true,
                    "subcategories": []
                }
            ],
            "created_at": "2025-10-28T10:00:00",
            "updated_at": "2025-10-28T10:00:00"
        }
        
    Note:
        - Retorna subcategorias de apenas 1 nível
        - Para árvore completa, use /categories/hierarchy
        - Útil para navegação e detalhes de categoria
    """
    category_repo = CategoryRepository(db)
    
    try:
        category = await category_repo.get_with_subcategories(category_id)
        
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Categoria com ID {category_id} não encontrada"
            )
        
        return category
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar categoria: {str(e)}"
        )


# ============================================================================
# ENDPOINTS DE CRIAÇÃO E ATUALIZAÇÃO
# ============================================================================


@router.post(
    "/",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar categoria",
    description="Cria nova categoria ou subcategoria (apenas Admin/Manager)"
)
async def create_category(
    category_data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Criar nova categoria.
    
    Pode criar categoria raiz (parent_id=null) ou subcategoria
    (parent_id com ID válido).
    
    Requer permissão de ADMIN ou MANAGER.
    
    Args:
        category_data: Dados da categoria (name, description, parent_id)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin/Manager)
        
    Returns:
        CategoryResponse: Categoria criada com ID gerado
        
    Raises:
        HTTPException 400: Se:
            - Nome já existir
            - parent_id for inválido (categoria pai não existe)
            - Dados forem inválidos
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 500: Se houver erro ao criar categoria
        
    Example Request (categoria raiz):
        POST /categories/
        {
            "name": "Suplementos",
            "description": "Suplementos alimentares e proteínas",
            "parent_id": null
        }
        
    Example Request (subcategoria):
        POST /categories/
        {
            "name": "Whey Protein",
            "description": "Proteínas de soro do leite",
            "parent_id": 1
        }
        
    Example Response:
        {
            "id": 2,
            "name": "Whey Protein",
            "description": "Proteínas de soro do leite",
            "parent_id": 1,
            "is_active": true,
            "created_at": "2025-10-28T14:30:00",
            "updated_at": "2025-10-28T14:30:00"
        }
        
    Note:
        - Nome deve ser único
        - parent_id=null cria categoria raiz
        - Se parent_id fornecido, categoria pai deve existir
        - Categoria é criada como ativa por padrão
    """
    category_repo = CategoryRepository(db)
    
    try:
        # Validar se parent_id existe (se fornecido)
        if category_data.parent_id is not None:
            parent = await category_repo.get(category_data.parent_id)
            if not parent:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Categoria pai com ID {category_data.parent_id} não encontrada"
                )
        
        # Criar categoria
        category_dict = category_data.model_dump()
        category = await category_repo.create(category_dict)
        await db.commit()
        await db.refresh(category)
        
        return category
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar categoria: {str(e)}"
        )


@router.put(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Atualizar categoria",
    description="Atualiza informações de uma categoria (apenas Admin/Manager)"
)
async def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Atualizar categoria.
    
    Permite atualização parcial (apenas campos enviados são atualizados).
    Pode mover categoria para outra categoria pai.
    
    Requer permissão de ADMIN ou MANAGER.
    
    Args:
        category_id: ID da categoria a ser atualizada
        category_data: Dados a serem atualizados (campos opcionais)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin/Manager)
        
    Returns:
        CategoryResponse: Categoria atualizada
        
    Raises:
        HTTPException 400: Se:
            - Nome já estiver em uso por outra categoria
            - parent_id for inválido (categoria pai não existe)
            - Tentar definir categoria como pai dela mesma (loop)
            - Dados forem inválidos
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 404: Se categoria não for encontrada
        HTTPException 500: Se houver erro ao atualizar categoria
        
    Example Request:
        PUT /categories/2
        {
            "name": "Whey Protein Premium",
            "description": "Proteínas de soro do leite de alta qualidade"
        }
        
    Example Response:
        {
            "id": 2,
            "name": "Whey Protein Premium",
            "description": "Proteínas de soro do leite de alta qualidade",
            "parent_id": 1,
            "is_active": true,
            "created_at": "2025-10-28T14:30:00",
            "updated_at": "2025-10-28T15:45:00"
        }
        
    Note:
        - Atualização parcial: envie apenas os campos que deseja alterar
        - Pode alterar parent_id para mover categoria na hierarquia
        - Não pode definir categoria como pai dela mesma
        - Campo updated_at é atualizado automaticamente
    """
    category_repo = CategoryRepository(db)
    
    try:
        # Verificar se categoria existe
        category = await category_repo.get(category_id)
        
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Categoria com ID {category_id} não encontrada"
            )
        
        # Validar parent_id se fornecido
        update_dict = category_data.model_dump(exclude_unset=True)
        
        if 'parent_id' in update_dict and update_dict['parent_id'] is not None:
            # Não pode ser pai de si mesmo
            if update_dict['parent_id'] == category_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Categoria não pode ser pai dela mesma"
                )
            
            # Verificar se categoria pai existe
            parent = await category_repo.get(update_dict['parent_id'])
            if not parent:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Categoria pai com ID {update_dict['parent_id']} não encontrada"
                )
        
        # Atualizar categoria
        category = await category_repo.update(category_id, update_dict)
        await db.commit()
        await db.refresh(category)
        
        return category
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar categoria: {str(e)}"
        )


# ============================================================================
# ENDPOINTS DE EXCLUSÃO
# ============================================================================


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletar categoria",
    description="Desativa uma categoria (soft delete, apenas Admin)"
)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Deletar categoria (soft delete).
    
    Categoria não é removida do banco, apenas marcada como inativa.
    Não permite deletar categorias que tenham subcategorias ativas.
    
    Requer permissão de ADMIN (apenas).
    
    Args:
        category_id: ID da categoria a ser deletada
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin)
        
    Returns:
        None (Status 204 No Content)
        
    Raises:
        HTTPException 400: Se categoria tiver subcategorias ativas
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão (não Admin)
        HTTPException 404: Se categoria não for encontrada
        HTTPException 500: Se houver erro ao deletar categoria
        
    Example:
        DELETE /categories/2
        
    Note:
        - Soft delete: categoria permanece no banco para auditoria
        - is_active é alterado para false
        - Produtos da categoria são preservados
        - Não permite deletar se houver subcategorias ativas
        - Pode ser reativada posteriormente se necessário
        - Apenas ADMIN pode deletar (não Manager)
    """
    category_repo = CategoryRepository(db)
    
    try:
        # Verificar se categoria existe
        category = await category_repo.get(category_id)
        
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Categoria com ID {category_id} não encontrada"
            )
        
        # Verificar se tem subcategorias ativas
        category_with_children = await category_repo.get_with_subcategories(category_id)
        
        if category_with_children and hasattr(category_with_children, 'subcategories'):
            active_subcategories = [
                sub for sub in category_with_children.subcategories
                if sub.is_active
            ]
            
            if active_subcategories:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Não é possível deletar categoria com {len(active_subcategories)} subcategoria(s) ativa(s). Delete as subcategorias primeiro."
                )
        
        # Soft delete
        await category_repo.update(category_id, {'is_active': False})
        await db.commit()
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar categoria: {str(e)}"
        )
