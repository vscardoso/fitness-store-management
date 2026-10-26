"""StockEntry schemas for request/response validation."""

from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, field_serializer, computed_field, model_validator

from app.models.stock_entry import EntryType, EntryStatus


def validate_cpf_cnpj(value):
    """Documento do fornecedor é opcional; quando vier, aceita CPF (11 dígitos) ou CNPJ (14).

    Muito fornecedor de feira é pessoa física ou não passa o documento.
    """
    if value is not None and value.strip():
        digits = ''.join(filter(str.isdigit, value))
        if len(digits) not in (11, 14):
            raise ValueError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos), ou deixe em branco')
    return value


class EntryExtraCost(BaseModel):
    """Custo extra informado junto com a entrada (frete, pedágio, almoço da viagem...)."""
    description: str = Field(..., min_length=1, max_length=200, description="O que foi (ex.: frete)")
    amount: Decimal = Field(..., gt=0, description="Quanto custou")

    @field_validator("description")
    @classmethod
    def _strip_description(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Diga o que foi essa despesa")
        return v


def entry_date_not_future(value):
    """Entrada pode ser retroativa (compra já feita), mas não no futuro. Tolera 1 dia por causa de fuso horário."""
    from datetime import timedelta
    from app.core.timezone import today_brazil

    if value is not None and value > today_brazil() + timedelta(days=1):
        raise ValueError("A data da entrada não pode ser no futuro")
    return value


class StockEntryBase(BaseModel):
    """Base stock entry schema."""
    entry_code: str = Field(..., min_length=5, max_length=50, description="Código único da entrada")
    entry_date: date = Field(..., description="Data da entrada (pode ser retroativa)")

    @field_validator("entry_date")
    @classmethod
    def _entry_date_ok(cls, v):
        return entry_date_not_future(v)
    entry_type: EntryType = Field(..., description="Tipo de entrada (trip/online/local)")
    trip_id: Optional[int] = Field(None, description="ID da viagem (se entry_type = 'trip')")
    supplier_id: Optional[int] = Field(None, description="Fornecedor padrão da entrada (cadastro)")
    supplier_name: str = Field(..., min_length=1, max_length=255, description="Nome do fornecedor")
    supplier_cnpj: Optional[str] = Field(None, max_length=18, description="CNPJ do fornecedor")
    supplier_contact: Optional[str] = Field(None, max_length=255, description="Contato do fornecedor")
    invoice_number: Optional[str] = Field(None, max_length=100, description="Número da nota fiscal")
    payment_method: Optional[str] = Field(None, max_length=50, description="Forma de pagamento")
    discount_amount: Decimal = Field(Decimal("0"), ge=0, description="Desconto do fornecedor no total da compra (R$)")
    notes: Optional[str] = Field(None, max_length=1000, description="Observações")

    @field_validator('supplier_cnpj')
    @classmethod
    def validate_cnpj_format(cls, v):
        return validate_cpf_cnpj(v)

    @field_validator('trip_id')
    @classmethod
    def validate_trip_for_type(cls, v, info):
        """Valida que trip_id seja fornecido se entry_type = 'trip'."""
        entry_type = info.data.get('entry_type')
        if entry_type == EntryType.TRIP and v is None:
            raise ValueError('trip_id is required when entry_type is "trip"')
        return v


def normalize_entry_code(value):
    """Código da entrada: MAIÚSCULAS, sem espaço nas pontas, e cada espaço no meio vira traço (ENTRADA SP 22 -> ENTRADA-SP-22)."""
    if not isinstance(value, str):
        return value
    import re
    return re.sub(r"\s+", "-", value.strip()).upper()


class StockEntryCreate(StockEntryBase):
    """Schema for creating a stock entry.

    `extra_costs`: custos da compra lançados junto com a entrada. Em entrada de viagem viram despesa DA VIAGEM
    (divididas entre as entradas dela); nos outros tipos viram despesa DESTA entrada. Tudo na mesma transação.

    Informe `supplier_id` (fornecedor cadastrado) OU `supplier_name` (texto: o servidor acha o
    cadastro pelo nome ou cria um novo). Se vierem os dois, vale o `supplier_id`.
    """
    supplier_name: Optional[str] = Field(None, min_length=1, max_length=255, description="Nome do fornecedor")
    extra_costs: List[EntryExtraCost] = Field(default_factory=list, description="Frete, pedágio, almoço da viagem... lançados junto com a entrada")

    @model_validator(mode='after')
    def require_supplier(self):
        if self.supplier_id is None and not (self.supplier_name or '').strip():
            raise ValueError('Informe o fornecedor (supplier_id ou supplier_name)')
        return self

    @field_validator('entry_code', mode='before')
    @classmethod
    def uppercase_entry_code(cls, v):
        return normalize_entry_code(v)


class SupplierDiscountIn(BaseModel):
    """Desconto de um fornecedor da entrada (valor 0 remove)."""
    supplier_id: int
    amount: Decimal = Field(..., ge=0)


class StockEntryUpdate(BaseModel):
    """Schema for updating a stock entry."""
    entry_code: Optional[str] = Field(None, min_length=5, max_length=50)

    @field_validator('entry_code', mode='before')
    @classmethod
    def uppercase_entry_code(cls, v):
        return normalize_entry_code(v)

    entry_date: Optional[date] = None

    @field_validator('entry_date')
    @classmethod
    def _entry_date_ok(cls, v):
        return entry_date_not_future(v)
    entry_type: Optional[EntryType] = None
    trip_id: Optional[int] = None
    supplier_name: Optional[str] = Field(None, min_length=1, max_length=255)
    supplier_cnpj: Optional[str] = Field(None, max_length=18)
    supplier_contact: Optional[str] = Field(None, max_length=255)
    invoice_number: Optional[str] = Field(None, max_length=100)
    payment_method: Optional[str] = Field(None, max_length=50)
    discount_amount: Optional[Decimal] = Field(None, ge=0)
    supplier_discounts: Optional[List[SupplierDiscountIn]] = Field(
        None, description="Desconto por fornecedor da entrada (substitui o valor de cada fornecedor informado)"
    )
    notes: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

    @field_validator('supplier_cnpj')
    @classmethod
    def validate_cnpj_format(cls, v):
        return validate_cpf_cnpj(v)


class StockEntryResponse(StockEntryBase):
    """Schema for stock entry response with metrics."""
    id: int
    total_cost: Decimal = Field(..., description="Custo total da entrada (só a mercadoria)")
    extra_costs_total: float = Field(default=0.0, description="Viagem e despesas do lote, rateadas nas peças")
    total_invested: Optional[float] = Field(default=None, description="Total gasto no lote: mercadoria + viagem + despesas do lote")
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
    entry_status: EntryStatus = Field(default=EntryStatus.OPEN, description="Status operacional: open/partial/sold_out/archived")

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
    extra_costs_total: float = 0.0
    total_invested: Optional[float] = None
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

    @field_validator("entry_items")
    @classmethod
    def _so_itens_ativos(cls, v):
        """Item excluído (soft delete) não aparece na entrada."""
        return [i for i in v if getattr(i, "is_active", True)]

    @computed_field(description="Resumo por fornecedor: itens, quantidade e custo")
    @property
    def suppliers_summary(self) -> List[dict]:
        groups: dict = {}
        for it in self.entry_items:
            key = it.supplier_id if it.supplier_id is not None else 0
            name = it.supplier_name or self.supplier_name
            g = groups.setdefault(key, {"supplier_id": it.supplier_id, "supplier_name": name,
                                        "items": 0, "quantity": 0, "total_cost": 0.0})
            g["items"] += 1
            g["quantity"] += it.quantity_received
            g["total_cost"] = round(g["total_cost"] + float(it.total_cost or 0), 2)
        return sorted(groups.values(), key=lambda g: -g["total_cost"])

    class Config:
        from_attributes = True


# Import após definição para resolver referência circular
from app.schemas.entry_item import EntryItemResponse  # noqa: E402

# Rebuild do modelo para resolver forward references
StockEntryWithItems.model_rebuild()

