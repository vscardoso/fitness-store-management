"""AI Scan schemas for request/response validation."""

from typing import Optional, List
from pydantic import BaseModel, Field


class DuplicateMatch(BaseModel):
    """Produto duplicado encontrado."""
    product_id: int
    product_name: str
    sku: str
    similarity_score: float = Field(..., ge=0.0, le=1.0)
    reason: str  # "Nome similar", "Mesma marca/cor/tamanho"


class ProductScanResult(BaseModel):
    """Resultado completo da análise de IA."""

    # Dados do produto
    name: str = Field(..., description="Nome sugerido do produto")
    description: Optional[str] = Field(None, description="Descrição do produto")
    brand: Optional[str] = Field(None, description="Marca identificada")
    color: Optional[str] = Field(None, description="Cor do produto")
    size: Optional[str] = Field(None, description="Tamanho (PP, P, M, G, GG, XG, 34-46)")
    gender: Optional[str] = Field(None, description="Gênero (masculino, feminino, unissex)")
    material: Optional[str] = Field(None, description="Material/composição")

    # Categoria
    suggested_category: str = Field(..., description="Nome da categoria sugerida")
    suggested_category_id: Optional[int] = Field(None, description="ID da categoria no banco")

    # Identificadores
    suggested_sku: str = Field(..., description="SKU sugerido")
    detected_barcode: Optional[str] = Field(None, description="Código de barras extraído da imagem")

    # PRICING INTELIGENTE
    suggested_cost_price: Optional[float] = Field(None, ge=0, description="Preço de custo sugerido")
    suggested_sale_price: Optional[float] = Field(None, ge=0, description="Preço de venda sugerido")
    markup_percentage: Optional[float] = Field(None, ge=0, description="Percentual de markup")
    price_reasoning: Optional[str] = Field(None, description="Justificativa do preço")

    # Flags de tipo
    is_supplement: bool = Field(default=False, description="É suplemento alimentar")
    is_clothing: bool = Field(default=False, description="É roupa/vestuário")
    is_footwear: bool = Field(default=False, description="É calçado")
    is_accessory: bool = Field(default=False, description="É acessório")
    is_equipment: bool = Field(default=False, description="É equipamento fitness")

    # Qualidade e confiança
    confidence: float = Field(..., ge=0.0, le=1.0, description="Nível de confiança 0.0 - 1.0")
    image_quality: str = Field(..., description="excellent, good, poor")
    image_feedback: Optional[str] = Field(None, description="Dicas para melhor foto")

    # Detecção de duplicados
    possible_duplicates: List[DuplicateMatch] = Field(default_factory=list)

    # Avisos
    warnings: List[str] = Field(default_factory=list)


class ProductScanResponse(BaseModel):
    """Response wrapper para scan de produto."""
    success: bool
    data: Optional[ProductScanResult] = None
    error: Optional[str] = None
    processing_time_ms: int = Field(..., description="Tempo de processamento em ms")


class AIStatusResponse(BaseModel):
    """Status do serviço de IA."""
    enabled: bool
    model: str
    has_api_key: bool
