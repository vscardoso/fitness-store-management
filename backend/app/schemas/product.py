"""Product schemas for request/response validation."""

from typing import Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from pydantic import model_validator, computed_field


class ProductBase(BaseModel):
    """Base product schema."""
    name: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    sku: str = Field(..., max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    # Preço principal do produto. Aceitamos também o alias "sale_price" nos schemas de entrada
    price: Optional[Decimal] = Field(None, gt=0)
    cost_price: Optional[Decimal] = Field(None, ge=0)
    category_id: int
    brand: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=50)
    size: Optional[str] = Field(None, max_length=20)
    gender: Optional[str] = Field(None, max_length=20)
    material: Optional[str] = Field(None, max_length=100)
    is_digital: bool = False
    is_activewear: bool = False
    is_catalog: bool = False


class ProductCreate(ProductBase):
    """Schema for creating a product."""
    # Compatibilidade com testes/clients que enviam "sale_price" em vez de "price"
    sale_price: Optional[Decimal] = Field(None, gt=0, description="Alias para price")
    initial_stock: Optional[int] = Field(0, ge=0, description="Quantidade inicial em estoque")
    min_stock: Optional[int] = Field(5, ge=0, description="Estoque mínimo")

    @model_validator(mode="after")
    def ensure_price(self):
        # Se price não vier, tentar mapear de sale_price
        if self.price is None and self.sale_price is not None:
            self.price = self.sale_price
        if self.price is None:
            raise ValueError("price ou sale_price deve ser informado")
        return self


class ProductUpdate(BaseModel):
    """Schema for updating a product."""
    name: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    sku: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    price: Optional[Decimal] = Field(None, gt=0)
    # Permite atualizar usando alias
    sale_price: Optional[Decimal] = Field(None, gt=0, description="Alias para price")
    cost_price: Optional[Decimal] = Field(None, ge=0)
    category_id: Optional[int] = None
    brand: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=50)
    size: Optional[str] = Field(None, max_length=20)
    gender: Optional[str] = Field(None, max_length=20)
    material: Optional[str] = Field(None, max_length=100)
    is_digital: Optional[bool] = None
    is_activewear: Optional[bool] = None
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def map_sale_price(self):
        # Se price não foi enviado mas sale_price sim, mapear
        if self.price is None and self.sale_price is not None:
            self.price = self.sale_price
        return self


class ActivateProductRequest(BaseModel):
    """Schema for activating a catalog product."""
    custom_price: Optional[Decimal] = Field(None, gt=0, description="Preço personalizado (opcional)")


class ProductResponse(ProductBase):
    """Schema for product response."""
    id: int
    is_active: bool
    is_catalog: bool
    created_at: datetime
    updated_at: datetime
    current_stock: Optional[int] = Field(None, description="Quantidade atual em estoque")
    min_stock_threshold: Optional[int] = Field(None, description="Estoque mínimo")
    # Expor sale_price no response (espelha "price") para compatibilidade
    @computed_field(return_type=Decimal)
    def sale_price(self) -> Decimal:
        # price não deve ser None aqui, já validado nos schemas de entrada
        return self.price  # type: ignore
    
    class Config:
        from_attributes = True
