"""
Serviço de geração de SKU único para produtos.

Garante unicidade de SKU dentro de um tenant usando o formato:
MARCA-NOME-COR-TAMANHO-XXX (ex: NIKE-LEGGIN-ROS-M-001)
"""

import logging
import re
import unicodedata
from typing import Optional
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product_variant import ProductVariant
from app.models.product import Product

logger = logging.getLogger(__name__)


class SKUGeneratorService:
    """Serviço para geração de SKUs únicos."""

    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de geração de SKU.

        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db

    def clean_string(self, text: Optional[str]) -> str:
        """
        Remove acentos e caracteres especiais de uma string.

        Args:
            text: Texto a ser limpo

        Returns:
            String limpa (apenas letras maiúsculas e números)
        """
        if not text:
            return ""

        # Remove acentos usando unicodedata (correto para Python)
        normalized = unicodedata.normalize("NFD", text)
        cleaned_accents = re.sub(r"[\u0300-\u036f]", "", normalized)

        # Remove caracteres não alfanuméricos
        cleaned = re.sub(r"[^A-Za-z0-9]", "", cleaned_accents)

        return cleaned.upper()

    def generate_base_sku(
        self,
        name: str,
        brand: Optional[str] = None,
        color: Optional[str] = None,
        size: Optional[str] = None,
    ) -> str:
        """
        Gera o SKU base sem contador.

        Formato: MARCA-NOME-COR-TAM (ex: NIKE-LEGGIN-ROS-M)

        Args:
            name: Nome do produto (obrigatório)
            brand: Marca (opcional)
            color: Cor (opcional)
            size: Tamanho (opcional)

        Returns:
            SKU base (sem contador)
        """
        parts = []

        # Marca (primeiros 4 caracteres)
        if brand:
            parts.append(self.clean_string(brand)[:4])

        # Nome (primeiros 6 caracteres)
        if name:
            parts.append(self.clean_string(name)[:6])

        # Cor (primeiros 3 caracteres)
        if color:
            parts.append(self.clean_string(color)[:3])

        # Tamanho (primeiros 3 caracteres)
        if size:
            parts.append(self.clean_string(size)[:3])

        # Montar base do SKU
        return "-".join(parts) if parts else "PROD"

    async def generate_unique_sku(
        self,
        name: str,
        brand: Optional[str] = None,
        color: Optional[str] = None,
        size: Optional[str] = None,
        *,
        tenant_id: int,
        max_attempts: int = 1000,
    ) -> str:
        """
        Gera um SKU único para o produto.

        Verifica SKUs existentes no tenant e adiciona contador se necessário.

        Args:
            name: Nome do produto (obrigatório)
            brand: Marca (opcional)
            color: Cor (opcional)
            size: Tamanho (opcional)
            tenant_id: ID do tenant
            max_attempts: Número máximo de tentativas (padrão: 1000)

        Returns:
            SKU único

        Raises:
            ValueError: Se não conseguir gerar SKU único após max_attempts
        """
        base_sku = self.generate_base_sku(name, brand, color, size)
        logger.info(
            f"Gerando SKU único - Base: {base_sku}, Tenant: {tenant_id}"
        )

        # Buscar todos os SKUs existentes do tenant (incluindo inativos/soft-deleted)
        # A constraint UNIQUE do banco é em (tenant_id, sku) sem filtro de is_active,
        # portanto variantes de produtos deletados ainda bloqueiam o SKU.
        stmt = (
            select(ProductVariant.sku)
            .where(
                and_(
                    ProductVariant.tenant_id == tenant_id,
                    ProductVariant.sku.like(f"{base_sku}-%"),
                )
            )
        )
        result = await self.db.execute(stmt)
        existing_skus = {row[0].upper() for row in result.fetchall() if row[0]}

        # Tentar encontrar SKU único
        for counter in range(1, max_attempts + 1):
            candidate = f"{base_sku}-{counter:03d}"

            if candidate.upper() not in existing_skus:
                logger.info(
                    f"SKU único encontrado: {candidate} (tentativa {counter})"
                )
                return candidate

        # Se chegou aqui, não conseguiu gerar SKU único
        raise ValueError(
            f"Não foi possível gerar SKU único após {max_attempts} tentativas. "
            f"Base SKU: {base_sku}"
        )

    async def validate_sku(
        self, sku: str, *, tenant_id: int, exclude_variant_id: Optional[int] = None
    ) -> bool:
        """
        Valida se um SKU é único no tenant.

        Verifica TODAS as variantes (ativas ou não) para garantir consistência
        com a constraint UNIQUE do banco em (tenant_id, sku).

        Args:
            sku: SKU a ser validado
            tenant_id: ID do tenant
            exclude_variant_id: ID da variante a excluir (para updates)

        Returns:
            True se o SKU é válido (único)
        """
        stmt = (
            select(func.count())
            .select_from(ProductVariant)
            .where(
                ProductVariant.sku == sku.upper(),
                ProductVariant.tenant_id == tenant_id,
            )
        )

        if exclude_variant_id is not None:
            stmt = stmt.where(ProductVariant.id != exclude_variant_id)

        result = await self.db.execute(stmt)
        count = result.scalar()

        return count == 0