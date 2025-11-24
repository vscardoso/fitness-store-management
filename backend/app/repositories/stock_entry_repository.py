"""
Repository para operações de StockEntry.
"""
from typing import Optional, Sequence
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.stock_entry import StockEntry, EntryType
from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.trip import Trip
from app.repositories.base import BaseRepository


class StockEntryRepository(BaseRepository[StockEntry, dict, dict]):
    """Repository para operações específicas de StockEntry."""
    
    def __init__(self):
        super().__init__(StockEntry)
    
    async def create(self, db: AsyncSession, data: dict, *, tenant_id: int | None = None) -> StockEntry:
        """
        Cria uma nova entrada de estoque.
        
        Args:
            db: Database session
            data: Dados da entrada
            tenant_id: ID do tenant
            
        Returns:
            StockEntry criado
        """
        entry = await super().create(db, data, tenant_id=tenant_id)
        await db.commit()
        await db.refresh(entry)
        return entry
    
    async def get_by_id(
        self, 
        db: AsyncSession, 
        entry_id: int,
        include_items: bool = False,
        *,
        tenant_id: int | None = None,
    ) -> Optional[StockEntry]:
        """
        Busca uma entrada por ID.
        
        Args:
            db: Database session
            entry_id: ID da entrada
            include_items: Se deve incluir itens da entrada
            tenant_id: ID do tenant
            
        Returns:
            StockEntry encontrado ou None
        """
        conditions = [StockEntry.id == entry_id, StockEntry.is_active == True]
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            conditions.append(StockEntry.tenant_id == tenant_id)
        
        query = select(StockEntry).where(and_(*conditions))
        
        if include_items:
            query = query.options(
                selectinload(StockEntry.entry_items).selectinload(EntryItem.product),
                selectinload(StockEntry.trip)
            )
        else:
            query = query.options(selectinload(StockEntry.trip))
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_code(
        self, 
        db: AsyncSession, 
        entry_code: str,
        *,
        tenant_id: int | None = None,
    ) -> Optional[StockEntry]:
        """
        Busca uma entrada por código.
        
        Args:
            db: Database session
            entry_code: Código da entrada
            tenant_id: ID do tenant
            
        Returns:
            StockEntry encontrado ou None
        """
        conditions = [StockEntry.entry_code == entry_code, StockEntry.is_active == True]
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            conditions.append(StockEntry.tenant_id == tenant_id)
        
        query = select(StockEntry).where(and_(*conditions))
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_all(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        entry_type: Optional[EntryType] = None,
        trip_id: Optional[int] = None,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[StockEntry]:
        """
        Busca todas as entradas com paginação e filtros.
        
        Args:
            db: Database session
            skip: Número de registros para pular
            limit: Número máximo de registros
            entry_type: Filtrar por tipo de entrada
            trip_id: Filtrar por viagem
            tenant_id: ID do tenant
            
        Returns:
            Lista de entradas
        """
        query = select(StockEntry).where(StockEntry.is_active == True)
        
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            query = query.where(StockEntry.tenant_id == tenant_id)
        
        if entry_type:
            query = query.where(StockEntry.entry_type == entry_type)
        
        if trip_id:
            query = query.where(StockEntry.trip_id == trip_id)
        
        query = (
            query
            .options(selectinload(StockEntry.trip))
            .order_by(StockEntry.entry_date.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_filtered(
        self,
        db: AsyncSession,
        entry_type: Optional[EntryType] = None,
        trip_id: Optional[int] = None,
        start_date: Optional[any] = None,
        end_date: Optional[any] = None,
        skip: int = 0,
        limit: int = 100,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[StockEntry]:
        """
        Busca entradas com filtros múltiplos.
        
        Args:
            db: Database session
            entry_type: Filtrar por tipo
            trip_id: Filtrar por viagem
            start_date: Data inicial (entry_date >= start_date)
            end_date: Data final (entry_date <= end_date)
            skip: Número de registros para pular
            limit: Número máximo de registros
            tenant_id: ID do tenant
            
        Returns:
            Lista de entradas filtradas
        """
        query = select(StockEntry).where(StockEntry.is_active == True)
        
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            query = query.where(StockEntry.tenant_id == tenant_id)
        
        if entry_type:
            query = query.where(StockEntry.entry_type == entry_type)
        
        if trip_id:
            query = query.where(StockEntry.trip_id == trip_id)
        
        if start_date:
            query = query.where(StockEntry.entry_date >= start_date)
        
        if end_date:
            query = query.where(StockEntry.entry_date <= end_date)
        
        query = (
            query
            .options(selectinload(StockEntry.trip))
            .order_by(StockEntry.entry_date.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_by_trip(
        self, 
        db: AsyncSession, 
        trip_id: int,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[StockEntry]:
        """
        Busca entradas de uma viagem específica.
        
        Args:
            db: Database session
            trip_id: ID da viagem
            tenant_id: ID do tenant
            
        Returns:
            Lista de entradas da viagem
        """
        conditions = [StockEntry.trip_id == trip_id, StockEntry.is_active == True]
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            conditions.append(StockEntry.tenant_id == tenant_id)
        
        query = (
            select(StockEntry)
            .where(and_(*conditions))
            .options(selectinload(StockEntry.entry_items).selectinload(EntryItem.product))
            .order_by(StockEntry.entry_date.desc())
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_by_supplier(
        self,
        db: AsyncSession,
        supplier_name: str,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[StockEntry]:
        """
        Busca entradas de um fornecedor específico.
        
        Args:
            db: Database session
            supplier_name: Nome do fornecedor
            tenant_id: ID do tenant
            
        Returns:
            Lista de entradas do fornecedor
        """
        conditions = [
            StockEntry.supplier_name.ilike(f"%{supplier_name}%"),
            StockEntry.is_active == True
        ]
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            conditions.append(StockEntry.tenant_id == tenant_id)
        
        query = (
            select(StockEntry)
            .where(and_(*conditions))
            .order_by(StockEntry.entry_date.desc())
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_best_performing(
        self,
        db: AsyncSession,
        limit: int = 10,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[tuple]:
        """
        Busca entradas com melhor performance (maior ROI - taxa de venda).
        
        ROI calculado como: (quantidade_vendida / quantidade_recebida) * 100
        
        Args:
            db: Database session
            limit: Número máximo de resultados
            tenant_id: ID do tenant
            
        Returns:
            Lista de tuplas (StockEntry, sell_through_rate)
        """
        # Subquery para calcular sell-through rate
        subquery = (
            select(
                EntryItem.entry_id,
                func.sum(EntryItem.quantity_received).label('total_received'),
                func.sum(EntryItem.quantity_received - EntryItem.quantity_remaining).label('total_sold')
            )
            .where(EntryItem.is_active == True)
            .group_by(EntryItem.entry_id)
            .subquery()
        )
        
        query = (
            select(
                StockEntry,
                (subquery.c.total_sold * 100.0 / subquery.c.total_received).label('sell_through_rate')
            )
            .join(subquery, StockEntry.id == subquery.c.entry_id)
            .where(StockEntry.is_active == True)
        )
        
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            query = query.where(StockEntry.tenant_id == tenant_id)
        
        query = query.order_by((subquery.c.total_sold * 100.0 / subquery.c.total_received).desc()).limit(limit)
        
        result = await db.execute(query)
        return result.all()
    
    async def get_slow_moving(
        self,
        db: AsyncSession,
        min_days: int = 60,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[tuple]:
        """
        Busca entradas com produtos parados (sem movimento há X dias).
        
        Args:
            db: Database session
            min_days: Mínimo de dias sem movimento
            tenant_id: ID do tenant
            
        Returns:
            Lista de tuplas (StockEntry, EntryItem, days_since_entry)
        """
        cutoff_date = datetime.now().date() - timedelta(days=min_days)
        
        conditions = [
            StockEntry.entry_date <= cutoff_date,
            StockEntry.is_active == True,
            EntryItem.is_active == True,
            EntryItem.quantity_remaining > 0,
            (EntryItem.quantity_received - EntryItem.quantity_remaining) * 100.0 / EntryItem.quantity_received < 20
        ]
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            conditions.append(StockEntry.tenant_id == tenant_id)
        
        query = (
            select(
                StockEntry,
                EntryItem,
                (func.julianday('now') - func.julianday(StockEntry.entry_date)).label('days_since_entry')
            )
            .join(EntryItem, EntryItem.entry_id == StockEntry.id)
            .where(and_(*conditions))
            .options(
                selectinload(StockEntry.trip),
                selectinload(EntryItem.product)
            )
            .order_by((func.julianday('now') - func.julianday(StockEntry.entry_date)).desc())
        )
        
        result = await db.execute(query)
        return result.all()
    
    async def get_recent(
        self,
        db: AsyncSession,
        days: int = 30,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[StockEntry]:
        """
        Busca entradas recentes (últimos X dias).
        
        Args:
            db: Database session
            days: Número de dias
            tenant_id: ID do tenant
            
        Returns:
            Lista de entradas recentes
        """
        cutoff_date = datetime.now().date() - timedelta(days=days)
        
        conditions = [
            StockEntry.entry_date >= cutoff_date,
            StockEntry.is_active == True
        ]
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            conditions.append(StockEntry.tenant_id == tenant_id)
        
        query = (
            select(StockEntry)
            .where(and_(*conditions))
            .options(selectinload(StockEntry.trip))
            .order_by(StockEntry.entry_date.desc())
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def update(
        self, 
        db: AsyncSession, 
        entry_id: int, 
        data: dict,
        *,
        tenant_id: int | None = None,
    ) -> Optional[StockEntry]:
        """
        Atualiza uma entrada.
        
        Args:
            db: Database session
            entry_id: ID da entrada
            data: Dados para atualização
            tenant_id: ID do tenant
            
        Returns:
            StockEntry atualizado ou None
        """
        entry = await self.get_by_id(db, entry_id, tenant_id=tenant_id)
        if not entry:
            return None
        
        # Atualizar campos
        for key, value in data.items():
            if hasattr(entry, key) and value is not None:
                setattr(entry, key, value)
        
        await db.commit()
        await db.refresh(entry)
        return entry
    
    async def delete(
        self, 
        db: AsyncSession, 
        entry_id: int,
        *,
        tenant_id: int | None = None,
    ) -> bool:
        """
        Soft delete de uma entrada.
        
        Args:
            db: Database session
            entry_id: ID da entrada
            tenant_id: ID do tenant
            
        Returns:
            True se deletado, False se não encontrado
        """
        entry = await self.get_by_id(db, entry_id, tenant_id=tenant_id)
        if not entry:
            return False
        
        entry.is_active = False
        await db.commit()
        return True
    
    async def count(
        self, 
        db: AsyncSession,
        entry_type: Optional[EntryType] = None,
        *,
        tenant_id: int | None = None,
    ) -> int:
        """
        Conta o número de entradas.
        
        Args:
            db: Database session
            entry_type: Filtrar por tipo
            tenant_id: ID do tenant
            
        Returns:
            Número de entradas
        """
        query = select(func.count(StockEntry.id)).where(StockEntry.is_active == True)
        
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            query = query.where(StockEntry.tenant_id == tenant_id)
        
        if entry_type:
            query = query.where(StockEntry.entry_type == entry_type)
        
        result = await db.execute(query)
        return result.scalar_one()
    
    async def get_suppliers(
        self, 
        db: AsyncSession,
        *,
        tenant_id: int | None = None,
    ) -> Sequence[tuple]:
        """
        Retorna lista de fornecedores únicos com contagem de entradas.
        
        Args:
            db: Database session
            tenant_id: ID do tenant
            
        Returns:
            Lista de tuplas (supplier_name, entry_count, total_spent)
        """
        query = (
            select(
                StockEntry.supplier_name,
                func.count(StockEntry.id).label('entry_count'),
                func.sum(StockEntry.total_cost).label('total_spent')
            )
            .where(StockEntry.is_active == True)
        )
        
        if tenant_id is not None and hasattr(StockEntry, "tenant_id"):
            query = query.where(StockEntry.tenant_id == tenant_id)
        
        query = query.group_by(StockEntry.supplier_name).order_by(func.count(StockEntry.id).desc())
        
        result = await db.execute(query)
        return result.all()
