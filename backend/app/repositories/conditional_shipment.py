"""
Repository para envios condicionais.
"""
from typing import List, Optional, Dict, Any
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime

from app.models.conditional_shipment import ConditionalShipment, ConditionalShipmentItem
from app.repositories.base import BaseRepository
from app.schemas.conditional_shipment import (
    ConditionalShipmentCreate,
    ConditionalShipmentUpdate,
)


class ConditionalShipmentRepository(
    BaseRepository[ConditionalShipment, ConditionalShipmentCreate, ConditionalShipmentUpdate]
):
    """Repository para operações de envio condicional"""
    
    def __init__(self):
        super().__init__(ConditionalShipment)
    
    async def create_with_items(
        self,
        db: AsyncSession,
        tenant_id: int,
        shipment_data: ConditionalShipmentCreate,
    ) -> ConditionalShipment:
        """
        Cria envio condicional com seus itens.
        
        Args:
            db: Sessão do banco
            tenant_id: ID do tenant
            shipment_data: Dados do envio com items
            
        Returns:
            ConditionalShipment criado com items carregados
        """
        # Criar shipment
        shipment = ConditionalShipment(
            tenant_id=tenant_id,
            customer_id=shipment_data.customer_id,
            shipping_address=shipment_data.shipping_address,
            notes=shipment_data.notes,
            status="PENDING",
        )
        
        db.add(shipment)
        await db.flush()  # Gera ID do shipment
        
        # Criar items
        for item_data in shipment_data.items:
            item = ConditionalShipmentItem(
                shipment_id=shipment.id,
                product_id=item_data.product_id,
                quantity_sent=item_data.quantity_sent,
                unit_price=item_data.unit_price,
                notes=item_data.notes,
                status="SENT",
            )
            db.add(item)
        
        await db.commit()
        await db.refresh(shipment)
        
        # Carregar items
        stmt = (
            select(ConditionalShipment)
            .where(ConditionalShipment.id == shipment.id)
            .options(selectinload(ConditionalShipment.items))
        )
        result = await db.execute(stmt)
        return result.scalar_one()
    
    async def get_with_items(
        self,
        db: AsyncSession,
        shipment_id: int,
        tenant_id: int,
    ) -> Optional[ConditionalShipment]:
        """
        Busca envio por ID com items carregados.
        
        Args:
            db: Sessão do banco
            shipment_id: ID do envio
            tenant_id: ID do tenant (segurança multi-tenancy)
            
        Returns:
            ConditionalShipment com items ou None
        """
        stmt = (
            select(ConditionalShipment)
            .where(
                and_(
                    ConditionalShipment.id == shipment_id,
                    ConditionalShipment.tenant_id == tenant_id,
                    ConditionalShipment.is_active == True,
                )
            )
            .options(selectinload(ConditionalShipment.items))
        )
        
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_by_tenant(
        self,
        db: AsyncSession,
        tenant_id: int,
        *,
        status: Optional[str] = None,
        customer_id: Optional[int] = None,
        is_overdue: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[ConditionalShipment]:
        """
        Lista envios condicionais com filtros.
        
        Args:
            db: Sessão do banco
            tenant_id: ID do tenant
            status: Filtro por status (opcional)
            customer_id: Filtro por cliente (opcional)
            is_overdue: Filtro por atrasados (opcional)
            skip: Offset para paginação
            limit: Limite de resultados
            
        Returns:
            Lista de ConditionalShipment com items carregados
        """
        conditions = [
            ConditionalShipment.tenant_id == tenant_id,
            ConditionalShipment.is_active == True,
        ]
        
        if status:
            conditions.append(ConditionalShipment.status == status)
        
        if customer_id:
            conditions.append(ConditionalShipment.customer_id == customer_id)
        
        if is_overdue is True:
            # Atrasados: deadline passou e status ainda é SENT ou PARTIAL_RETURN
            conditions.append(
                and_(
                    ConditionalShipment.deadline < datetime.utcnow(),
                    ConditionalShipment.status.in_(["SENT", "PARTIAL_RETURN"]),
                )
            )
        
        stmt = (
            select(ConditionalShipment)
            .where(and_(*conditions))
            .options(selectinload(ConditionalShipment.items))
            .order_by(ConditionalShipment.deadline.asc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    async def update_status(
        self,
        db: AsyncSession,
        shipment_id: int,
        tenant_id: int,
        new_status: str,
    ) -> Optional[ConditionalShipment]:
        """
        Atualiza status do envio.
        
        Args:
            db: Sessão do banco
            shipment_id: ID do envio
            tenant_id: ID do tenant
            new_status: Novo status
            
        Returns:
            ConditionalShipment atualizado ou None
        """
        shipment = await self.get_with_items(db, shipment_id, tenant_id)
        if not shipment:
            return None
        
        shipment.status = new_status
        
        # Atualizar timestamps
        if new_status == "SENT" and not shipment.sent_at:
            shipment.sent_at = datetime.utcnow()
        elif new_status == "COMPLETED":
            shipment.completed_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(shipment)
        return shipment
    
    async def mark_as_sent(
        self,
        db: AsyncSession,
        shipment_id: int,
        tenant_id: int,
        deadline_days: int = 7,
    ) -> Optional[ConditionalShipment]:
        """
        Marca envio como SENT e define deadline.
        
        Args:
            db: Sessão do banco
            shipment_id: ID do envio
            tenant_id: ID do tenant
            deadline_days: Prazo em dias (padrão 7)
            
        Returns:
            ConditionalShipment atualizado
        """
        from datetime import timedelta
        
        shipment = await self.get_with_items(db, shipment_id, tenant_id)
        if not shipment:
            return None
        
        shipment.status = "SENT"
        shipment.sent_at = datetime.utcnow()
        shipment.deadline = datetime.utcnow() + timedelta(days=deadline_days)
        
        await db.commit()
        await db.refresh(shipment)
        return shipment
    
    async def get_overdue_shipments(
        self,
        db: AsyncSession,
        tenant_id: int,
    ) -> List[ConditionalShipment]:
        """
        Busca todos os envios atrasados.
        
        Args:
            db: Sessão do banco
            tenant_id: ID do tenant
            
        Returns:
            Lista de envios atrasados
        """
        now = datetime.utcnow()
        
        stmt = (
            select(ConditionalShipment)
            .where(
                and_(
                    ConditionalShipment.tenant_id == tenant_id,
                    ConditionalShipment.is_active == True,
                    ConditionalShipment.deadline < now,
                    ConditionalShipment.status.in_(["SENT", "PARTIAL_RETURN"]),
                )
            )
            .options(selectinload(ConditionalShipment.items))
        )
        
        result = await db.execute(stmt)
        return list(result.scalars().all())


class ConditionalShipmentItemRepository:
    """Repository para itens de envio condicional"""
    
    async def update_item(
        self,
        db: AsyncSession,
        item_id: int,
        quantity_kept: int,
        quantity_returned: int,
        status: str,
        notes: Optional[str] = None,
    ) -> Optional[ConditionalShipmentItem]:
        """
        Atualiza item durante processamento de devolução.
        
        Args:
            db: Sessão do banco
            item_id: ID do item
            quantity_kept: Quantidade que cliente ficou
            quantity_returned: Quantidade devolvida
            status: Novo status
            notes: Observações
            
        Returns:
            ConditionalShipmentItem atualizado
        """
        stmt = select(ConditionalShipmentItem).where(
            ConditionalShipmentItem.id == item_id
        )
        result = await db.execute(stmt)
        item = result.scalar_one_or_none()
        
        if not item:
            return None
        
        item.quantity_kept = quantity_kept
        item.quantity_returned = quantity_returned
        item.status = status
        if notes:
            item.notes = notes
        
        await db.commit()
        await db.refresh(item)
        return item
    
    async def get_by_shipment(
        self,
        db: AsyncSession,
        shipment_id: int,
    ) -> List[ConditionalShipmentItem]:
        """
        Busca todos os itens de um envio.
        
        Args:
            db: Sessão do banco
            shipment_id: ID do envio
            
        Returns:
            Lista de itens
        """
        stmt = (
            select(ConditionalShipmentItem)
            .where(ConditionalShipmentItem.shipment_id == shipment_id)
            .where(ConditionalShipmentItem.is_active == True)
        )
        
        result = await db.execute(stmt)
        return list(result.scalars().all())
