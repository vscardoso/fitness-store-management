"""
Serviço de Geração de Código de Barras

Gera códigos de barras únicos para produtos no formato EAN-13.
Formato: 789{TENANT:2}{SEQ:7}{CHECK}

- 789: Prefixo Brasil (GS1)
- TENANT: 2 dígitos do tenant_id
- SEQ: 7 dígitos sequenciais
- CHECK: Dígito verificador EAN-13

Exemplo: 7890100000015
"""

import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.product import Product

logger = logging.getLogger(__name__)


class BarcodeService:
    """Serviço para geração e validação de códigos de barras."""

    # Prefixo GS1 Brasil
    PREFIX = "789"

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def calculate_ean13_check_digit(code_12: str) -> str:
        """
        Calcula o dígito verificador para EAN-13.

        O dígito verificador é calculado usando o algoritmo padrão GS1:
        1. Soma os dígitos nas posições ímpares (1, 3, 5, ...) com peso 1
        2. Soma os dígitos nas posições pares (2, 4, 6, ...) com peso 3
        3. Subtrai de 10 o resto da divisão por 10

        Args:
            code_12: String com os primeiros 12 dígitos

        Returns:
            Dígito verificador (0-9)
        """
        if len(code_12) != 12 or not code_12.isdigit():
            raise ValueError(f"Código deve ter 12 dígitos numéricos: {code_12}")

        total = 0
        for i, digit in enumerate(code_12):
            weight = 1 if i % 2 == 0 else 3
            total += int(digit) * weight

        check = (10 - (total % 10)) % 10
        return str(check)

    @staticmethod
    def validate_ean13(barcode: str) -> bool:
        """
        Valida se um código EAN-13 é válido.

        Args:
            barcode: Código de barras completo (13 dígitos)

        Returns:
            True se válido, False caso contrário
        """
        if not barcode or len(barcode) != 13 or not barcode.isdigit():
            return False

        code_12 = barcode[:12]
        expected_check = BarcodeService.calculate_ean13_check_digit(code_12)
        return barcode[12] == expected_check

    async def get_next_sequence(self, tenant_id: int) -> int:
        """
        Obtém o próximo número sequencial para o tenant.

        Busca o maior barcode existente do tenant e incrementa.

        Args:
            tenant_id: ID do tenant

        Returns:
            Próximo número sequencial
        """
        # Prefixo do tenant (ex: 78901 para tenant 1)
        tenant_prefix = f"{self.PREFIX}{tenant_id:02d}"

        # Buscar o maior barcode do tenant que começa com o prefixo
        stmt = select(func.max(Product.barcode)).where(
            Product.tenant_id == tenant_id,
            Product.barcode.ilike(f"{tenant_prefix}%"),
            Product.is_active == True,
        )

        result = await self.db.execute(stmt)
        max_barcode = result.scalar()

        if max_barcode and len(max_barcode) == 13:
            # Extrair a parte sequencial (posições 5-11, 7 dígitos)
            try:
                current_seq = int(max_barcode[5:12])
                return current_seq + 1
            except ValueError:
                pass

        # Começar do 1 se não houver barcodes
        return 1

    async def generate_barcode(self, tenant_id: int, product_id: Optional[int] = None) -> str:
        """
        Gera um novo código de barras EAN-13 único.

        Formato: 789{TT}{SSSSSSS}{C}
        - 789: Prefixo Brasil
        - TT: Tenant ID (2 dígitos)
        - SSSSSSS: Sequencial (7 dígitos)
        - C: Check digit

        Args:
            tenant_id: ID do tenant
            product_id: ID do produto (opcional, usado para logs)

        Returns:
            Código de barras EAN-13 válido
        """
        # Obter próximo sequencial
        seq = await self.get_next_sequence(tenant_id)

        # Garantir que tenant_id cabe em 2 dígitos
        tenant_part = tenant_id % 100

        # Montar código de 12 dígitos
        code_12 = f"{self.PREFIX}{tenant_part:02d}{seq:07d}"

        # Calcular dígito verificador
        check_digit = self.calculate_ean13_check_digit(code_12)

        barcode = f"{code_12}{check_digit}"

        logger.info(f"Generated barcode {barcode} for tenant {tenant_id}, product {product_id}")

        return barcode

    async def is_barcode_available(self, barcode: str, tenant_id: int, exclude_product_id: Optional[int] = None) -> bool:
        """
        Verifica se um código de barras está disponível para uso.

        Args:
            barcode: Código de barras a verificar
            tenant_id: ID do tenant
            exclude_product_id: ID do produto a excluir da verificação (para edição)

        Returns:
            True se disponível, False se já existe
        """
        stmt = select(Product.id).where(
            Product.barcode == barcode,
            Product.tenant_id == tenant_id,
            Product.is_active == True,
        )

        if exclude_product_id:
            stmt = stmt.where(Product.id != exclude_product_id)

        result = await self.db.execute(stmt)
        existing = result.scalar()

        return existing is None

    async def generate_unique_barcode(self, tenant_id: int, max_attempts: int = 10) -> str:
        """
        Gera um código de barras garantidamente único.

        Tenta gerar até max_attempts vezes, incrementando o sequencial.

        Args:
            tenant_id: ID do tenant
            max_attempts: Máximo de tentativas

        Returns:
            Código de barras único

        Raises:
            ValueError: Se não conseguir gerar após max_attempts tentativas
        """
        for attempt in range(max_attempts):
            barcode = await self.generate_barcode(tenant_id)

            if await self.is_barcode_available(barcode, tenant_id):
                return barcode

            logger.warning(f"Barcode {barcode} already exists, trying again (attempt {attempt + 1})")

        raise ValueError(f"Não foi possível gerar código de barras único após {max_attempts} tentativas")


def generate_barcode_local(tenant_id: int, sequence: int) -> str:
    """
    Função utilitária para gerar código de barras localmente (sem DB).

    Útil para testes e geração em batch.

    Args:
        tenant_id: ID do tenant
        sequence: Número sequencial

    Returns:
        Código de barras EAN-13
    """
    tenant_part = tenant_id % 100
    code_12 = f"789{tenant_part:02d}{sequence:07d}"
    check_digit = BarcodeService.calculate_ean13_check_digit(code_12)
    return f"{code_12}{check_digit}"
