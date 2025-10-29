"""
Repositório para operações de inventário e movimentação de estoque.
"""
from datetime import datetime
from typing import Any, List, Optional, Sequence
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory import Inventory, InventoryMovement, MovementType
from app.repositories.base import BaseRepository


class InventoryRepository(BaseRepository[Inventory, Any, Any]):
    """Repositório para operações específicas de inventário."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(Inventory)
        self.db = db
    
    async def get_stock(self, product_id: int, warehouse_id: int) -> int:
        """
        Busca a quantidade em estoque de um produto em um depósito específico.
        
        Args:
            product_id: ID do produto
            warehouse_id: ID do depósito (não usado nesta implementação)
            
        Returns:
            Quantidade em estoque (0 se não encontrado)
        """
        query = select(Inventory.quantity).where(
            Inventory.product_id == product_id
        )
        
        result = await self.db.execute(query)
        stock = result.scalar_one_or_none()
        return stock if stock is not None else 0
    
    async def update_stock(
        self, 
        product_id: int, 
        warehouse_id: int, 
        quantity: int,
        movement_type: MovementType = MovementType.ADJUSTMENT,
        user_id: Optional[int] = None,
        notes: Optional[str] = None
    ) -> Inventory:
        """
        Atualiza o estoque de um produto com controle transacional.
        
        Args:
            product_id: ID do produto
            warehouse_id: ID do depósito
            quantity: Nova quantidade em estoque
            movement_type: Tipo de movimentação
            user_id: ID do usuário responsável
            notes: Observações sobre a movimentação
            
        Returns:
            Registro de inventário atualizado
            
        Raises:
            ValueError: Se a quantidade for negativa
        """
        if quantity < 0:
            raise ValueError("A quantidade em estoque não pode ser negativa")
        
        try:
            # Buscar registro de inventário existente
            inventory_query = select(Inventory).where(
                and_(
                    Inventory.product_id == product_id,
                    Inventory.warehouse_id == warehouse_id
                )
            )
            
            result = await self.db.execute(inventory_query)
            inventory = result.scalar_one_or_none()
            
            if inventory is None:
                # Criar novo registro de inventário
                inventory = Inventory(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    current_stock=quantity,
                    reserved_stock=0,
                    minimum_stock=0,
                    maximum_stock=None,
                    last_updated=datetime.utcnow()
                )
                self.db.add(inventory)
                await self.db.flush()  # Para obter o ID
                
                # Criar movimento inicial
                movement = InventoryMovement(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    movement_type=MovementType.INITIAL_STOCK,
                    quantity=quantity,
                    previous_stock=0,
                    new_stock=quantity,
                    movement_date=datetime.utcnow(),
                    user_id=user_id,
                    notes=notes or "Estoque inicial"
                )
            else:
                # Atualizar registro existente
                previous_stock = inventory.current_stock
                inventory.current_stock = quantity
                inventory.last_updated = datetime.utcnow()
                
                # Criar movimento de ajuste
                movement = InventoryMovement(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    movement_type=movement_type,
                    quantity=quantity - previous_stock,
                    previous_stock=previous_stock,
                    new_stock=quantity,
                    movement_date=datetime.utcnow(),
                    user_id=user_id,
                    notes=notes or f"Ajuste de estoque: {previous_stock} → {quantity}"
                )
            
            # Adicionar movimento
            self.db.add(movement)
            
            # Commit da transação
            await self.db.commit()
            
            return inventory
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def create_movement(
        self, 
        product_id: int,
        warehouse_id: int,
        movement_type: MovementType,
        quantity: int,
        user_id: Optional[int] = None,
        notes: Optional[str] = None
    ) -> InventoryMovement:
        """
        Cria uma movimentação de estoque e atualiza o inventário.
        
        Args:
            product_id: ID do produto
            warehouse_id: ID do depósito
            movement_type: Tipo de movimentação
            quantity: Quantidade da movimentação (positiva para entrada, negativa para saída)
            user_id: ID do usuário responsável
            notes: Observações sobre a movimentação
            
        Returns:
            Movimento de estoque criado
            
        Raises:
            ValueError: Se não houver estoque suficiente para saída
        """
        try:
            # Buscar estoque atual
            current_stock = await self.get_stock(product_id, warehouse_id)
            new_stock = current_stock + quantity
            
            # Validar se há estoque suficiente para saída
            if new_stock < 0:
                raise ValueError(
                    f"Estoque insuficiente. Atual: {current_stock}, "
                    f"Tentativa de saída: {abs(quantity)}"
                )
            
            # Atualizar estoque
            await self.update_stock(
                product_id=product_id,
                warehouse_id=warehouse_id,
                quantity=new_stock,
                movement_type=movement_type,
                user_id=user_id,
                notes=notes
            )
            
            # Buscar o movimento criado
            movement_query = select(InventoryMovement).where(
                and_(
                    InventoryMovement.product_id == product_id,
                    InventoryMovement.warehouse_id == warehouse_id,
                    InventoryMovement.movement_type == movement_type,
                    InventoryMovement.new_stock == new_stock
                )
            ).order_by(desc(InventoryMovement.movement_date)).limit(1)
            
            result = await self.db.execute(movement_query)
            movement = result.scalar_one()
            
            return movement
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def get_movements(
        self, 
        product_id: int, 
        warehouse_id: Optional[int] = None,
        limit: int = 50
    ) -> Sequence[InventoryMovement]:
        """
        Busca movimentações de estoque de um produto.
        
        Args:
            product_id: ID do produto
            warehouse_id: ID do depósito (opcional)
            limit: Número máximo de registros
            
        Returns:
            Lista de movimentações ordenadas por data (mais recentes primeiro)
        """
        conditions = [InventoryMovement.product_id == product_id]
        
        if warehouse_id is not None:
            conditions.append(InventoryMovement.warehouse_id == warehouse_id)
        
        query = (
            select(InventoryMovement)
            .where(and_(*conditions))
            .order_by(desc(InventoryMovement.movement_date))
            .limit(limit)
        )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_inventory_by_product(
        self, 
        product_id: int,
        include_relationships: bool = True
    ) -> Sequence[Inventory]:
        """
        Busca inventário de um produto em todos os depósitos.
        
        Args:
            product_id: ID do produto
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de registros de inventário
        """
        query = select(Inventory).where(Inventory.product_id == product_id)
        
        if include_relationships:
            query = query.options(
                selectinload(Inventory.product),
                selectinload(Inventory.warehouse)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_inventory_by_warehouse(
        self, 
        warehouse_id: int,
        include_relationships: bool = True
    ) -> Sequence[Inventory]:
        """
        Busca inventário de todos os produtos de um depósito.
        
        Args:
            warehouse_id: ID do depósito
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de registros de inventário
        """
        query = select(Inventory).where(Inventory.warehouse_id == warehouse_id)
        
        if include_relationships:
            query = query.options(
                selectinload(Inventory.product),
                selectinload(Inventory.warehouse)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_low_stock_items(
        self, 
        warehouse_id: Optional[int] = None
    ) -> Sequence[Inventory]:
        """
        Busca itens com estoque baixo (abaixo do mínimo).
        
        Args:
            warehouse_id: ID do depósito (opcional)
            
        Returns:
            Lista de itens com estoque baixo
        """
        conditions = [
            Inventory.current_stock <= Inventory.minimum_stock,
            Inventory.minimum_stock > 0
        ]
        
        if warehouse_id is not None:
            conditions.append(Inventory.warehouse_id == warehouse_id)
        
        query = (
            select(Inventory)
            .where(and_(*conditions))
            .options(
                selectinload(Inventory.product),
                selectinload(Inventory.warehouse)
            )
            .order_by(Inventory.current_stock)
        )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def reserve_stock(
        self, 
        product_id: int, 
        warehouse_id: int, 
        quantity: int,
        user_id: Optional[int] = None
    ) -> bool:
        """
        Reserva estoque para uma venda (sem remover do estoque atual).
        
        Args:
            product_id: ID do produto
            warehouse_id: ID do depósito
            quantity: Quantidade a reservar
            user_id: ID do usuário responsável
            
        Returns:
            True se a reserva foi bem-sucedida
            
        Raises:
            ValueError: Se não houver estoque suficiente para reservar
        """
        try:
            # Buscar inventário
            inventory_query = select(Inventory).where(
                and_(
                    Inventory.product_id == product_id,
                    Inventory.warehouse_id == warehouse_id
                )
            )
            
            result = await self.db.execute(inventory_query)
            inventory = result.scalar_one_or_none()
            
            if inventory is None:
                raise ValueError("Produto não encontrado no depósito")
            
            # Verificar se há estoque disponível
            available_stock = inventory.current_stock - inventory.reserved_stock
            if available_stock < quantity:
                raise ValueError(
                    f"Estoque insuficiente para reserva. "
                    f"Disponível: {available_stock}, Solicitado: {quantity}"
                )
            
            # Atualizar estoque reservado
            inventory.reserved_stock += quantity
            inventory.last_updated = datetime.utcnow()
            
            # Criar movimento de reserva
            movement = InventoryMovement(
                product_id=product_id,
                warehouse_id=warehouse_id,
                movement_type=MovementType.RESERVATION,
                quantity=-quantity,  # Negativo para indicar reserva
                previous_stock=inventory.current_stock,
                new_stock=inventory.current_stock,  # Estoque atual não muda
                movement_date=datetime.utcnow(),
                user_id=user_id,
                notes=f"Reserva de estoque: {quantity} unidades"
            )
            
            self.db.add(movement)
            await self.db.commit()
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def release_stock(
        self, 
        product_id: int, 
        warehouse_id: int, 
        quantity: int,
        user_id: Optional[int] = None
    ) -> bool:
        """
        Libera estoque reservado (para cancelamento de venda).
        
        Args:
            product_id: ID do produto
            warehouse_id: ID do depósito
            quantity: Quantidade a liberar
            user_id: ID do usuário responsável
            
        Returns:
            True se a liberação foi bem-sucedida
        """
        try:
            # Buscar inventário
            inventory_query = select(Inventory).where(
                and_(
                    Inventory.product_id == product_id,
                    Inventory.warehouse_id == warehouse_id
                )
            )
            
            result = await self.db.execute(inventory_query)
            inventory = result.scalar_one_or_none()
            
            if inventory is None:
                raise ValueError("Produto não encontrado no depósito")
            
            # Verificar se há estoque reservado suficiente
            if inventory.reserved_stock < quantity:
                raise ValueError(
                    f"Quantidade reservada insuficiente. "
                    f"Reservado: {inventory.reserved_stock}, Solicitado: {quantity}"
                )
            
            # Atualizar estoque reservado
            inventory.reserved_stock -= quantity
            inventory.last_updated = datetime.utcnow()
            
            # Criar movimento de liberação
            movement = InventoryMovement(
                product_id=product_id,
                warehouse_id=warehouse_id,
                movement_type=MovementType.RELEASE,
                quantity=quantity,  # Positivo para indicar liberação
                previous_stock=inventory.current_stock,
                new_stock=inventory.current_stock,  # Estoque atual não muda
                movement_date=datetime.utcnow(),
                user_id=user_id,
                notes=f"Liberação de estoque reservado: {quantity} unidades"
            )
            
            self.db.add(movement)
            await self.db.commit()
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            raise e