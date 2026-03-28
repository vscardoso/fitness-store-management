"""
Serviço de gerenciamento de categorias.
"""
import re
import logging
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.repositories.category_repository import CategoryRepository
from app.schemas.category import CategoryCreate, CategoryUpdate

logger = logging.getLogger(__name__)


class CategoryService:
    """Serviço para operações de negócio com categorias."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.category_repo = CategoryRepository(db)

    # -------------------------------------------------------------------------
    # Consultas
    # -------------------------------------------------------------------------

    async def list_categories(
        self,
        *,
        tenant_id: int,
        skip: int = 0,
        limit: int = 1000,
    ) -> list[Category]:
        return await self.category_repo.get_multi(
            self.db, skip=skip, limit=limit, tenant_id=tenant_id
        )

    async def get_hierarchy(self) -> List[dict]:
        return await self.category_repo.get_hierarchy()

    async def get_category(self, category_id: int) -> Optional[Category]:
        return await self.category_repo.get_with_subcategories(category_id)

    # -------------------------------------------------------------------------
    # Criação
    # -------------------------------------------------------------------------

    async def create_category(
        self,
        data: CategoryCreate,
        *,
        tenant_id: int,
    ) -> Category:
        # Validar categoria pai
        if data.parent_id is not None:
            parent = await self.category_repo.get(self.db, data.parent_id)
            if not parent:
                raise ValueError(f"Categoria pai com ID {data.parent_id} não encontrada")

        category_dict = data.model_dump()

        # Gerar slug
        if not category_dict.get("slug"):
            slug = re.sub(r"[^\w\s-]", "", category_dict["name"].lower())
            slug = re.sub(r"[-\s]+", "-", slug)
            category_dict["slug"] = slug

        category = await self.category_repo.create(category_dict, tenant_id=tenant_id)
        await self.db.commit()
        await self.db.refresh(category)

        logger.info(f"Categoria criada: id={category.id} name={category.name}")
        return category

    # -------------------------------------------------------------------------
    # Atualização
    # -------------------------------------------------------------------------

    async def update_category(
        self,
        category_id: int,
        data: CategoryUpdate,
    ) -> Category:
        category = await self.category_repo.get(self.db, category_id)
        if not category:
            raise LookupError(f"Categoria com ID {category_id} não encontrada")

        update_dict = data.model_dump(exclude_unset=True)

        if "parent_id" in update_dict and update_dict["parent_id"] is not None:
            if update_dict["parent_id"] == category_id:
                raise ValueError("Categoria não pode ser pai dela mesma")

            parent = await self.category_repo.get(self.db, update_dict["parent_id"])
            if not parent:
                raise ValueError(
                    f"Categoria pai com ID {update_dict['parent_id']} não encontrada"
                )

        category = await self.category_repo.update(self.db, id=category_id, obj_in=update_dict)
        await self.db.commit()
        await self.db.refresh(category)

        logger.info(f"Categoria atualizada: id={category_id}")
        return category

    # -------------------------------------------------------------------------
    # Exclusão
    # -------------------------------------------------------------------------

    async def delete_category(self, category_id: int) -> None:
        category = await self.category_repo.get(self.db, category_id)
        if not category:
            raise LookupError(f"Categoria com ID {category_id} não encontrada")

        # Bloquear se tiver subcategorias ativas
        category_with_children = await self.category_repo.get_with_subcategories(category_id)
        if category_with_children and hasattr(category_with_children, "subcategories"):
            active_subs = [s for s in category_with_children.subcategories if s.is_active]
            if active_subs:
                raise ValueError(
                    f"Não é possível deletar categoria com {len(active_subs)} subcategoria(s) ativa(s). "
                    "Delete as subcategorias primeiro."
                )

        await self.category_repo.update(self.db, id=category_id, obj_in={"is_active": False})
        await self.db.commit()

        logger.info(f"Categoria desativada: id={category_id}")
