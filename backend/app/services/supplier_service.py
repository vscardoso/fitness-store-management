"""
Service de Fornecedores: CRUD + upsert de SupplierProduct.
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.supplier_product import SupplierProduct
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.supplier import SupplierCreate, SupplierUpdate

_repo = SupplierRepository()


class SupplierService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─────────────────────────────────────────────
    # CRUD de Fornecedores
    # ─────────────────────────────────────────────

    async def list_suppliers(
        self,
        tenant_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 200,
    ) -> List[Supplier]:
        return await _repo.list_active(self.db, tenant_id=tenant_id, skip=skip, limit=limit)

    async def get_supplier(
        self,
        supplier_id: int,
        tenant_id: Optional[int] = None,
    ) -> Optional[Supplier]:
        return await _repo.get(self.db, supplier_id, tenant_id=tenant_id)

    async def create_supplier(
        self,
        data: SupplierCreate,
        tenant_id: Optional[int] = None,
    ) -> Supplier:
        obj = Supplier(**data.model_dump(), tenant_id=tenant_id)
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def update_supplier(
        self,
        supplier_id: int,
        data: SupplierUpdate,
        tenant_id: Optional[int] = None,
    ) -> Optional[Supplier]:
        supplier = await _repo.get(self.db, supplier_id, tenant_id=tenant_id)
        if not supplier:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(supplier, field, value)
        await self.db.commit()
        await self.db.refresh(supplier)
        return supplier

    async def delete_supplier(
        self,
        supplier_id: int,
        tenant_id: Optional[int] = None,
    ) -> bool:
        supplier = await _repo.get(self.db, supplier_id, tenant_id=tenant_id)
        if not supplier:
            return False
        supplier.is_active = False
        await self.db.commit()
        return True

    # ─────────────────────────────────────────────
    # Produtos por fornecedor / fornecedores por produto
    # ─────────────────────────────────────────────

    async def get_supplier_products(
        self,
        supplier_id: int,
        tenant_id: Optional[int] = None,
    ) -> List[SupplierProduct]:
        """Retorna todos os produtos comprados de um fornecedor."""
        return await _repo.get_products_by_supplier(
            self.db, supplier_id=supplier_id, tenant_id=tenant_id
        )

    async def get_product_suppliers(
        self,
        product_id: int,
        tenant_id: Optional[int] = None,
    ) -> List[SupplierProduct]:
        """Retorna todos os fornecedores que vendem um produto."""
        return await _repo.get_by_product(
            self.db, product_id=product_id, tenant_id=tenant_id
        )

    # ─────────────────────────────────────────────
    # Upsert SupplierProduct
    # ─────────────────────────────────────────────

    async def upsert_supplier_product(
        self,
        supplier_id: int,
        product_id: int,
        unit_cost: Decimal,
        tenant_id: Optional[int] = None,
        purchase_date: Optional[date] = None,
    ) -> SupplierProduct:
        """
        Cria ou atualiza o vínculo Fornecedor ↔ Produto.

        - Se ainda não existir: cria com purchase_count=1.
        - Se já existir: incrementa purchase_count, atualiza last_unit_cost
          e last_purchase_date caso a data seja mais recente.
        """
        today = purchase_date or date.today()

        existing = await _repo.get_supplier_product(
            self.db,
            supplier_id=supplier_id,
            product_id=product_id,
            tenant_id=tenant_id,
        )

        if existing is None:
            sp = SupplierProduct(
                supplier_id=supplier_id,
                product_id=product_id,
                last_unit_cost=unit_cost,
                purchase_count=1,
                last_purchase_date=today,
                tenant_id=tenant_id,
            )
            self.db.add(sp)
        else:
            existing.purchase_count += 1
            existing.last_unit_cost = unit_cost
            if today >= existing.last_purchase_date:
                existing.last_purchase_date = today
            # Reativar se estava soft-deleted
            existing.is_active = True
            sp = existing

        await self.db.commit()
        await self.db.refresh(sp)
        return sp
