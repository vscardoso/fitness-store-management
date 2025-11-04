"""
Repository para operações de Trip.
"""
from typing import Optional, Sequence
from datetime import datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.trip import Trip, TripStatus
from app.models.stock_entry import StockEntry
from app.repositories.base import BaseRepository


class TripRepository(BaseRepository[Trip, dict, dict]):
    """Repository para operações específicas de Trip."""
    
    def __init__(self):
        super().__init__(Trip)
    
    async def create(self, db: AsyncSession, data: dict) -> Trip:
        """
        Cria uma nova viagem.
        
        Args:
            db: Database session
            data: Dados da viagem
            
        Returns:
            Trip criado
        """
        # Calcular total_cost antes de criar
        if 'travel_cost_total' not in data:
            data['travel_cost_total'] = (
                data.get('travel_cost_fuel', 0) +
                data.get('travel_cost_food', 0) +
                data.get('travel_cost_toll', 0) +
                data.get('travel_cost_hotel', 0) +
                data.get('travel_cost_other', 0)
            )
        
        trip = await super().create(db, data)
        await db.commit()
        await db.refresh(trip)
        return trip
    
    async def get_by_id(
        self, 
        db: AsyncSession, 
        trip_id: int,
        include_entries: bool = False
    ) -> Optional[Trip]:
        """
        Busca uma viagem por ID.
        
        Args:
            db: Database session
            trip_id: ID da viagem
            include_entries: Se deve incluir entradas de estoque
            
        Returns:
            Trip encontrado ou None
        """
        query = select(Trip).where(
            and_(
                Trip.id == trip_id,
                Trip.is_active == True
            )
        )
        
        if include_entries:
            query = query.options(selectinload(Trip.stock_entries))
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_code(self, db: AsyncSession, trip_code: str) -> Optional[Trip]:
        """
        Busca uma viagem por código.
        
        Args:
            db: Database session
            trip_code: Código da viagem
            
        Returns:
            Trip encontrado ou None
        """
        query = select(Trip).where(
            and_(
                Trip.trip_code == trip_code,
                Trip.is_active == True
            )
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_all(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        status: Optional[TripStatus] = None
    ) -> Sequence[Trip]:
        """
        Busca todas as viagens com paginação e filtros.
        
        Args:
            db: Database session
            skip: Número de registros para pular
            limit: Número máximo de registros
            status: Filtrar por status (opcional)
            
        Returns:
            Lista de viagens
        """
        query = select(Trip).where(Trip.is_active == True)
        
        if status:
            query = query.where(Trip.status == status)
        
        query = query.order_by(Trip.trip_date.desc()).offset(skip).limit(limit)
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_filtered(
        self,
        db: AsyncSession,
        status: Optional[TripStatus] = None,
        start_date: Optional[any] = None,
        end_date: Optional[any] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Sequence[Trip]:
        """
        Busca viagens com filtros múltiplos.
        
        Args:
            db: Database session
            status: Filtrar por status
            start_date: Data inicial (trip_date >= start_date)
            end_date: Data final (trip_date <= end_date)
            skip: Número de registros para pular
            limit: Número máximo de registros
            
        Returns:
            Lista de viagens filtradas
        """
        query = select(Trip).where(Trip.is_active == True)
        
        if status:
            query = query.where(Trip.status == status)
        
        if start_date:
            query = query.where(Trip.trip_date >= start_date)
        
        if end_date:
            query = query.where(Trip.trip_date <= end_date)
        
        query = query.order_by(Trip.trip_date.desc()).offset(skip).limit(limit)
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_by_status(
        self, 
        db: AsyncSession, 
        status: TripStatus
    ) -> Sequence[Trip]:
        """
        Busca viagens por status.
        
        Args:
            db: Database session
            status: Status da viagem
            
        Returns:
            Lista de viagens com o status especificado
        """
        query = select(Trip).where(
            and_(
                Trip.status == status,
                Trip.is_active == True
            )
        ).order_by(Trip.trip_date.desc())
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_recent(
        self, 
        db: AsyncSession, 
        days: int = 30
    ) -> Sequence[Trip]:
        """
        Busca viagens recentes (últimos X dias).
        
        Args:
            db: Database session
            days: Número de dias para considerar como recente
            
        Returns:
            Lista de viagens recentes
        """
        cutoff_date = datetime.now().date() - timedelta(days=days)
        
        query = select(Trip).where(
            and_(
                Trip.trip_date >= cutoff_date,
                Trip.is_active == True
            )
        ).order_by(Trip.trip_date.desc())
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_with_entry_count(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100
    ) -> Sequence[tuple]:
        """
        Busca viagens com contagem de entradas de estoque.
        
        Args:
            db: Database session
            skip: Número de registros para pular
            limit: Número máximo de registros
            
        Returns:
            Lista de tuplas (Trip, entry_count)
        """
        query = (
            select(
                Trip,
                func.count(StockEntry.id).label('entry_count')
            )
            .outerjoin(StockEntry, and_(
                StockEntry.trip_id == Trip.id,
                StockEntry.is_active == True
            ))
            .where(Trip.is_active == True)
            .group_by(Trip.id)
            .order_by(Trip.trip_date.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await db.execute(query)
        return result.all()
    
    async def update(
        self, 
        db: AsyncSession, 
        trip_id: int, 
        data: dict
    ) -> Optional[Trip]:
        """
        Atualiza uma viagem.
        
        Args:
            db: Database session
            trip_id: ID da viagem
            data: Dados para atualização
            
        Returns:
            Trip atualizado ou None
        """
        trip = await self.get_by_id(db, trip_id)
        if not trip:
            return None
        
        # Atualizar campos
        for key, value in data.items():
            if hasattr(trip, key) and value is not None:
                setattr(trip, key, value)
        
        # Recalcular total se algum custo foi alterado
        cost_fields = [
            'travel_cost_fuel', 'travel_cost_food', 'travel_cost_toll',
            'travel_cost_hotel', 'travel_cost_other'
        ]
        if any(field in data for field in cost_fields):
            trip.update_total_cost()
        
        await db.commit()
        await db.refresh(trip)
        return trip
    
    async def delete(self, db: AsyncSession, trip_id: int) -> bool:
        """
        Soft delete de uma viagem.
        
        Args:
            db: Database session
            trip_id: ID da viagem
            
        Returns:
            True se deletado, False se não encontrado
        """
        trip = await self.get_by_id(db, trip_id)
        if not trip:
            return False
        
        trip.is_active = False
        await db.commit()
        return True
    
    async def count(
        self, 
        db: AsyncSession, 
        status: Optional[TripStatus] = None
    ) -> int:
        """
        Conta o número de viagens.
        
        Args:
            db: Database session
            status: Filtrar por status (opcional)
            
        Returns:
            Número de viagens
        """
        query = select(func.count(Trip.id)).where(Trip.is_active == True)
        
        if status:
            query = query.where(Trip.status == status)
        
        result = await db.execute(query)
        return result.scalar_one()
    
    async def get_destinations(self, db: AsyncSession) -> Sequence[tuple]:
        """
        Retorna lista de destinos únicos com contagem de viagens.
        
        Args:
            db: Database session
            
        Returns:
            Lista de tuplas (destination, count)
        """
        query = (
            select(
                Trip.destination,
                func.count(Trip.id).label('trip_count')
            )
            .where(Trip.is_active == True)
            .group_by(Trip.destination)
            .order_by(func.count(Trip.id).desc())
        )
        
        result = await db.execute(query)
        return result.all()
