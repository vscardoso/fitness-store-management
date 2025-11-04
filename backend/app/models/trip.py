"""
Modelo de viagem para rastrear viagens de compra de produtos.
"""
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Date, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, TYPE_CHECKING
import enum

from .base import BaseModel

if TYPE_CHECKING:
    from .stock_entry import StockEntry


class TripStatus(str, enum.Enum):
    """Status possíveis de uma viagem."""
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Trip(BaseModel):
    """
    Trip model para rastrear viagens de compra.
    
    Armazena informações sobre viagens realizadas para compra de produtos,
    incluindo custos detalhados de viagem e relacionamento com entradas de estoque.
    """
    __tablename__ = "trips"
    
    # Identificação da viagem
    trip_code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        comment="Código único da viagem (ex: TRIP-2025-001)"
    )
    
    # Informações da viagem
    trip_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Data da viagem"
    )
    
    destination: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Destino da viagem"
    )
    
    departure_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        comment="Horário de partida"
    )
    
    return_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        comment="Horário de retorno"
    )
    
    # Custos de viagem detalhados
    travel_cost_fuel: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
        comment="Custo com combustível"
    )
    
    travel_cost_food: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
        comment="Custo com alimentação"
    )
    
    travel_cost_toll: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
        comment="Custo com pedágios"
    )
    
    travel_cost_hotel: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
        comment="Custo com hospedagem"
    )
    
    travel_cost_other: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
        comment="Outros custos"
    )
    
    travel_cost_total: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
        comment="Custo total da viagem (calculado)"
    )
    
    # Status e observações
    status: Mapped[TripStatus] = mapped_column(
        SQLEnum(TripStatus, native_enum=False, length=20),
        default=TripStatus.PLANNED,
        nullable=False,
        comment="Status da viagem"
    )
    
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Observações sobre a viagem"
    )
    
    # Relacionamentos
    stock_entries: Mapped[List["StockEntry"]] = relationship(
        "StockEntry",
        back_populates="trip",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        """String representation of the trip."""
        return f"<Trip(code={self.trip_code}, destination={self.destination}, status={self.status})>"
    
    def calculate_total_cost(self) -> Decimal:
        """
        Calcula o custo total da viagem.
        
        Returns:
            Decimal: Soma de todos os custos da viagem
        """
        return (
            self.travel_cost_fuel +
            self.travel_cost_food +
            self.travel_cost_toll +
            self.travel_cost_hotel +
            self.travel_cost_other
        )
    
    def update_total_cost(self) -> None:
        """
        Atualiza o campo travel_cost_total com o valor calculado.
        """
        self.travel_cost_total = self.calculate_total_cost()
    
    @property
    def duration_hours(self) -> float | None:
        """
        Calcula a duração da viagem em horas.
        
        Returns:
            float | None: Duração em horas, ou None se não houver horários definidos
        """
        if self.departure_time and self.return_time:
            duration = self.return_time - self.departure_time
            return duration.total_seconds() / 3600
        return None
    
    @property
    def is_completed(self) -> bool:
        """Verifica se a viagem está completa."""
        return self.status == TripStatus.COMPLETED
    
    @property
    def is_in_progress(self) -> bool:
        """Verifica se a viagem está em andamento."""
        return self.status == TripStatus.IN_PROGRESS
    
    @property
    def is_planned(self) -> bool:
        """Verifica se a viagem está planejada."""
        return self.status == TripStatus.PLANNED
