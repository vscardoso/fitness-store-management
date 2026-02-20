"""
Schemas para variantes de produto.
"""
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator


class ProductVariantBase(BaseModel):
    """Schema base para variante de produto."""
    sku: str = Field(..., min_length=1, max_length=50, description="SKU único da variante")
    barcode: Optional[str] = Field(None, max_length=100, description="Código de barras")
    size: Optional[str] = Field(None, max_length=20, description="Tamanho (P, M, G, GG, 38, 40...)")
    color: Optional[str] = Field(None, max_length=50, description="Cor (Roxo, Preto, Azul...)")
    price: Decimal = Field(..., gt=0, description="Preço de venda")
    cost_price: Optional[Decimal] = Field(None, ge=0, description="Preço de custo")
    image_url: Optional[str] = Field(None, max_length=500, description="URL da imagem específica")


class ProductVariantCreate(ProductVariantBase):
    """Schema para criar uma variante."""
    pass


class ProductVariantUpdate(BaseModel):
    """Schema para atualizar uma variante."""
    sku: Optional[str] = Field(None, min_length=1, max_length=50)
    barcode: Optional[str] = Field(None, max_length=100)
    size: Optional[str] = Field(None, max_length=20)
    color: Optional[str] = Field(None, max_length=50)
    price: Optional[Decimal] = Field(None, gt=0)
    cost_price: Optional[Decimal] = Field(None, ge=0)
    image_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class ProductVariantResponse(ProductVariantBase):
    """Schema de resposta para variante."""
    id: int
    product_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    current_stock: Optional[int] = Field(None, description="Estoque atual")
    variant_label: Optional[str] = Field(None, description="Label formatado (cor · tamanho)")
    
    class Config:
        from_attributes = True


class ProductVariantWithProductResponse(ProductVariantResponse):
    """Schema de resposta para variante com dados do produto pai."""
    product_name: Optional[str] = None
    product_brand: Optional[str] = None
    product_image_url: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class ProductVariantMinimal(BaseModel):
    """Schema minimal para listagem em dropdowns."""
    id: int
    sku: str
    barcode: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    price: Decimal
    current_stock: Optional[int] = None
    
    class Config:
        from_attributes = True


# ================================
# Schemas para criação de produto com variantes
# ================================

class ProductWithVariantsCreate(BaseModel):
    """Schema para criar produto com múltiplas variantes de uma vez."""
    # Dados do produto pai
    name: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    brand: Optional[str] = Field(None, max_length=100)
    category_id: int
    gender: Optional[str] = Field(None, max_length=20)
    material: Optional[str] = Field(None, max_length=100)
    is_digital: bool = False
    is_activewear: bool = True
    is_catalog: bool = False
    image_url: Optional[str] = Field(None, max_length=500)
    base_price: Optional[Decimal] = Field(None, gt=0, description="Preço base de referência")
    
    # Variantes
    variants: List[ProductVariantCreate] = Field(
        ..., 
        min_length=1, 
        description="Lista de variantes (tamanho/cor)"
    )
    
    @model_validator(mode="after")
    def validate_variants(self):
        """Valida se há variantes duplicadas."""
        seen = set()
        for v in self.variants:
            key = (v.size, v.color)
            if key in seen:
                raise ValueError(f"Variante duplicada: tamanho={v.size}, cor={v.color}")
            seen.add(key)
        return self


class ProductWithVariantsResponse(BaseModel):
    """Schema de resposta para produto com variantes."""
    id: int
    name: str
    description: Optional[str] = None
    brand: Optional[str] = None
    category_id: int
    gender: Optional[str] = None
    material: Optional[str] = None
    is_digital: bool
    is_activewear: bool
    is_catalog: bool
    image_url: Optional[str] = None
    base_price: Optional[Decimal] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    # Estatísticas
    variant_count: int = 0
    total_stock: int = 0
    price_range: Optional[tuple[Decimal, Decimal]] = None
    
    # Variantes
    variants: List[ProductVariantResponse] = []
    
    class Config:
        from_attributes = True


# ================================
# Schemas para grade de variações
# ================================

class VariantGridItem(BaseModel):
    """Item da grade de variações (para UI)."""
    size: Optional[str] = None
    color: Optional[str] = None
    sku: str
    price: Decimal
    stock: int = 0
    variant_id: int


class VariantGridResponse(BaseModel):
    """Grade de variações organizada por cor/tamanho."""
    product_id: int
    product_name: str
    product_brand: Optional[str] = None
    base_price: Optional[Decimal] = None
    
    # Lista de tamanhos e cores disponíveis
    available_sizes: List[str] = []
    available_colors: List[str] = []
    
    # Grade de variações
    grid: List[VariantGridItem] = []


# ================================
# Schemas para bulk operations
# ================================

class BulkVariantCreate(BaseModel):
    """Schema para criar múltiplas variantes de uma vez."""
    product_id: int
    sizes: List[str] = Field(..., min_length=1, description="Lista de tamanhos")
    colors: List[str] = Field(..., min_length=1, description="Lista de cores")
    base_price: Decimal = Field(..., gt=0, description="Preço base para todas as variantes")
    price_adjustments: Optional[dict[str, Decimal]] = Field(
        None, 
        description="Ajustes de preço por tamanho/cor. Ex: {'GG': 5.00, 'XG': 10.00}"
    )
    sku_prefix: Optional[str] = Field(None, description="Prefixo para SKU. Ex: 'LEG-NIK'")


class BulkVariantResponse(BaseModel):
    """Resposta da criação em massa de variantes."""
    product_id: int
    variants_created: int
    variants: List[ProductVariantResponse]