"""
Serviço PDV — orquestrador agnóstico de provider.

Delega operações para o provider correto baseado em terminal.provider.
Mantém lógica genérica: PIX start atômico, expiração de PIX, helpers de status.

Providers suportados:
  - mercadopago: integração completa (terminal + PIX)
  - cielo, stone, rede, getnet, pagseguro, sumup: confirmação manual
  - manual: sem integração externa
"""
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.models.pdv_terminal import PDVTerminal
from app.models.pix_transaction import PixTransaction
from app.models.sale import Sale, SaleStatus
from app.repositories.pdv_repository import PDVTerminalRepository
from app.services.payment_providers.factory import (
    get_terminal_provider,
    get_pix_provider,
    list_providers,
)

# Provider PIX ativo — configurado via PIX_PROVIDER no .env
_DEFAULT_PIX_PROVIDER = settings.PIX_PROVIDER

logger = logging.getLogger(__name__)


class PDVService:
    """Orquestrador PDV — roteia para o provider correto."""

    def __init__(self):
        self.repo = PDVTerminalRepository()

    # ── Providers disponíveis ──────────────────────────────────────────────────

    @staticmethod
    def get_available_providers() -> dict:
        return list_providers()

    # ── Setup loja (MP-specific, delegado ao provider) ─────────────────────────

    async def setup_provider_store(self, db: AsyncSession, tenant_id: int, payload, provider: str = "mercadopago") -> dict:
        """Setup da loja no provider externo (ex: criar loja no MP)."""
        tp = get_terminal_provider(provider)
        if not hasattr(tp, 'setup_mp_store'):
            raise ValueError(f"Provider '{provider}' não suporta setup de loja.")
        return await tp.setup_mp_store(db, tenant_id, payload)

    # ── Setup terminal ─────────────────────────────────────────────────────────

    async def setup_terminal(self, db: AsyncSession, terminal_id: int, tenant_id: int) -> dict:
        """Configura terminal no provider externo."""
        terminal = await self.repo.get(db, terminal_id)
        if not terminal or terminal.tenant_id != tenant_id:
            raise ValueError("Terminal não encontrado.")
        tp = get_terminal_provider(terminal.provider)
        return await tp.setup_terminal(db, terminal_id, tenant_id)

    # ── Listar devices do provider ─────────────────────────────────────────────

    async def list_provider_devices(
        self, db: AsyncSession, tenant_id: int,
        provider: str = "mercadopago",
        store_id: Optional[str] = None,
        pos_id: Optional[str] = None,
    ) -> dict:
        """Lista dispositivos físicos do provider (ex: maquininhas MP)."""
        tp = get_terminal_provider(provider)
        if not hasattr(tp, 'list_mp_terminals'):
            raise ValueError(f"Provider '{provider}' não suporta listagem de dispositivos.")
        return await tp.list_mp_terminals(db, tenant_id, store_id, pos_id)

    # ── Ativar modo PDV ────────────────────────────────────────────────────────

    async def activate_pdv_mode(
        self, db: AsyncSession, terminal_id: int,
        tenant_id: int, device_id: str,
    ) -> dict:
        """Ativa modo PDV no dispositivo físico."""
        terminal = await self.repo.get(db, terminal_id)
        if not terminal or terminal.tenant_id != tenant_id:
            raise ValueError("Terminal não encontrado.")
        tp = get_terminal_provider(terminal.provider)
        if not hasattr(tp, 'activate_pdv_mode'):
            raise ValueError(f"Provider '{terminal.provider}' não suporta ativação de PDV.")
        return await tp.activate_pdv_mode(db, terminal_id, tenant_id, device_id)

    # ── Pagamento via terminal ─────────────────────────────────────────────────

    async def create_order(self, db: AsyncSession, tenant_id: int, payload) -> dict:
        """Cria pagamento no terminal usando o provider correto."""
        terminal = await self.repo.get(db, payload.terminal_id)
        if not terminal or terminal.tenant_id != tenant_id:
            raise ValueError("Terminal não encontrado.")

        tp = get_terminal_provider(terminal.provider)
        return await tp.create_payment(
            db=db,
            tenant_id=tenant_id,
            sale_id=payload.sale_id,
            terminal_id=payload.terminal_id,
            total_amount=payload.total_amount,
            payment_type=payload.payment_type,
            installments=payload.installments,
            description=payload.description,
            expiration_time=payload.expiration_time,
            installments_cost=getattr(payload, 'installments_cost', 'seller'),
        )

    async def get_order_status(self, db: AsyncSession, sale_id: int, tenant_id: int) -> dict:
        """Consulta status do pagamento."""
        # Tenta detectar provider pela venda (fallback: mercadopago)
        provider = await self._get_sale_provider(db, sale_id, tenant_id)
        tp = get_terminal_provider(provider)
        return await tp.get_payment_status(db, sale_id, tenant_id)

    async def cancel_order(self, db: AsyncSession, sale_id: int, tenant_id: int) -> dict:
        provider = await self._get_sale_provider(db, sale_id, tenant_id)
        tp = get_terminal_provider(provider)
        return await tp.cancel_payment(db, sale_id, tenant_id)

    async def refund_order(self, db: AsyncSession, sale_id: int, tenant_id: int) -> dict:
        provider = await self._get_sale_provider(db, sale_id, tenant_id)
        tp = get_terminal_provider(provider)
        return await tp.refund_payment(db, sale_id, tenant_id)

    # ── Webhook ────────────────────────────────────────────────────────────────

    async def process_webhook(self, db: AsyncSession, payload: dict, provider: str = "mercadopago") -> None:
        """Processa webhook do provider. Por enquanto só MP tem webhook."""
        tp = get_terminal_provider(provider)
        if hasattr(tp, 'process_webhook'):
            await tp.process_webhook(db, payload)

    @staticmethod
    def verify_webhook_signature(
        x_signature: Optional[str],
        x_request_id: Optional[str],
        data_id: Optional[str],
        provider: str = "mercadopago",
    ) -> bool:
        """Valida assinatura de webhook do provider."""
        tp = get_terminal_provider(provider)
        if hasattr(tp, 'verify_webhook_signature'):
            return tp.verify_webhook_signature(x_signature, x_request_id, data_id)
        return True  # providers sem webhook sempre passam

    # ── PIX ────────────────────────────────────────────────────────────────────

    async def _get_mp_token_for_tenant(self, db: AsyncSession, tenant_id: int) -> str:
        """Retorna o MP access_token do lojista (OAuth) ou fallback do .env."""
        from app.models.store import Store
        result = await db.execute(
            select(Store).where(Store.id == tenant_id)
        )
        store = result.scalar_one_or_none()
        if store and store.mp_access_token:
            return store.mp_access_token
        # fallback para token global do .env (dev/teste)
        return settings.MP_ACCESS_TOKEN

    async def create_pix_payment(
        self, db: AsyncSession, sale_id: int, tenant_id: int,
        payer_email: Optional[str] = None, provider: Optional[str] = None,
    ) -> dict:
        provider = provider or _DEFAULT_PIX_PROVIDER
        pp = get_pix_provider(provider)
        kwargs = {}
        if provider == "mercadopago":
            kwargs["mp_token"] = await self._get_mp_token_for_tenant(db, tenant_id)
        return await pp.create_pix_payment(db, sale_id, tenant_id, payer_email, **kwargs)

    async def get_pix_payment_status(
        self, db: AsyncSession, payment_id: str, tenant_id: int,
    ) -> dict:
        # Detecta provider pelo PixTransaction
        provider = await self._get_pix_provider(db, payment_id, tenant_id)
        pp = get_pix_provider(provider)
        return await pp.get_pix_status(db, payment_id, tenant_id)

    async def refund_pix_payment(
        self, db: AsyncSession, payment_id: str, tenant_id: int,
    ) -> dict:
        provider = await self._get_pix_provider(db, payment_id, tenant_id)
        pp = get_pix_provider(provider)
        return await pp.refund_pix(db, payment_id, tenant_id)

    # ── PIX Start (atômico) ────────────────────────────────────────────────────

    async def create_pix_start(
        self, db: AsyncSession, tenant_id: int, seller_id: int,
        payload: dict, payer_email: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> dict:
        provider = provider or _DEFAULT_PIX_PROVIDER
        """Cria venda PENDING + gera QR Code PIX atomicamente."""
        from app.schemas.sale import SaleCreate, SaleItemCreate, PaymentCreate
        from app.models.sale import PaymentMethod as PaymentMethodEnum
        from app.services.sale_service import SaleService

        items = [SaleItemCreate(**i) for i in payload.get("items", [])]
        payments = [PaymentCreate(**p) for p in payload.get("payments", [])]
        sale_data = SaleCreate(
            customer_id=payload.get("customer_id"),
            payment_method=PaymentMethodEnum.PIX,
            items=items,
            payments=payments,
            discount_amount=payload.get("discount_amount", 0),
            tax_amount=payload.get("tax_amount", 0),
            notes=payload.get("notes"),
        )

        sale_svc = SaleService(db)
        sale = await sale_svc.create_sale(
            sale_data, seller_id, tenant_id=tenant_id, keep_pending=True
        )

        try:
            pix = await self.create_pix_payment(db, sale.id, tenant_id, payer_email, provider)
        except Exception as exc:
            logger.error("PIX generation failed for sale %s, cancelling: %s", sale.id, exc)
            await db.execute(
                update(Sale).where(Sale.id == sale.id)
                .values(status=SaleStatus.CANCELLED, is_active=False)
            )
            await db.commit()
            raise ValueError(str(exc)) from exc

        return {
            "sale_id": sale.id,
            "sale_number": sale.sale_number,
            "total_amount": float(sale.total_amount),
            **{k: pix[k] for k in ("payment_id", "qr_code", "qr_code_base64", "expires_at", "status", "message")},
        }

    # ── Expiração de PIX (scheduler) ──────────────────────────────────────────

    async def expire_pending_pix(self, db: AsyncSession) -> int:
        """Expira PIX pendentes com QR Code vencido. Chamado pelo scheduler."""
        from datetime import datetime, timezone
        from app.services.audit_service import AuditService
        from app.core.payment_events import signal_payment

        now = datetime.now(timezone.utc)
        expired_res = await db.execute(
            select(PixTransaction).where(
                PixTransaction.status == "pending",
                PixTransaction.expires_at != None,  # noqa: E711
                PixTransaction.expires_at < now,
            )
        )
        expired = expired_res.scalars().all()

        count = 0
        for pix_tx in expired:
            await db.execute(
                update(PixTransaction).where(PixTransaction.id == pix_tx.id)
                .values(status="expired")
            )
            # Cancela venda associada
            result = await db.execute(select(Sale).where(Sale.id == pix_tx.sale_id))
            sale = result.scalar_one_or_none()
            if sale and sale.status == SaleStatus.PENDING:
                await db.execute(
                    update(Sale).where(Sale.id == pix_tx.sale_id)
                    .values(status=SaleStatus.CANCELLED)
                )
                if sale.payment_reference:
                    signal_payment(sale.payment_reference, {"status": "cancelled", "paid": False})

            await AuditService.log(
                db, "PIX_EXPIRED",
                tenant_id=pix_tx.tenant_id, entity="pix_transaction", entity_id=pix_tx.id,
                detail={"payment_id": pix_tx.payment_id, "sale_id": pix_tx.sale_id,
                        "expired_at": str(pix_tx.expires_at)},
            )
            count += 1

        if count:
            await db.commit()
            logger.info("PIX expiração: %d transações expiradas", count)
        return count

    # ── Terminal Start (atômico) ───────────────────────────────────────────────

    async def create_terminal_start(
        self, db: AsyncSession, tenant_id: int, seller_id: int,
        payload: dict,
    ) -> dict:
        """Cria venda PENDING + envia para terminal atomicamente."""
        from app.schemas.sale import SaleCreate, SaleItemCreate, PaymentCreate
        from app.models.sale import PaymentMethod as PaymentMethodEnum
        from app.services.sale_service import SaleService

        terminal_id = payload["terminal_id"]
        payment_type = payload.get("payment_type", "credit_card")
        installments = payload.get("installments", 1)

        pm = (
            PaymentMethodEnum.CREDIT_CARD
            if payment_type == "credit_card"
            else PaymentMethodEnum.DEBIT_CARD
        )

        items = [SaleItemCreate(**i) for i in payload.get("items", [])]
        payments = [PaymentCreate(**p) for p in payload.get("payments", [])]
        sale_data = SaleCreate(
            customer_id=payload.get("customer_id"),
            payment_method=pm,
            items=items,
            payments=payments,
            discount_amount=payload.get("discount_amount", 0),
            tax_amount=payload.get("tax_amount", 0),
            notes=payload.get("notes"),
        )

        sale_svc = SaleService(db)
        sale = await sale_svc.create_sale(
            sale_data, seller_id, tenant_id=tenant_id, keep_pending=True
        )

        terminal = await self.repo.get(db, terminal_id)
        if not terminal or terminal.tenant_id != tenant_id:
            # Cancelar venda se terminal inválido
            await db.execute(
                update(Sale)
                .where(Sale.id == sale.id)
                .values(status=SaleStatus.CANCELLED, is_active=False)
            )
            await db.commit()
            raise ValueError("Terminal não encontrado.")

        try:
            tp = get_terminal_provider(terminal.provider)
            await tp.create_payment(
                db=db,
                tenant_id=tenant_id,
                sale_id=sale.id,
                terminal_id=terminal_id,
                total_amount=float(sale.total_amount),
                payment_type=payment_type,
                installments=installments,
                description=f"Venda #{sale.sale_number}",
                expiration_time="PT15M",
                installments_cost="seller",
            )
        except Exception as exc:
            logger.error(
                "Terminal payment failed for sale %s, cancelling: %s", sale.id, exc
            )
            await db.execute(
                update(Sale)
                .where(Sale.id == sale.id)
                .values(status=SaleStatus.CANCELLED, is_active=False)
            )
            await db.commit()
            raise ValueError(str(exc)) from exc

        return {
            "sale_id": sale.id,
            "sale_number": sale.sale_number,
            "total_amount": float(sale.total_amount),
            "terminal_id": terminal_id,
            "terminal_name": terminal.name,
            "provider": terminal.provider,
            "status": "pending",
            "message": f"Venda criada. Cobre na maquininha {terminal.name} e confirme.",
        }

    # ── Confirmação manual (providers sem integração) ──────────────────────────

    async def confirm_manual_payment(self, db: AsyncSession, sale_id: int, tenant_id: int) -> dict:
        """Confirma pagamento manualmente (para providers sem integração cloud)."""
        from app.services.audit_service import AuditService
        from app.core.payment_events import signal_payment

        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise ValueError("Venda não encontrada.")
        if sale.status != SaleStatus.PENDING:
            raise ValueError(f"Venda não está pendente (status: {sale.status}).")

        await db.execute(
            update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.COMPLETED)
        )
        await AuditService.log(
            db, "PDV_MANUAL_CONFIRMED",
            tenant_id=tenant_id, entity="sale", entity_id=sale_id,
            detail={"from": "PENDING", "to": "COMPLETED", "sale_number": sale.sale_number},
        )
        await db.commit()

        if sale.payment_reference:
            signal_payment(sale.payment_reference, {"status": "approved", "paid": True})

        return {
            "sale_id": sale_id,
            "status": "completed",
            "message": "Pagamento confirmado manualmente.",
        }

    # ── Helpers internos ───────────────────────────────────────────────────────

    async def _get_sale_provider(self, db: AsyncSession, sale_id: int, tenant_id: int) -> str:
        """Detecta provider pela venda (via terminal usado ou fallback)."""
        # Tenta encontrar pela referência de pagamento
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            return "mercadopago"

        # Se tem payment_reference que começa com "manual_", é manual
        ref = sale.payment_reference or ""
        if ref.startswith("manual_"):
            return "manual"

        return "mercadopago"  # fallback

    async def _get_pix_provider(self, db: AsyncSession, payment_id: str, tenant_id: int) -> str:
        """Detecta provider pelo PixTransaction."""
        result = await db.execute(
            select(PixTransaction.provider).where(
                PixTransaction.payment_id == payment_id,
                PixTransaction.tenant_id == tenant_id,
            )
        )
        row = result.scalar_one_or_none()
        return row or _DEFAULT_PIX_PROVIDER
