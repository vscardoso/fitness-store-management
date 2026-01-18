"""
Enums para o sistema de envios condicionais.
"""
from enum import Enum


class ShipmentStatus(str, Enum):
    """
    Status do envio condicional (fluxo completo).

    Fluxo:
    1. PENDING → Cliente confirmou interesse, aguardando envio
    2. SENT → Pacote enviado, aguardando retorno do cliente
    3. RETURNED_NO_SALE → Cliente devolveu TUDO, não vendeu nada
    4. COMPLETED_PARTIAL_SALE → Cliente devolveu ALGUNS itens, comprou outros
    5. COMPLETED_FULL_SALE → Cliente ficou com TUDO, vendeu 100%
    """
    PENDING = "PENDING"
    SENT = "SENT"
    RETURNED_NO_SALE = "RETURNED_NO_SALE"
    COMPLETED_PARTIAL_SALE = "COMPLETED_PARTIAL_SALE"
    COMPLETED_FULL_SALE = "COMPLETED_FULL_SALE"

    @classmethod
    def get_all_values(cls):
        """Retorna lista de todos os valores do enum."""
        return [status.value for status in cls]

    @classmethod
    def is_final_status(cls, status: str) -> bool:
        """Verifica se é um status final (não pode mais mudar)."""
        return status in [
            cls.RETURNED_NO_SALE.value,
            cls.COMPLETED_PARTIAL_SALE.value,
            cls.COMPLETED_FULL_SALE.value
        ]

    @classmethod
    def is_completed_status(cls, status: str) -> bool:
        """Verifica se houve alguma venda (parcial ou total)."""
        return status in [
            cls.COMPLETED_PARTIAL_SALE.value,
            cls.COMPLETED_FULL_SALE.value
        ]
