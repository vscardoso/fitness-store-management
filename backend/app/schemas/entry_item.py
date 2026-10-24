"""EntryItem schemas for request/response validation."""

from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator


class EntryItemBase(BaseModel):
    """Base entry item schema."""
    entry_id: int = Field(..., description="ID da entrada de estoque")
    product_id: Optional[int] = Field(None, description="ID do produto (legado - usar variant_id)")
    quantity_received: int = Field(..., gt=0, description="Quantidade comprada/recebida")
    unit_cost: Decimal = Field(..., ge=0, description="Custo unitário")
    notes: Optional[str] = Field(None, max_length=500, description="Observações")

    @field_validator('quantity_received')
    @classmethod
    def validate_quantity_positive(cls, v):
        """Valida que a quantidade seja positiva."""
        if v <= 0:
            raise ValueError('quantity_received must be greater than 0')
        return v


class NewVariantForItem(BaseModel):
    """Variação (cor/tamanho) que ainda não existe num produto já cadastrado: criada junto com a entrada."""
    color: Optional[str] = Field(None, max_length=50)
    size: Optional[str] = Field(None, max_length=20)
    price: Optional[Decimal] = Field(None, gt=0, description="Preço de venda (se vazio, usa o das outras variações)")
    sku: Optional[str] = Field(None, max_length=60, description="Opcional: o servidor gera e não repete")

    @model_validator(mode="after")
    def _needs_color_or_size(self):
        if not (self.color or "").strip() and not (self.size or "").strip():
            raise ValueError("Informe a cor ou o tamanho da nova variação")
        return self


class EntryItemCreate(BaseModel):
    """Schema for creating an entry item (sem entry_id, será definido automaticamente)."""
    product_id: Optional[int] = Field(None, description="ID do produto")
    variant_id: Optional[int] = Field(None, description="ID da variante (definir junto com product_id para FIFO por variante)")
    quantity_received: int = Field(..., gt=0, description="Quantidade comprada/recebida")
    unit_cost: Decimal = Field(..., ge=0, description="Custo unitário")
    selling_price: Optional[Decimal] = Field(None, ge=0, description="Preço de venda do produto (atualiza o produto)")
    supplier_id: Optional[int] = Field(None, description="Fornecedor deste item (padrão: fornecedor da entrada)")
    list_unit_cost: Optional[Decimal] = Field(None, ge=0, description="Preço de tabela por peça (opcional); o pago é unit_cost")
    notes: Optional[str] = Field(None, max_length=500, description="Observações")
    new_variant: Optional[NewVariantForItem] = Field(
        None, description="Cria esta variação (cor/tamanho) no produto e lança nela; use no lugar de variant_id"
    )

    @field_validator('quantity_received')
    @classmethod
    def validate_quantity_positive(cls, v):
        """Valida que a quantidade seja positiva."""
        if v <= 0:
            raise ValueError('quantity_received must be greater than 0')
        return v


class EntryItemUpdate(BaseModel):
    """Schema for updating an entry item."""
    product_id: Optional[int] = None
    quantity_received: Optional[int] = Field(None, gt=0)
    quantity_remaining: Optional[int] = Field(None, ge=0)
    unit_cost: Optional[Decimal] = Field(None, ge=0)
    sell_price: Optional[Decimal] = Field(None, ge=0, description="Preço de venda do produto")
    list_unit_cost: Optional[Decimal] = Field(None, ge=0, description="Preço de tabela por peça (0 limpa)")
    notes: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None

    @field_validator('quantity_received')
    @classmethod
    def validate_quantity_positive(cls, v):
        """Valida que a quantidade seja positiva."""
        if v is not None and v <= 0:
            raise ValueError('quantity_received must be greater than 0')
        return v

    @field_validator('quantity_remaining')
    @classmethod
    def validate_remaining_non_negative(cls, v):
        """Valida que quantity_remaining não seja negativo."""
        if v is not None and v < 0:
            raise ValueError('quantity_remaining must be non-negative')
        return v


class EntryItemResponse(EntryItemBase):
    """Schema for entry item response."""
    id: int
    variant_id: Optional[int] = Field(None, description="ID da variante do produto")
    supplier_id: Optional[int] = Field(None, description="Fornecedor do item")
    supplier_name: Optional[str] = Field(None, description="Nome do fornecedor do item")
    list_unit_cost: Optional[Decimal] = Field(None, description="Preço de tabela por peça (informativo)")
    quantity_remaining: int = Field(..., description="Quantidade restante")
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Campos calculados
    total_cost: Decimal = Field(..., description="Custo total (quantity × unit_cost)")
    quantity_sold: int = Field(default=0, description="Quantidade vendida")
    depletion_percentage: float = Field(default=0.0, description="Porcentagem de depleção")
    is_depleted: bool = Field(default=False, description="Se está totalmente esgotado")

    # Informações do produto
    product_name: Optional[str] = Field(None, description="Nome do produto")
    product_sku: Optional[str] = Field(None, description="SKU do produto")
    product_barcode: Optional[str] = Field(None, description="Código de barras")
    product_price: Optional[Decimal] = Field(None, description="Preço de venda do produto")

    # Informações da variante
    variant_name: Optional[str] = Field(None, description="Nome completo da variante")
    variant_label: Optional[str] = Field(None, description="Label da variante (cor/tamanho)")

    class Config:
        from_attributes = True


class EntryItemSummary(BaseModel):
    """Schema resumido para listagem de itens."""
    id: int
    product_id: int
    product_name: str
    product_sku: str
    quantity_received: int
    quantity_remaining: int
    quantity_sold: int
    unit_cost: Decimal
    total_cost: Decimal
    is_depleted: bool

    class Config:
        from_attributes = True


class EntryItemStats(BaseModel):
    """Schema para estatísticas de itens de entrada."""
    total_items: int = Field(..., description="Total de itens")
    items_depleted: int = Field(..., description="Itens esgotados")
    total_quantity_received: int = Field(..., description="Quantidade total recebida")
    total_quantity_remaining: int = Field(..., description="Quantidade total restante")
    total_quantity_sold: int = Field(..., description="Quantidade total vendida")
    average_depletion_rate: float = Field(..., description="Taxa média de depleção (%)")
    total_cost: Decimal = Field(..., description="Custo total de todos os itens")
    best_sellers: List[dict] = Field(default_factory=list, description="Itens mais vendidos")
    slow_movers: List[dict] = Field(default_factory=list, description="Itens de venda lenta")


# Import para type hints
from typing import List
