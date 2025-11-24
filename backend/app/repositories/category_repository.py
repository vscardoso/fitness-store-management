"""
Repositório para operações de categorias (Category).
"""
from typing import Any, List, Optional, Sequence
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.repositories.base import BaseRepository


class CategoryRepository(BaseRepository[Category, Any, Any]):
    """Repositório para operações específicas de categorias."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(Category)
        self.db = db
    
    async def create(self, obj_in: dict, *, tenant_id: int | None = None) -> Category:
        """Wrapper para criar categoria."""
        return await super().create(self.db, obj_in, tenant_id=tenant_id)
    
    async def get_with_subcategories(self, category_id: int) -> Optional[Category]:
        """
        Busca uma categoria específica com todas as subcategorias carregadas.
        
        Args:
            category_id: ID da categoria
            
        Returns:
            Categoria com subcategorias ou None se não encontrada
        """
        query = select(Category).where(Category.id == category_id).options(
            selectinload(Category.children)
        )
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_root_categories(self) -> Sequence[Category]:
        """
        Busca todas as categorias raiz (sem parent).
        
        Returns:
            Lista de categorias raiz ordenadas por nome
        """
        query = select(Category).where(
            Category.parent_id.is_(None)
        ).order_by(Category.name)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_hierarchy(self) -> List[dict]:
        """
        Busca a árvore completa de categorias usando recursive query.
        
        Returns:
            Lista hierárquica de categorias com subcategorias aninhadas
        """
        # Query recursiva usando CTE (Common Table Expression)
        recursive_query = text("""
            WITH RECURSIVE category_tree AS (
                -- Anchor: categorias raiz
                SELECT 
                    id, 
                    name, 
                    description, 
                    parent_id,
                    0 as level,
                    name as path,
                    CAST(id AS TEXT) as id_path
                FROM categories 
                WHERE parent_id IS NULL
                
                UNION ALL
                
                -- Recursive: subcategorias
                SELECT 
                    c.id, 
                    c.name, 
                    c.description, 
                    c.parent_id,
                    ct.level + 1,
                    ct.path || ' > ' || c.name,
                    ct.id_path || '.' || CAST(c.id AS TEXT)
                FROM categories c
                INNER JOIN category_tree ct ON c.parent_id = ct.id
            )
            SELECT 
                id, 
                name, 
                description, 
                parent_id, 
                level, 
                path,
                id_path
            FROM category_tree 
            ORDER BY id_path
        """)
        
        result = await self.db.execute(recursive_query)
        rows = result.fetchall()
        
        # Converter para estrutura hierárquica
        hierarchy = []
        category_map = {}
        
        for row in rows:
            category_data = {
                'id': row.id,
                'name': row.name,
                'description': row.description,
                'parent_id': row.parent_id,
                'level': row.level,
                'path': row.path,
                'subcategories': []
            }
            
            category_map[row.id] = category_data
            
            if row.parent_id is None:
                # Categoria raiz
                hierarchy.append(category_data)
            else:
                # Subcategoria - adicionar ao parent
                if row.parent_id in category_map:
                    category_map[row.parent_id]['subcategories'].append(category_data)
        
        return hierarchy
    
    async def get_subcategories(self, parent_id: int) -> Sequence[Category]:
        """
        Busca todas as subcategorias diretas de uma categoria.
        
        Args:
            parent_id: ID da categoria pai
            
        Returns:
            Lista de subcategorias ordenadas por nome
        """
        query = select(Category).where(
            Category.parent_id == parent_id
        ).order_by(Category.name)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_category_path(self, category_id: int) -> List[Category]:
        """
        Busca o caminho completo de uma categoria até a raiz.
        
        Args:
            category_id: ID da categoria
            
        Returns:
            Lista de categorias do caminho (da raiz até a categoria)
        """
        # Query recursiva para buscar o caminho
        recursive_query = text("""
            WITH RECURSIVE category_path AS (
                -- Anchor: categoria inicial
                SELECT 
                    id, 
                    name, 
                    description, 
                    parent_id,
                    0 as level
                FROM categories 
                WHERE id = :category_id
                
                UNION ALL
                
                -- Recursive: categorias pai
                SELECT 
                    c.id, 
                    c.name, 
                    c.description, 
                    c.parent_id,
                    cp.level + 1
                FROM categories c
                INNER JOIN category_path cp ON c.id = cp.parent_id
            )
            SELECT id, name, description, parent_id, level
            FROM category_path 
            ORDER BY level DESC
        """)
        
        result = await self.db.execute(recursive_query, {'category_id': category_id})
        rows = result.fetchall()
        
        # Buscar objetos Category completos
        category_ids = [row.id for row in rows]
        if not category_ids:
            return []
        
        query = select(Category).where(Category.id.in_(category_ids))
        result = await self.db.execute(query)
        categories = {cat.id: cat for cat in result.scalars().all()}
        
        # Retornar na ordem correta (da raiz para a categoria)
        return [categories[cat_id] for cat_id in category_ids if cat_id in categories]
    
    async def get_all_descendants(self, category_id: int) -> List[dict]:
        """
        Busca todos os descendentes de uma categoria (subcategorias de qualquer nível).
        
        Args:
            category_id: ID da categoria pai
            
        Returns:
            Lista de todas as subcategorias descendentes
        """
        recursive_query = text("""
            WITH RECURSIVE category_descendants AS (
                -- Anchor: categoria inicial
                SELECT 
                    id, 
                    name, 
                    description, 
                    parent_id,
                    0 as level,
                    name as path
                FROM categories 
                WHERE id = :category_id
                
                UNION ALL
                
                -- Recursive: subcategorias
                SELECT 
                    c.id, 
                    c.name, 
                    c.description, 
                    c.parent_id,
                    cd.level + 1,
                    cd.path || ' > ' || c.name
                FROM categories c
                INNER JOIN category_descendants cd ON c.parent_id = cd.id
            )
            SELECT 
                id, 
                name, 
                description, 
                parent_id, 
                level, 
                path
            FROM category_descendants 
            WHERE level > 0  -- Excluir a categoria inicial
            ORDER BY level, name
        """)
        
        result = await self.db.execute(recursive_query, {'category_id': category_id})
        rows = result.fetchall()
        
        return [
            {
                'id': row.id,
                'name': row.name,
                'description': row.description,
                'parent_id': row.parent_id,
                'level': row.level,
                'path': row.path
            }
            for row in rows
        ]
    
    async def get_categories_by_level(self, level: int) -> Sequence[Category]:
        """
        Busca categorias por nível hierárquico.
        
        Args:
            level: Nível na hierarquia (0 = raiz, 1 = primeiro nível, etc.)
            
        Returns:
            Lista de categorias do nível especificado
        """
        if level == 0:
            return await self.get_root_categories()
        
        # Para níveis > 0, usar query recursiva
        recursive_query = text("""
            WITH RECURSIVE category_levels AS (
                -- Anchor: categorias raiz (nível 0)
                SELECT 
                    id, 
                    name, 
                    description, 
                    parent_id,
                    0 as level
                FROM categories 
                WHERE parent_id IS NULL
                
                UNION ALL
                
                -- Recursive: próximos níveis
                SELECT 
                    c.id, 
                    c.name, 
                    c.description, 
                    c.parent_id,
                    cl.level + 1
                FROM categories c
                INNER JOIN category_levels cl ON c.parent_id = cl.id
                WHERE cl.level < :target_level
            )
            SELECT id
            FROM category_levels 
            WHERE level = :target_level
            ORDER BY name
        """)
        
        result = await self.db.execute(recursive_query, {'target_level': level})
        category_ids = [row.id for row in result.fetchall()]
        
        if not category_ids:
            return []
        
        query = select(Category).where(Category.id.in_(category_ids)).order_by(Category.name)
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def has_subcategories(self, category_id: int) -> bool:
        """
        Verifica se uma categoria possui subcategorias.
        
        Args:
            category_id: ID da categoria
            
        Returns:
            True se a categoria tem subcategorias
        """
        query = select(Category.id).where(Category.parent_id == category_id).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def get_leaf_categories(self) -> Sequence[Category]:
        """
        Busca todas as categorias folha (que não têm subcategorias).
        
        Returns:
            Lista de categorias folha
        """
        # Subquery para encontrar categorias que são pais
        parent_subquery = select(Category.parent_id.distinct()).where(
            Category.parent_id.is_not(None)
        )
        
        # Query principal: categorias que NÃO estão na lista de pais
        query = select(Category).where(
            Category.id.not_in(parent_subquery)
        ).order_by(Category.name)
        
        result = await self.db.execute(query)
        return result.scalars().all()