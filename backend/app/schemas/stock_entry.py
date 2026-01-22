"""StockEntry schemas for request/response validation."""

from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, field_serializer

from app.models.stock_entry import EntryType


class StockEntryBase(BaseModel):
    """Base stock entry schema."""
    entry_code: str = Field(..., min_length=5, max_length=50, description="Código único da entrada")
    entry_date: date = Field(..., description="Data da entrada")
    entry_type: EntryType = Field(..., description="Tipo de entrada (trip/online/local)")
    trip_id: Optional[int] = Field(None, description="ID da viagem (se entry_type = 'trip')")
    supplier_name: str = Field(..., min_length=3, max_length=255, description="Nome do fornecedor")
    supplier_cnpj: Optional[str] = Field(None, max_length=18, description="CNPJ do fornecedor")
    supplier_contact: Optional[str] = Field(None, max_length=255, description="Contato do fornecedor")
    invoice_number: Optional[str] = Field(None, max_length=100, description="Número da nota fiscal")
    payment_method: Optional[str] = Field(None, max_length=50, description="Forma de pagamento")
    notes: Optional[str] = Field(None, max_length=1000, description="Observações")

    @field_validator('supplier_cnpj')
    @classmethod
    def validate_cnpj_format(cls, v):
        """Valida formato básico do CNPJ."""
        if v is not None and v.strip():
            # Remove pontuação
            cnpj = ''.join(filter(str.isdigit, v))
            if len(cnpj) != 14:
                raise ValueError('CNPJ deve ter 14 dígitos')
        return v

    @field_validator('trip_id')
    @classmethod
    def validate_trip_for_type(cls, v, info):
        """Valida que trip_id seja fornecido se entry_type = 'trip'."""
        entry_type = info.data.get('entry_type')
        if entry_type == EntryType.TRIP and v is None:
            raise ValueError('trip_id is required when entry_type is "trip"')
        return v


class StockEntryCreate(StockEntryBase):
    """Schema for creating a stock entry."""
    pass


class StockEntryUpdate(BaseModel):
    """Schema for updating a stock entry."""
    entry_code: Optional[str] = Field(None, min_length=5, max_length=50)
    entry_date: Optional[date] = None
    entry_type: Optional[EntryType] = None
    trip_id: Optional[int] = None
    supplier_name: Optional[str] = Field(None, min_length=3, max_length=255)
    supplier_cnpj: Optional[str] = Field(None, max_length=18)
    supplier_contact: Optional[str] = Field(None, max_length=255)
    invoice_number: Optional[str] = Field(None, max_length=100)
    payment_method: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

    @field_validator('supplier_cnpj')
    @classmethod
    def validate_cnpj_format(cls, v):
        """Valida formato básico do CNPJ."""
        if v is not None and v.strip():
            cnpj = ''.join(filter(str.isdigit, v))
            if len(cnpj) != 14:
                raise ValueError('CNPJ deve ter 14 dígitos')
        return v


class StockEntryResponse(StockEntryBase):
    """Schema for stock entry response with metrics."""
    id: int
    total_cost: Decimal = Field(..., description="Custo total da entrada")
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Métricas calculadas
    total_items: int = Field(default=0, description="Total de itens distintos")
    total_quantity: int = Field(default=0, description="Quantidade total de produtos")
    items_sold: int = Field(default=0, description="Quantidade de produtos vendidos")
    sell_through_rate: float = Field(default=0.0, description="Taxa de venda (%)")
    roi: Optional[float] = Field(None, description="Retorno sobre investimento (%)")
    has_sales: bool = Field(default=False, description="Indica se entrada teve vendas (FIFO tracking)")

    # Trip info (se houver)
    trip_code: Optional[str] = Field(None, description="Código da viagem")
    trip_destination: Optional[str] = Field(None, description="Destino da viagem")

    @field_serializer('total_cost')
    def serialize_total_cost(self, value: Decimal) -> float:
        """Serializa Decimal para float para compatibilidade com JSON."""
        return float(value) if value is not None else 0.0

    class Config:
        from_attributes = True


class StockEntrySummary(BaseModel):
    """Schema resumido para listagem de entradas."""
    id: int
    entry_code: str
    entry_date: date
    entry_type: EntryType
    supplier_name: str
    total_cost: Decimal
    total_items: int = 0
    total_quantity: int = 0
    is_active: bool
    created_at: datetime

    @field_serializer('total_cost')
    def serialize_total_cost(self, value: Decimal) -> float:
        """Serializa Decimal para float para compatibilidade com JSON."""
        return float(value) if value is not None else 0.0

    class Config:
        from_attributes = True


class StockEntryStats(BaseModel):
    """Schema para estatísticas de entradas de estoque."""
    total_entries: int = Field(..., description="Total de entradas")
    entries_from_trips: int = Field(..., description="Entradas de viagens")
    entries_online: int = Field(..., description="Entradas de compras online")
    entries_local: int = Field(..., description="Entradas de compras locais")
    total_invested: Decimal = Field(..., description="Total investido")
    total_items_purchased: int = Field(..., description="Total de itens comprados")
    total_quantity_purchased: int = Field(..., description="Quantidade total comprada")
    average_entry_value: Decimal = Field(..., description="Valor médio por entrada")
    top_suppliers: List[dict] = Field(default_factory=list, description="Top fornecedores")
    monthly_purchases: List[dict] = Field(default_factory=list, description="Compras mensais")


# Schema com items (deve vir após imports)
class StockEntryWithItems(StockEntryResponse):
    """Schema for stock entry with full items list."""
    entry_items: List["EntryItemResponse"] = Field(default_factory=list, description="Lista de itens da entrada")

    class Config:
        from_attributes = True


# Import após definição para resolver referência circular
from app.schemas.entry_item import EntryItemResponse  # noqa: E402

# Rebuild do modelo para resolver forward references
StockEntryWithItems.model_rebuild()

