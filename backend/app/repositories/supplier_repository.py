"""
Repositório de Fornecedores e SupplierProduct.
"""
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.supplier import Supplier
from app.models.supplier_product import SupplierProduct
from app.repositories.base import BaseRepository
from app.schemas.supplier import SupplierCreate, SupplierUpdate


class SupplierRepository(BaseRepository[Supplier, SupplierCreate, SupplierUpdate]):
    def __init__(self):
        super().__init__(Supplier)

    async def list_active(
        self,
        db: AsyncSession,
        *,
        tenant_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 200,
    ) -> List[Supplier]:
        stmt = (
            select(Supplier)
            .where(Supplier.is_active == True)
            .order_by(Supplier.name)
            .offset(skip)
            .limit(limit)
        )
        if tenant_id is not None:
            stmt = stmt.where(Supplier.tenant_id == tenant_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_product(
        self,
        db: AsyncSession,
        *,
        product_id: int,
        tenant_id: Optional[int] = None,
    ) -> List[SupplierProduct]:
        """Retorna todos os SupplierProduct de um produto (com supplier eager-loaded)."""
        stmt = (
            select(SupplierProduct)
            .options(
                selectinload(SupplierProduct.supplier),
                selectinload(SupplierProduct.product),
            )
            .where(
                SupplierProduct.product_id == product_id,
                SupplierProduct.is_active == True,
            )
            .order_by(SupplierProduct.last_purchase_date.desc())
        )
        if tenant_id is not None:
            stmt = stmt.where(SupplierProduct.tenant_id == tenant_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_products_by_supplier(
        self,
        db: AsyncSession,
        *,
        supplier_id: int,
        tenant_id: Optional[int] = None,
    ) -> List[SupplierProduct]:
        """Retorna todos os SupplierProduct de um fornecedor (com product eager-loaded)."""
        stmt = (
            select(SupplierProduct)
            .options(
                selectinload(SupplierProduct.supplier),
                selectinload(SupplierProduct.product),
            )
            .where(
                SupplierProduct.supplier_id == supplier_id,
                SupplierProduct.is_active == True,
            )
            .order_by(SupplierProduct.last_purchase_date.desc())
        )
        if tenant_id is not None:
            stmt = stmt.where(SupplierProduct.tenant_id == tenant_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_supplier_product(
        self,
        db: AsyncSession,
        *,
        supplier_id: int,
        product_id: int,
        tenant_id: Optional[int] = None,
    ) -> Optional[SupplierProduct]:
        """Busca o vínculo específico supplier+product+tenant."""
        stmt = select(SupplierProduct).where(
            SupplierProduct.supplier_id == supplier_id,
            SupplierProduct.product_id == product_id,
        )
        if tenant_id is not None:
            stmt = stmt.where(SupplierProduct.tenant_id == tenant_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
