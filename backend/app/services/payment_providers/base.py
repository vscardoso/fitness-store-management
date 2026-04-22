"""
Classes base (abstratas) para providers de pagamento.

Todos os providers de terminal (maquininha) implementam BaseTerminalProvider.
Todos os providers de PIX implementam BasePixProvider.

As implementações concretas ficam em módulos separados:
  - mercadopago.py  → MercadoPagoTerminalProvider, MercadoPagoPixProvider
  - manual.py       → ManualTerminalProvider (Cielo, Stone, Rede, GetNet, etc.)
"""
from abc import ABC, abstractmethod
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession


class BaseTerminalProvider(ABC):
    """
    Interface para integração com terminais físicos (maquininhas).

    Cada método recebe db + parâmetros necessários e retorna um dict
    padronizado que o PDVService usa para montar a resposta ao cliente.
    """

    provider_name: str  # ex: "mercadopago", "cielo", "stone"

    @abstractmethod
    async def setup_terminal(
        self,
        db: AsyncSession,
        terminal_id: int,
        tenant_id: int,
    ) -> dict:
        """
        Configura o terminal no provider externo (ex: cria POS no MP).
        Salva IDs externos de volta no registro PDVTerminal.
        Retorna dict com detalhes da configuração.
        """
        ...

    @abstractmethod
    async def create_payment(
        self,
        db: AsyncSession,
        tenant_id: int,
        sale_id: int,
        terminal_id: int,
        total_amount: float,
        payment_type: Optional[str],
        installments: Optional[int],
        description: Optional[str],
        expiration_time: Optional[str],
    ) -> dict:
        """
        Envia cobrança para o terminal físico.
        Salva o order_id externo em Sale.payment_reference.
        Retorna dict com: sale_id, terminal_id, order_id, status, message.
        """
        ...

    @abstractmethod
    async def get_payment_status(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """
        Consulta status atual do pagamento (pode fazer polling externo ou local).
        Confirma ou cancela a venda automaticamente se necessário.
        Retorna dict com: sale_id, order_id, status, paid, message.
        """
        ...

    @abstractmethod
    async def cancel_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """
        Cancela pagamento pendente.
        Retorna dict com: sale_id, order_id, status, message.
        """
        ...

    @abstractmethod
    async def refund_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """
        Reembolso total de pagamento já confirmado.
        Retorna dict com: sale_id, order_id, refund_id, status, message.
        """
        ...


class BasePixProvider(ABC):
    """
    Interface para geração e consulta de pagamentos PIX.

    PIX é um padrão do Banco Central — a interface é genérica,
    mas cada provider tem sua própria API de geração de QR Code.
    """

    provider_name: str  # ex: "mercadopago"

    @abstractmethod
    async def create_pix_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
        payer_email: Optional[str] = None,
        mp_token: Optional[str] = None,
    ) -> dict:
        """
        Gera QR Code PIX para uma venda existente.
        Registra PixTransaction para auditoria e idempotência.
        Retorna dict com: sale_id, payment_id, qr_code, qr_code_base64, expires_at, status, message.
        """
        ...

    @abstractmethod
    async def get_pix_status(
        self,
        db: AsyncSession,
        payment_id: str,
        tenant_id: int,
    ) -> dict:
        """
        Consulta status do pagamento PIX (polling ou lookup local).
        Confirma a venda automaticamente quando aprovado.
        Retorna dict com: sale_id, payment_id, status, paid, message.
        """
        ...

    @abstractmethod
    async def refund_pix(
        self,
        db: AsyncSession,
        payment_id: str,
        tenant_id: int,
    ) -> dict:
        """
        Reembolso de pagamento PIX aprovado.
        Atualiza PixTransaction e venda associada.
        Retorna dict com: payment_id, refund_id, sale_id, status, message.
        """
        ...
