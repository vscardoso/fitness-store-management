"""
Serviço de gerenciamento de viagens (Trip).
"""
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func

from app.models.trip import Trip, TripStatus
from app.repositories.trip_repository import TripRepository
from app.repositories.stock_entry_repository import StockEntryRepository
from app.repositories.entry_item_repository import EntryItemRepository
from app.schemas.trip import TripCreate, TripUpdate


class TripService:
    """Serviço para operações de negócio com viagens."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de viagens.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.trip_repo = TripRepository()
        self.entry_repo = StockEntryRepository()
        self.item_repo = EntryItemRepository()
    
    async def create_trip(
        self, 
        trip_data: TripCreate,
        user_id: int
    ) -> Trip:
        """
        Cria uma nova viagem.
        
        Args:
            trip_data: Dados da viagem
            user_id: ID do usuário que está criando
            
        Returns:
            Trip: Viagem criada
            
        Raises:
            ValueError: Se trip_code já existe ou dados inválidos
        """
        try:
            # Verificar trip_code único
            existing = await self.trip_repo.get_by_code(self.db, trip_data.trip_code)
            if existing:
                raise ValueError(f"Trip code {trip_data.trip_code} já existe")
            
            # Criar trip
            trip_dict = trip_data.model_dump(exclude_unset=True)
            
            # Calcular total_cost
            trip_dict['travel_cost_total'] = (
                trip_dict.get('travel_cost_fuel', Decimal('0.00')) +
                trip_dict.get('travel_cost_food', Decimal('0.00')) +
                trip_dict.get('travel_cost_toll', Decimal('0.00')) +
                trip_dict.get('travel_cost_hotel', Decimal('0.00')) +
                trip_dict.get('travel_cost_other', Decimal('0.00'))
            )
            
            trip = await self.trip_repo.create(self.db, trip_dict)
            
            return trip
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def get_trips_filtered(
        self,
        status: Optional[TripStatus] = None,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Trip]:
        """
        Lista viagens com filtros.
        
        Args:
            status: Filtrar por status
            start_date: Data inicial
            end_date: Data final
            skip: Registros para pular
            limit: Limite de registros
            
        Returns:
            Lista de viagens filtradas
        """
        return await self.trip_repo.get_filtered(
            self.db,
            status=status,
            start_date=start_date,
            end_date=end_date,
            skip=skip,
            limit=limit
        )
    
    async def get_trip_analytics(
        self, 
        trip_id: int
    ) -> Dict[str, Any]:
        """
        Obtém análises e métricas detalhadas de uma viagem.
        
        Calcula:
        - Total investido em produtos
        - ROI (Return on Investment)
        - Número de entradas e itens
        - Taxa de venda (sell-through rate)
        
        Args:
            trip_id: ID da viagem
            
        Returns:
            Dict com análises da viagem
            
        Raises:
            ValueError: Se viagem não encontrada
        """
        # Buscar viagem
        trip = await self.trip_repo.get_by_id(self.db, trip_id, include_entries=True)
        if not trip:
            raise ValueError(f"Trip {trip_id} não encontrada")
        
        # Buscar entradas da viagem
        entries = await self.entry_repo.get_by_trip(self.db, trip_id)
        
        # Calcular métricas
        total_entries = len(entries)
        total_invested = Decimal('0.00')
        total_items = 0
        total_quantity_purchased = 0
        total_quantity_sold = 0
        
        for entry in entries:
            total_invested += entry.total_cost
            
            # Buscar itens da entrada
            items = await self.item_repo.get_by_entry(self.db, entry.id)
            total_items += len(items)
            
            for item in items:
                total_quantity_purchased += item.quantity_received
                total_quantity_sold += (item.quantity_received - item.quantity_remaining)
        
        # Calcular sell-through rate
        sell_through_rate = 0.0
        if total_quantity_purchased > 0:
            sell_through_rate = (total_quantity_sold / total_quantity_purchased) * 100
        
        # Calcular ROI simplificado
        # ROI = (Receita - Custo) / Custo * 100
        # Aqui usamos sell-through rate como proxy de retorno
        roi = sell_through_rate - 100  # Simplificado
        
        # Total de custos (viagem + produtos)
        total_cost = float(trip.travel_cost_total) + float(total_invested)
        
        return {
            "trip_id": trip.id,
            "trip_code": trip.trip_code,
            "destination": trip.destination,
            "status": trip.status,
            "trip_date": trip.trip_date,
            
            # Custos
            "travel_cost_total": float(trip.travel_cost_total),
            "travel_cost_breakdown": {
                "fuel": float(trip.travel_cost_fuel),
                "food": float(trip.travel_cost_food),
                "toll": float(trip.travel_cost_toll),
                "hotel": float(trip.travel_cost_hotel),
                "other": float(trip.travel_cost_other),
            },
            
            # Investimento em produtos
            "total_invested": float(total_invested),
            "total_cost": total_cost,
            
            # Métricas de compra
            "total_entries": total_entries,
            "total_items": total_items,
            "total_quantity_purchased": total_quantity_purchased,
            "total_quantity_sold": total_quantity_sold,
            "quantity_remaining": total_quantity_purchased - total_quantity_sold,
            
            # Performance
            "sell_through_rate": round(sell_through_rate, 2),
            "roi": round(roi, 2),
            
            # Tempo
            "duration_hours": trip.duration_hours,
        }
    
    async def compare_trips(
        self, 
        trip_ids: List[int]
    ) -> Dict[str, Any]:
        """
        Compara performance de múltiplas viagens.
        
        Args:
            trip_ids: Lista de IDs das viagens a comparar
            
        Returns:
            Dict com comparação das viagens
        """
        if len(trip_ids) < 2:
            raise ValueError("É necessário ao menos 2 viagens para comparar")
        
        # Obter analytics de cada viagem
        trips_analytics = []
        for trip_id in trip_ids:
            try:
                analytics = await self.get_trip_analytics(trip_id)
                trips_analytics.append(analytics)
            except ValueError:
                continue  # Pular viagens não encontradas
        
        if len(trips_analytics) < 2:
            raise ValueError("Não foram encontradas viagens suficientes para comparar")
        
        # Calcular médias e totais
        total_invested = sum(t["total_invested"] for t in trips_analytics)
        avg_invested = total_invested / len(trips_analytics)
        
        total_items = sum(t["total_items"] for t in trips_analytics)
        avg_sell_through = sum(t["sell_through_rate"] for t in trips_analytics) / len(trips_analytics)
        
        # Encontrar melhor e pior
        best_trip = max(trips_analytics, key=lambda x: x["sell_through_rate"])
        worst_trip = min(trips_analytics, key=lambda x: x["sell_through_rate"])
        
        return {
            "trips_compared": len(trips_analytics),
            "trips": trips_analytics,
            
            "summary": {
                "total_invested": total_invested,
                "average_invested": avg_invested,
                "total_items": total_items,
                "average_sell_through_rate": round(avg_sell_through, 2),
            },
            
            "best_performer": {
                "trip_code": best_trip["trip_code"],
                "sell_through_rate": best_trip["sell_through_rate"],
                "roi": best_trip["roi"],
            },
            
            "worst_performer": {
                "trip_code": worst_trip["trip_code"],
                "sell_through_rate": worst_trip["sell_through_rate"],
                "roi": worst_trip["roi"],
            },
        }
    
    async def update_trip_status(
        self, 
        trip_id: int, 
        status: TripStatus
    ) -> Trip:
        """
        Atualiza o status de uma viagem.
        
        Args:
            trip_id: ID da viagem
            status: Novo status
            
        Returns:
            Trip: Viagem atualizada
            
        Raises:
            ValueError: Se viagem não encontrada
        """
        trip = await self.trip_repo.get_by_id(self.db, trip_id)
        if not trip:
            raise ValueError(f"Trip {trip_id} não encontrada")
        
        # Validações de transição de status
        if trip.status == TripStatus.COMPLETED and status != TripStatus.COMPLETED:
            raise ValueError("Não é possível alterar o status de uma viagem completada")
        
        # Atualizar status
        updated = await self.trip_repo.update(self.db, trip_id, {"status": status})
        
        return updated
    
    async def update_trip(
        self, 
        trip_id: int, 
        trip_data: TripUpdate
    ) -> Trip:
        """
        Atualiza uma viagem.
        
        Args:
            trip_id: ID da viagem
            trip_data: Dados para atualização
            
        Returns:
            Trip: Viagem atualizada
            
        Raises:
            ValueError: Se viagem não encontrada ou trip_code duplicado
        """
        trip = await self.trip_repo.get_by_id(self.db, trip_id)
        if not trip:
            raise ValueError(f"Trip {trip_id} não encontrada")
        
        # Verificar trip_code único se está sendo alterado
        if trip_data.trip_code and trip_data.trip_code != trip.trip_code:
            existing = await self.trip_repo.get_by_code(self.db, trip_data.trip_code)
            if existing:
                raise ValueError(f"Trip code {trip_data.trip_code} já existe")
        
        # Atualizar
        trip_dict = trip_data.model_dump(exclude_unset=True)
        updated = await self.trip_repo.update(self.db, trip_id, trip_dict)
        
        return updated
    
    async def delete_trip(self, trip_id: int) -> bool:
        """
        Soft delete de uma viagem.
        
        Args:
            trip_id: ID da viagem
            
        Returns:
            bool: True se deletada
            
        Raises:
            ValueError: Se viagem tem entradas associadas
        """
        # Verificar se tem entradas
        entries = await self.entry_repo.get_by_trip(self.db, trip_id)
        if entries:
            raise ValueError(
                f"Não é possível deletar viagem com {len(entries)} entradas associadas"
            )
        
        return await self.trip_repo.delete(self.db, trip_id)
    
    async def get_trip_summary(self, trip_id: int) -> Dict[str, Any]:
        """
        Obtém resumo básico de uma viagem.
        
        Args:
            trip_id: ID da viagem
            
        Returns:
            Dict com resumo da viagem
        """
        trip = await self.trip_repo.get_by_id(self.db, trip_id, include_entries=True)
        if not trip:
            raise ValueError(f"Trip {trip_id} não encontrada")
        
        entries_count = len(trip.stock_entries) if trip.stock_entries else 0
        
        return {
            "id": trip.id,
            "trip_code": trip.trip_code,
            "destination": trip.destination,
            "trip_date": trip.trip_date,
            "status": trip.status,
            "travel_cost_total": float(trip.travel_cost_total),
            "entries_count": entries_count,
            "duration_hours": trip.duration_hours,
            "is_active": trip.is_active,
        }
