"""Trip schemas for request/response validation."""

from typing import Optional
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.trip import TripStatus


class TripBase(BaseModel):
    """Base trip schema."""
    trip_code: str = Field(..., min_length=5, max_length=50, description="Código único da viagem")
    trip_date: date = Field(..., description="Data da viagem")
    destination: str = Field(..., min_length=3, max_length=255, description="Destino da viagem")
    departure_time: Optional[datetime] = Field(None, description="Horário de partida")
    return_time: Optional[datetime] = Field(None, description="Horário de retorno")
    travel_cost_fuel: Decimal = Field(default=Decimal("0.00"), ge=0, description="Custo com combustível")
    travel_cost_food: Decimal = Field(default=Decimal("0.00"), ge=0, description="Custo com alimentação")
    travel_cost_toll: Decimal = Field(default=Decimal("0.00"), ge=0, description="Custo com pedágios")
    travel_cost_hotel: Decimal = Field(default=Decimal("0.00"), ge=0, description="Custo com hospedagem")
    travel_cost_other: Decimal = Field(default=Decimal("0.00"), ge=0, description="Outros custos")
    status: TripStatus = Field(default=TripStatus.PLANNED, description="Status da viagem")
    notes: Optional[str] = Field(None, max_length=1000, description="Observações")

    @model_validator(mode='after')
    def validate_times(self):
        """Valida que departure_time < return_time."""
        if self.departure_time and self.return_time:
            if self.departure_time >= self.return_time:
                raise ValueError(
                    "O horário de retorno deve ser posterior ao horário de partida. "
                    f"Partida: {self.departure_time.strftime('%d/%m/%Y %H:%M')}, "
                    f"Retorno: {self.return_time.strftime('%d/%m/%Y %H:%M')}"
                )
        return self


class TripCreate(TripBase):
    """Schema for creating a trip."""
    pass


class TripUpdate(BaseModel):
    """Schema for updating a trip."""
    trip_code: Optional[str] = Field(None, min_length=5, max_length=50)
    trip_date: Optional[date] = None
    destination: Optional[str] = Field(None, min_length=3, max_length=255)
    departure_time: Optional[datetime] = None
    return_time: Optional[datetime] = None
    travel_cost_fuel: Optional[Decimal] = Field(None, ge=0)
    travel_cost_food: Optional[Decimal] = Field(None, ge=0)
    travel_cost_toll: Optional[Decimal] = Field(None, ge=0)
    travel_cost_hotel: Optional[Decimal] = Field(None, ge=0)
    travel_cost_other: Optional[Decimal] = Field(None, ge=0)
    status: Optional[TripStatus] = None
    notes: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

    @model_validator(mode='after')
    def validate_times(self):
        """Valida que departure_time < return_time."""
        if self.departure_time and self.return_time:
            if self.departure_time >= self.return_time:
                raise ValueError(
                    "O horário de retorno deve ser posterior ao horário de partida. "
                    f"Partida: {self.departure_time.strftime('%d/%m/%Y %H:%M')}, "
                    f"Retorno: {self.return_time.strftime('%d/%m/%Y %H:%M')}"
                )
        return self


class TripStatusUpdate(BaseModel):
    """Schema for updating only trip status."""
    status: TripStatus = Field(..., description="Novo status da viagem")


class TripResponse(TripBase):
    """Schema for trip response with calculated fields."""
    id: int
    travel_cost_total: Decimal = Field(..., description="Custo total da viagem")
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Campos calculados
    total_entries: int = Field(default=0, description="Total de entradas de estoque desta viagem")
    total_items_purchased: int = Field(default=0, description="Total de itens comprados na viagem")
    total_invested: Decimal = Field(default=Decimal("0.00"), description="Total investido em produtos")
    duration_hours: Optional[float] = Field(None, description="Duração da viagem em horas")

    @model_validator(mode='before')
    @classmethod
    def use_computed_status(cls, data):
        """Substituir status pelo computed_status se disponível."""
        if hasattr(data, 'computed_status'):
            # Se for um objeto Trip com computed_status, usar ele
            if isinstance(data, dict):
                data['status'] = getattr(data, 'computed_status')
            else:
                # Se for objeto SQLAlchemy
                status = data.computed_status
                # Converter para dict se necessário
                if hasattr(data, '__dict__'):
                    data_dict = {k: v for k, v in data.__dict__.items() if not k.startswith('_')}
                    data_dict['status'] = status
                    return data_dict
        return data

    class Config:
        from_attributes = True


class TripSummary(BaseModel):
    """Schema resumido para listagem de viagens."""
    id: int
    trip_code: str
    trip_date: date
    destination: str
    status: TripStatus
    travel_cost_total: Decimal
    total_entries: int = 0
    total_items_purchased: int = 0
    total_invested: Decimal = Decimal("0.00")
    is_active: bool
    created_at: datetime

    @model_validator(mode='before')
    @classmethod
    def use_computed_status(cls, data):
        """Substituir status pelo computed_status se disponível."""
        if hasattr(data, 'computed_status'):
            if isinstance(data, dict):
                data['status'] = getattr(data, 'computed_status')
            else:
                status = data.computed_status
                if hasattr(data, '__dict__'):
                    data_dict = {k: v for k, v in data.__dict__.items() if not k.startswith('_')}
                    data_dict['status'] = status
                    return data_dict
        return data

    class Config:
        from_attributes = True


class TripStats(BaseModel):
    """Schema para estatísticas de viagens."""
    total_trips: int = Field(..., description="Total de viagens")
    trips_completed: int = Field(..., description="Viagens completadas")
    trips_in_progress: int = Field(..., description="Viagens em andamento")
    trips_planned: int = Field(..., description="Viagens planejadas")
    total_travel_costs: Decimal = Field(..., description="Total gasto em viagens")
    total_products_purchased: int = Field(..., description="Total de produtos comprados")
    total_invested: Decimal = Field(..., description="Total investido em produtos")
    average_trip_cost: Decimal = Field(..., description="Custo médio por viagem")
    most_visited_destination: Optional[str] = Field(None, description="Destino mais visitado")
