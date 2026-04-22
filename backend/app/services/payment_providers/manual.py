"""
Provider Manual — para terminais sem integração cloud (Cielo, Stone, Rede, GetNet, etc.).

O operador confirma o pagamento manualmente após ver a aprovação na maquininha.
Não há comunicação automática com APIs externas.
"""
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.sale import Sale, SaleStatus
from .base import BaseTerminalProvider

logger = logging.getLogger(__name__)


class ManualTerminalProvider(BaseTerminalProvider):
    """
    Provider genérico para terminais que não têm integração cloud.
    O pagamento é confirmado manualmente pelo operador.
    """

    provider_name = "manual"

    async def setup_terminal(
        self,
        db: AsyncSession,
        terminal_id: int,
        tenant_id: int,
    ) -> dict:
        """Marca terminal como configurado (sem chamada externa)."""
        from app.models.pdv_terminal import PDVTerminal
        await db.execute(
            update(PDVTerminal).where(PDVTerminal.id == terminal_id)
            .values(is_configured=True, is_pdv_active=True)
        )
        await db.commit()
        return {
            "terminal_id": terminal_id,
            "message": "Terminal configurado para uso manual. Confirme pagamentos manualmente.",
        }

    async def create_payment(
        self,
        db: AsyncSession,
        tenant_id: int,
        sale_id: int,
        terminal_id: int,
        total_amount: float,
        payment_type: Optional[str] = "credit_card",
        installments: Optional[int] = 1,
        description: Optional[str] = "Venda",
        expiration_time: Optional[str] = "PT15M",
        installments_cost: Optional[str] = "seller",
    ) -> dict:
        """
        Registra intenção de pagamento local.
        O operador deve cobrar na maquininha e confirmar manualmente.
        """
        await db.execute(
            update(Sale).where(Sale.id == sale_id)
            .values(status=SaleStatus.PENDING)
        )
        await db.commit()

        logger.info("Pagamento manual criado: sale=%s terminal=%s amount=%.2f",
                    sale_id, terminal_id, total_amount)
        return {
            "sale_id": sale_id,
            "terminal_id": terminal_id,
            "order_id": f"manual_{sale_id}",
            "status": "awaiting_manual_confirmation",
            "external_reference": f"sale_{sale_id}_tenant_{tenant_id}",
            "message": "Cobre na maquininha e confirme o pagamento manualmente.",
        }

    async def get_payment_status(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """Retorna status atual da venda (sem polling externo)."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            return {
                "sale_id": sale_id,
                "order_id": None,
                "status": "unknown",
                "paid": False,
                "message": "Venda não encontrada.",
            }

        paid = sale.status == SaleStatus.COMPLETED
        return {
            "sale_id": sale_id,
            "order_id": f"manual_{sale_id}",
            "status": sale.status.value if hasattr(sale.status, 'value') else str(sale.status),
            "paid": paid,
            "message": "Pagamento confirmado!" if paid else "Aguardando confirmação manual.",
        }

    async def cancel_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """Cancela localmente."""
        await db.execute(
            update(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
            .values(status=SaleStatus.CANCELLED)
        )
        await db.commit()
        return {
            "sale_id": sale_id,
            "order_id": f"manual_{sale_id}",
            "status": "canceled",
            "message": "Pagamento cancelado.",
        }

    async def refund_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """Marca como reembolsado localmente. Estorno real deve ser feito na maquininha."""
        await db.execute(
            update(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
            .values(status=SaleStatus.REFUNDED)
        )
        await db.commit()
        return {
            "sale_id": sale_id,
            "order_id": f"manual_{sale_id}",
            "status": "refunded",
            "message": "Venda marcada como reembolsada. Execute o estorno diretamente na maquininha.",
        }
