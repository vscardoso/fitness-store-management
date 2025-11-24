"""
Repository de inventário com operações CRUD e controle de estoque.
"""
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Sequence, Optional, Dict, Any
from decimal import Decimal
from datetime import datetime

from ..models.inventory import Inventory, InventoryMovement, MovementType
from ..models.product import Product
from .base import BaseRepository


class InventoryRepository(BaseRepository[Inventory, dict, dict]):
    """Repository para gestão de inventário."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(session)
        self.model = Inventory
        self.session = session
    
    async def get_stock(self, product_id: int, *, tenant_id: int | None = None) -> int:
        """
        Busca o estoque atual de um produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Quantidade em estoque (0 se não encontrado)
        """
        query = select(Inventory.quantity).where(Inventory.product_id == product_id)
        if tenant_id is not None:
            query = query.where(Inventory.tenant_id == tenant_id)
        
        result = await self.session.execute(query)
        stock = result.scalar_one_or_none()
        return stock if stock is not None else 0
    
    async def update_stock(
        self, 
        product_id: int, 
        quantity: int,
        movement_type: MovementType = MovementType.ADJUSTMENT,
        notes: str = None,
        reference_id: str = None,
        *,
        tenant_id: int | None = None,
    ) -> Inventory:
        """
        Atualiza o estoque de um produto.
        
        Args:
            product_id: ID do produto
            quantity: Nova quantidade
            movement_type: Tipo de movimentação
            notes: Observações
            reference_id: ID de referência
            
        Returns:
            Registro de inventário atualizado
        """
        # Buscar ou criar registro de inventário
        inventory = await self.get_by_product(product_id, tenant_id=tenant_id)
        
        if not inventory:
            # Criar novo registro
            inventory_data = {
                "product_id": product_id,
                "quantity": quantity,
                "min_stock": 5  # Default
            }
            inventory = await self.create(db=self.session, obj_in=inventory_data, tenant_id=tenant_id)
        else:
            # Atualizar existente
            previous_stock = inventory.quantity
            inventory.quantity = quantity
            
            # Criar movimento
            movement_data = {
                "inventory_id": inventory.id,
                "movement_type": movement_type,
                "quantity_before": previous_stock,
                "quantity_change": quantity - previous_stock,
                "quantity_after": quantity,
                "reference_id": reference_id,
                "notes": notes
            }
            
            movement = InventoryMovement(**movement_data)
            if tenant_id is not None:
                movement.tenant_id = tenant_id
            self.session.add(movement)
        
        await self.session.commit()
        await self.session.refresh(inventory)
        return inventory
    
    async def get_by_product(self, product_id: int, *, tenant_id: int | None = None) -> Optional[Inventory]:
        """Busca inventário por produto."""
        query = select(Inventory).where(Inventory.product_id == product_id)
        if tenant_id is not None:
            query = query.where(Inventory.tenant_id == tenant_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def add_stock(
        self,
        product_id: int,
        quantity: int,
        movement_type: MovementType = MovementType.PURCHASE,
        notes: str = None,
        reference_id: str = None,
        *,
        tenant_id: int | None = None,
    ) -> Inventory:
        """
        Adiciona estoque de um produto.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a adicionar
            movement_type: Tipo de movimentação
            notes: Observações
            reference_id: ID de referência
            tenant_id: ID do tenant
            
        Returns:
            Registro de inventário atualizado
        """
        current_stock = await self.get_stock(product_id, tenant_id=tenant_id)
        new_stock = current_stock + quantity
        
        return await self.update_stock(
            product_id=product_id,
            quantity=new_stock,
            movement_type=movement_type,
            notes=notes,
            reference_id=reference_id,
            tenant_id=tenant_id,
        )
    
    async def remove_stock(
        self,
        product_id: int,
        quantity: int,
        movement_type: MovementType = MovementType.SALE,
        notes: str = None,
        reference_id: str = None,
        *,
        tenant_id: int | None = None,
    ) -> Inventory:
        """
        Remove estoque de um produto.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a remover
            movement_type: Tipo de movimentação
            notes: Observações
            reference_id: ID de referência
            
        Returns:
            Registro de inventário atualizado
            
        Raises:
            ValueError: Se não há estoque suficiente
        """
        current_stock = await self.get_stock(product_id, tenant_id=tenant_id)
        
        if current_stock < quantity:
            raise ValueError(
                f"Estoque insuficiente. Atual: {current_stock}, "
                f"Solicitado: {quantity}"
            )
        
        new_stock = current_stock - quantity
        
        return await self.update_stock(
            product_id=product_id,
            quantity=new_stock,
            movement_type=movement_type,
            notes=notes,
            reference_id=reference_id,
            tenant_id=tenant_id,
        )
    
    async def get_low_stock_products(self, threshold: int = None, *, tenant_id: int | None = None) -> Sequence[Inventory]:
        """
        Busca produtos com estoque baixo.
        
        Args:
            threshold: Limite personalizado (usa min_stock se None)
            
        Returns:
            Lista de inventários com estoque baixo
        """
        if threshold is not None:
            query = select(Inventory).options(
                selectinload(Inventory.product)
            ).where(Inventory.quantity <= threshold)
        else:
            query = select(Inventory).options(
                selectinload(Inventory.product)
            ).where(Inventory.quantity <= Inventory.min_stock)
        if tenant_id is not None:
            query = query.where(Inventory.tenant_id == tenant_id)
        
        result = await self.session.execute(query)
        return result.unique().scalars().all()
    
    async def get_movements_by_product(
        self, 
        product_id: int,
        limit: int = 100,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[InventoryMovement]:
        """Busca movimentações de um produto."""
        inventory = await self.get_by_product(product_id, tenant_id=tenant_id)
        if not inventory:
            return []
        
        query = select(InventoryMovement).where(
            InventoryMovement.inventory_id == inventory.id
        )
        if tenant_id is not None:
            query = query.where(InventoryMovement.tenant_id == tenant_id)
        
        query = query.order_by(InventoryMovement.created_at.desc()).limit(limit)
        
        result = await self.session.execute(query)
        return result.scalars().all()
    
    async def create_movement(
        self,
        inventory_id: int,
        movement_type: MovementType,
        quantity_before: int,
        quantity_change: int,
        quantity_after: int,
        reference_id: str = None,
        notes: str = None,
        *,
        tenant_id: int | None = None,
    ) -> InventoryMovement:
        """Cria uma movimentação de estoque."""
        movement_data = {
            "inventory_id": inventory_id,
            "movement_type": movement_type,
            "quantity_before": quantity_before,
            "quantity_change": quantity_change,
            "quantity_after": quantity_after,
            "reference_id": reference_id,
            "notes": notes
        }
        
        movement = InventoryMovement(**movement_data)
        if tenant_id is not None:
            movement.tenant_id = tenant_id
        self.session.add(movement)
        await self.session.commit()
        await self.session.refresh(movement)
        return movement