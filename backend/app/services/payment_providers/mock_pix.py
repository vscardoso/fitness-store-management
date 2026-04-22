"""
Provider PIX Mock — para desenvolvimento local sem credenciais externas.

Ativado via PIX_PROVIDER=mock no .env.
Retorna QR Code falso mas estruturalmente válido para testar o fluxo mobile.
Simula aprovação automática no polling para fechar o fluxo end-to-end.
"""
import logging
import time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.sale import Sale, SaleStatus
from .base import BasePixProvider

logger = logging.getLogger(__name__)

# QR Code EMV/PIX estático — não é liquidável, mas renderiza no app
_MOCK_QR_CODE = (
    "00020101021226580014br.gov.bcb.pix0136"
    "00000000-0000-0000-0000-000000000000"
    "5204000053039865802BR5925"
    "LOJA MOCK DESENVOLVIMENTO"
    "6009SAO PAULO62070503***6304ABCD"
)

# PNG 1x1 pixel transparente em base64 — suficiente para o mobile renderizar sem quebrar
_MOCK_QR_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


class MockPixProvider(BasePixProvider):
    """
    Provider PIX de mock para desenvolvimento local.

    Comportamento:
    - create_pix_payment: retorna QR Code fake, salva PixTransaction com payment_id "mock_*"
    - get_pix_status: retorna approved imediatamente (para fechar fluxo no mobile)
    - refund_pix: marca venda como REFUNDED localmente
    """

    provider_name = "mock"

    async def create_pix_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
        payer_email: Optional[str] = None,
        mp_token: Optional[str] = None,
    ) -> dict:
        from app.models.pix_transaction import PixTransaction

        payment_id = f"mock_pix_{sale_id}_{int(time.time())}"

        # Verificar se já existe transação mock pendente para essa venda
        result = await db.execute(
            select(PixTransaction).where(
                PixTransaction.sale_id == sale_id,
                PixTransaction.status == "pending",
                PixTransaction.tenant_id == tenant_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            logger.info("[Mock PIX] Reutilizando transação existente: %s", existing.payment_id)
            return {
                "sale_id": sale_id,
                "payment_id": existing.payment_id,
                "qr_code": _MOCK_QR_CODE,
                "qr_code_base64": _MOCK_QR_BASE64,
                "expires_at": None,
                "status": "pending",
                "message": "[Mock] QR Code de desenvolvimento gerado.",
            }

        # Buscar sale para obter o valor
        sale_result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = sale_result.scalar_one_or_none()
        if not sale:
            raise ValueError(f"Venda {sale_id} não encontrada.")

        tx = PixTransaction(
            payment_id=payment_id,
            sale_id=sale_id,
            tenant_id=tenant_id,
            amount_expected=float(sale.total_amount),
            status="pending",
            mp_external_reference=f"mock_sale_{sale_id}_tenant_{tenant_id}",
            payer_email=payer_email or "dev@mock.pix",
            provider="mock",
        )
        db.add(tx)
        await db.commit()

        logger.info("[Mock PIX] Transação criada: %s (sale=%s)", payment_id, sale_id)
        return {
            "sale_id": sale_id,
            "payment_id": payment_id,
            "qr_code": _MOCK_QR_CODE,
            "qr_code_base64": _MOCK_QR_BASE64,
            "expires_at": None,
            "status": "pending",
            "message": "[Mock] QR Code de desenvolvimento gerado. Aprovação automática no próximo polling.",
        }

    async def get_pix_status(
        self,
        db: AsyncSession,
        payment_id: str,
        tenant_id: int,
    ) -> dict:
        """Aprova automaticamente — fecha o fluxo mobile em desenvolvimento."""
        from app.models.pix_transaction import PixTransaction
        from datetime import datetime, timezone

        result = await db.execute(
            select(PixTransaction).where(
                PixTransaction.payment_id == payment_id,
                PixTransaction.tenant_id == tenant_id,
            )
        )
        tx = result.scalar_one_or_none()
        if not tx:
            return {
                "sale_id": None,
                "payment_id": payment_id,
                "status": "unknown",
                "paid": False,
                "message": "Transação mock não encontrada.",
            }

        # Se já aprovado, só retorna
        if tx.status == "approved":
            return {
                "sale_id": tx.sale_id,
                "payment_id": payment_id,
                "status": "approved",
                "paid": True,
                "message": "[Mock] Pagamento aprovado.",
            }

        # Aprovar automaticamente
        now = datetime.now(timezone.utc)
        await db.execute(
            update(PixTransaction)
            .where(PixTransaction.payment_id == payment_id)
            .values(status="approved", confirmed_at=now, amount_paid=tx.amount_expected)
        )
        await db.execute(
            update(Sale)
            .where(Sale.id == tx.sale_id)
            .values(status=SaleStatus.COMPLETED)
        )
        await db.commit()

        logger.info("[Mock PIX] Pagamento aprovado automaticamente: %s (sale=%s)", payment_id, tx.sale_id)
        return {
            "sale_id": tx.sale_id,
            "payment_id": payment_id,
            "status": "approved",
            "paid": True,
            "message": "[Mock] Pagamento aprovado automaticamente (modo desenvolvimento).",
        }

    async def refund_pix(
        self,
        db: AsyncSession,
        payment_id: str,
        tenant_id: int,
    ) -> dict:
        from app.models.pix_transaction import PixTransaction

        result = await db.execute(
            select(PixTransaction).where(
                PixTransaction.payment_id == payment_id,
                PixTransaction.tenant_id == tenant_id,
            )
        )
        tx = result.scalar_one_or_none()
        if not tx:
            raise ValueError(f"Transação PIX mock '{payment_id}' não encontrada.")

        await db.execute(
            update(PixTransaction)
            .where(PixTransaction.payment_id == payment_id)
            .values(status="refunded")
        )
        await db.execute(
            update(Sale).where(Sale.id == tx.sale_id).values(status=SaleStatus.REFUNDED)
        )
        await db.commit()

        return {
            "payment_id": payment_id,
            "refund_id": f"mock_refund_{payment_id}",
            "sale_id": tx.sale_id,
            "status": "refunded",
            "message": "[Mock] Estorno registrado localmente.",
        }
