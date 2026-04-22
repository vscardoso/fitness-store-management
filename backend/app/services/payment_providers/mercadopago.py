"""
Provider Mercado Pago — implementação completa de terminal (Point) e PIX.

Toda a lógica específica do Mercado Pago vive aqui. O PDVService
(orquestrador) delega para esta classe quando terminal.provider == "mercadopago".

Fluxo maquininha MP Point:
  1. setup_terminal()   → POST /pos
  2. [físico]           → associar maquininha via app MP
  3. activate_pdv_mode()→ PATCH /terminals/v1/setup
  4. create_payment()   → POST /v1/orders
  5. get_payment_status → GET /v1/orders/{id}  (polling)
  6. process_webhook()  → confirma automaticamente

Fluxo PIX:
  1. create_pix_payment → POST /v1/payments (payment_method_id=pix)
  2. get_pix_status()   → GET /v1/payments/{id}
  3. refund_pix()       → POST /v1/payments/{id}/refunds
"""
import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.models.pdv_terminal import PDVTerminal
from app.models.pix_transaction import PixTransaction
from app.models.store import Store
from app.models.sale import Sale, SaleStatus
from .base import BaseTerminalProvider, BasePixProvider

logger = logging.getLogger(__name__)

# URL base da API do Mercado Pago
MP_BASE_URL = "https://api.mercadopago.com"


def _mp_headers(idempotency_key: Optional[str] = None) -> dict:
    """Monta headers padrão para chamadas à API do Mercado Pago."""
    h = {
        "Authorization": f"Bearer {settings.MP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    if idempotency_key:
        h["X-Idempotency-Key"] = idempotency_key
    return h


class MercadoPagoTerminalProvider(BaseTerminalProvider):
    """
    Implementação do provider de terminal para Mercado Pago Point.
    Suporta maquininhas físicas Point Mini, Point Pro, etc.
    """

    provider_name = "mercadopago"

    # ── Setup loja MP ─────────────────────────────────────────────────────────

    async def setup_mp_store(self, db: AsyncSession, tenant_id: int, payload) -> dict:
        """
        Cria a loja no Mercado Pago e salva mp_store_id na Store.
        Recebe MPStoreSetupRequest (schema Pydantic).
        """
        body = {
            "name": payload.store_name,
            "external_id": payload.external_id,
            "location": {
                "street_number": payload.street_number,
                "street_name": payload.street_name,
                "city_name": payload.city_name,
                "state_name": payload.state_name,
                **({"latitude": payload.latitude} if payload.latitude else {}),
                **({"longitude": payload.longitude} if payload.longitude else {}),
            },
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{MP_BASE_URL}/users/{payload.mp_user_id}/stores",
                json=body, headers=_mp_headers(),
            )
        if resp.status_code not in (200, 201):
            raise ValueError(f"Erro ao criar loja no MP: {resp.text}")

        data = resp.json()
        mp_store_id = str(data["id"])
        await db.execute(
            update(Store).where(Store.id == tenant_id)
            .values(mp_user_id=payload.mp_user_id, mp_store_id=mp_store_id)
        )
        await db.commit()
        return {
            "mp_store_id": mp_store_id,
            "mp_user_id": payload.mp_user_id,
            "message": "Loja criada no Mercado Pago com sucesso.",
        }

    # ── Setup POS (caixa) ─────────────────────────────────────────────────────

    async def setup_terminal(
        self,
        db: AsyncSession,
        terminal_id: int,
        tenant_id: int,
    ) -> dict:
        """Cria o POS no Mercado Pago e salva mp_pos_id + QR Code."""
        from app.repositories.pdv_repository import PDVTerminalRepository
        repo = PDVTerminalRepository()
        terminal = await repo.get(db, terminal_id)
        if not terminal or terminal.tenant_id != tenant_id:
            raise ValueError("Terminal não encontrado.")

        result = await db.execute(select(Store).where(Store.id == tenant_id))
        store = result.scalar_one_or_none()
        if not store or not store.mp_store_id:
            raise ValueError("Loja não configurada no MP. Execute o setup da loja primeiro.")

        body = {
            "name": terminal.name,
            "fixed_amount": False,
            "store_id": store.mp_store_id,
            "external_id": terminal.external_id,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{MP_BASE_URL}/pos", json=body, headers=_mp_headers())

        if resp.status_code not in (200, 201):
            raise ValueError(f"Erro ao criar POS no MP: {resp.text}")

        data = resp.json()
        mp_pos_id = str(data["id"])
        qr = data.get("qr", {})
        await db.execute(
            update(PDVTerminal).where(PDVTerminal.id == terminal_id)
            .values(
                mp_pos_id=mp_pos_id,
                mp_qr_image=qr.get("image"),
                mp_qr_template_document=qr.get("template_document"),
                is_configured=True,
            )
        )
        await db.commit()
        return {
            "terminal_id": terminal_id,
            "mp_pos_id": mp_pos_id,
            "qr_image": qr.get("image"),
            "message": "Terminal configurado no MP com sucesso.",
        }

    # ── Listar maquininhas físicas ─────────────────────────────────────────────

    async def list_mp_terminals(
        self,
        db: AsyncSession,
        tenant_id: int,
        store_id: Optional[str] = None,
        pos_id: Optional[str] = None,
    ) -> dict:
        """Lista terminais físicos (maquininhas Point) vinculados à conta MP."""
        result = await db.execute(select(Store).where(Store.id == tenant_id))
        store = result.scalar_one_or_none()
        if not store or not store.mp_user_id:
            raise ValueError("Loja não configurada no Mercado Pago.")

        params: dict = {"limit": 50, "offset": 0}
        params["store_id"] = store_id or store.mp_store_id or ""
        if pos_id:
            params["pos_id"] = pos_id

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{MP_BASE_URL}/terminals/v1/list",
                params=params,
                headers=_mp_headers(),
            )
        if resp.status_code != 200:
            raise ValueError(f"Erro ao listar terminais no MP: {resp.text}")

        data = resp.json()
        terminals_raw = data.get("data", {}).get("terminals", [])
        terminals = [
            {
                "id": t.get("id"),
                "pos_id": str(t["pos_id"]) if t.get("pos_id") else None,
                "store_id": str(t["store_id"]) if t.get("store_id") else None,
                "external_pos_id": t.get("external_pos_id"),
                "operating_mode": t.get("operating_mode", "UNDEFINED"),
            }
            for t in terminals_raw
        ]
        return {
            "terminals": terminals,
            "total": data.get("paging", {}).get("total", len(terminals)),
        }

    # ── Ativar modo PDV ───────────────────────────────────────────────────────

    async def activate_pdv_mode(
        self,
        db: AsyncSession,
        terminal_id: int,
        tenant_id: int,
        mp_terminal_id: str,
    ) -> dict:
        """Ativa modo PDV no dispositivo físico via PATCH /terminals/v1/setup."""
        from app.repositories.pdv_repository import PDVTerminalRepository
        repo = PDVTerminalRepository()
        terminal = await repo.get(db, terminal_id)
        if not terminal or terminal.tenant_id != tenant_id:
            raise ValueError("Terminal não encontrado.")

        body = {"terminals": [{"id": mp_terminal_id, "operating_mode": "PDV"}]}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.patch(
                f"{MP_BASE_URL}/terminals/v1/setup",
                json=body,
                headers=_mp_headers(),
            )
        if resp.status_code not in (200, 201, 204):
            raise ValueError(f"Erro ao ativar modo PDV: {resp.text}")

        data = resp.json()
        mode = (data.get("terminals") or [{}])[0].get("operating_mode", "PDV")
        await db.execute(
            update(PDVTerminal).where(PDVTerminal.id == terminal_id)
            .values(
                mp_terminal_id=mp_terminal_id,
                operating_mode=mode,
                is_pdv_active=(mode == "PDV"),
            )
        )
        await db.commit()
        return {
            "terminal_id": terminal_id,
            "mp_terminal_id": mp_terminal_id,
            "terminal_device_id": mp_terminal_id,
            "operating_mode": mode,
            "message": f"Terminal em modo {mode}.",
        }

    # ── Criar order (cobrar na maquininha) ────────────────────────────────────

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
        Cria order MP Point — o valor aparece automaticamente na maquininha.
        Usa POST /v1/orders com X-Idempotency-Key para garantir idempotência.
        Salva mp_order_id em Sale.payment_reference.
        """
        from app.repositories.pdv_repository import PDVTerminalRepository
        repo = PDVTerminalRepository()
        terminal = await repo.get(db, terminal_id)
        if not terminal or terminal.tenant_id != tenant_id:
            raise ValueError("Terminal não encontrado.")
        if not terminal.is_pdv_active or not terminal.mp_terminal_id:
            raise ValueError("Terminal não está em modo PDV. Execute a ativação primeiro.")

        idempotency_key = f"sale_{sale_id}_tenant_{tenant_id}"
        external_reference = f"sale_{sale_id}_tenant_{tenant_id}"

        body = {
            "type": "point",
            "external_reference": external_reference,
            "expiration_time": expiration_time or "PT15M",
            "transactions": {
                "payments": [{"amount": f"{total_amount:.2f}"}]
            },
            "config": {
                "point": {
                    "terminal_id": terminal.mp_terminal_id,
                    "print_on_terminal": "no_ticket",
                },
                "payment_method": {
                    "default_type": payment_type or "credit_card",
                    "default_installments": installments or 1,
                    "installments_cost": installments_cost or "seller",
                },
            },
            "description": description or "Venda",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{MP_BASE_URL}/v1/orders",
                json=body,
                headers=_mp_headers(idempotency_key=idempotency_key),
            )

        if resp.status_code not in (200, 201):
            logger.error("MP create order error: %s %s", resp.status_code, resp.text)
            raise ValueError(f"Erro ao criar order no MP: {resp.text}")

        data = resp.json()
        mp_order_id = data["id"]
        mp_payment_id = (data.get("transactions", {}).get("payments") or [{}])[0].get("id")

        await db.execute(
            update(Sale).where(Sale.id == sale_id).values(payment_reference=mp_order_id)
        )
        await db.commit()

        logger.info("Order MP criada: order=%s sale=%s terminal=%s",
                    mp_order_id, sale_id, terminal.mp_terminal_id)
        return {
            "sale_id": sale_id,
            "terminal_id": terminal_id,
            "order_id": mp_order_id,
            "mp_order_id": mp_order_id,  # backward compat
            "mp_payment_id": mp_payment_id,
            "status": data.get("status", "created"),
            "external_reference": external_reference,
            "message": "Order enviada à maquininha. Aguardando o cliente pagar.",
        }

    # ── Consultar status da order (polling) ───────────────────────────────────

    async def get_payment_status(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """Consulta GET /v1/orders/{order_id} e confirma/cancela a venda automaticamente."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale or not sale.payment_reference:
            return {
                "sale_id": sale_id,
                "order_id": None,
                "mp_order_id": None,
                "status": "unknown",
                "paid": False,
                "message": "Order MP não encontrada para esta venda.",
            }

        mp_order_id = sale.payment_reference
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{MP_BASE_URL}/v1/orders/{mp_order_id}",
                headers=_mp_headers(),
            )

        if resp.status_code != 200:
            return {
                "sale_id": sale_id,
                "order_id": mp_order_id,
                "mp_order_id": mp_order_id,
                "status": "unknown",
                "paid": False,
                "message": "Erro ao consultar order no MP.",
            }

        data = resp.json()
        order_status = data.get("status", "unknown")
        paid = order_status == "paid"
        cancelled = order_status in ("canceled", "expired")

        if paid:
            await self._confirm_sale(db, sale_id)
        elif cancelled and sale.status == SaleStatus.PENDING:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.CANCELLED)
            )
            await db.commit()

        return {
            "sale_id": sale_id,
            "order_id": mp_order_id,
            "mp_order_id": mp_order_id,  # backward compat
            "status": order_status,
            "paid": paid,
            "message": "Pagamento confirmado!" if paid else
                       "Order cancelada/expirada." if cancelled else "Aguardando pagamento.",
        }

    # ── Cancelar order ────────────────────────────────────────────────────────

    async def cancel_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """POST /v1/orders/{order_id}/cancel — só funciona se status=created."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale or not sale.payment_reference:
            raise ValueError("Order MP não encontrada para esta venda.")

        mp_order_id = sale.payment_reference
        idempotency_key = f"cancel_{sale_id}_tenant_{tenant_id}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{MP_BASE_URL}/v1/orders/{mp_order_id}/cancel",
                headers=_mp_headers(idempotency_key=idempotency_key),
            )

        if resp.status_code not in (200, 201):
            if resp.status_code == 422:
                raise ValueError(
                    "A order já está no terminal (at_terminal). "
                    "Cancele diretamente na maquininha pressionando o botão de cancelamento."
                )
            raise ValueError(f"Erro ao cancelar order: {resp.text}")

        await db.execute(
            update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.CANCELLED)
        )
        await db.commit()
        logger.info("Order %s cancelada (sale=%s)", mp_order_id, sale_id)
        return {
            "sale_id": sale_id,
            "order_id": mp_order_id,
            "mp_order_id": mp_order_id,  # backward compat
            "status": "canceled",
            "message": "Order cancelada com sucesso.",
        }

    # ── Reembolsar order ──────────────────────────────────────────────────────

    async def refund_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """POST /v1/orders/{order_id}/refund — reembolso total (até 90 dias)."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale or not sale.payment_reference:
            raise ValueError("Order MP não encontrada para esta venda.")

        mp_order_id = sale.payment_reference
        idempotency_key = f"refund_{sale_id}_tenant_{tenant_id}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{MP_BASE_URL}/v1/orders/{mp_order_id}/refund",
                headers=_mp_headers(idempotency_key=idempotency_key),
            )

        if resp.status_code not in (200, 201):
            raise ValueError(f"Erro ao reembolsar order: {resp.text}")

        await db.execute(
            update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.REFUNDED)
        )
        await db.commit()
        data = resp.json()
        refund_id = (data.get("transactions", {}).get("refunds") or [{}])[0].get("id")
        logger.info("Order %s reembolsada (sale=%s)", mp_order_id, sale_id)
        return {
            "sale_id": sale_id,
            "order_id": mp_order_id,
            "mp_order_id": mp_order_id,  # backward compat
            "refund_id": refund_id,
            "status": "refunded",
            "message": "Reembolso processado com sucesso.",
        }

    # ── Processar webhook MP ──────────────────────────────────────────────────

    async def process_webhook(self, db: AsyncSession, payload: dict) -> None:
        """
        Processa webhooks do MP Point (/v1/orders) e PIX (/v1/payments).
        Delega para handlers internos conforme o topic do evento.
        """
        topic = payload.get("type") or payload.get("topic", "")
        action = payload.get("action", "")

        if topic == "payment":
            await self._handle_pix_webhook(db, payload)
            return

        if topic == "order":
            await self._handle_order_webhook(db, payload, action)
            return

        # Compat: formato legado point_integration_wh
        if topic == "point_integration_wh":
            event_data = payload.get("data", {})
            state = event_data.get("state")
            external_ref = event_data.get("external_reference", "")
            if state == "FINISHED" and external_ref.startswith("sale_"):
                try:
                    sale_id = int(external_ref.split("_")[1])
                    await self._confirm_sale(db, sale_id)
                    logger.info("Venda %s confirmada via webhook point_integration_wh", sale_id)
                except (IndexError, ValueError):
                    pass
            return

        # Compat: merchant_order
        if topic != "merchant_order":
            return

        order_id = (payload.get("data") or {}).get("id") or \
                   payload.get("resource", "").split("/")[-1]
        if not order_id:
            return

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{MP_BASE_URL}/merchant_orders/{order_id}",
                headers=_mp_headers(),
            )
        if resp.status_code != 200:
            return

        order = resp.json()
        if order.get("order_status") != "paid":
            return

        external_ref = order.get("external_reference", "")
        if not external_ref.startswith("sale_"):
            return

        try:
            sale_id = int(external_ref.split("_")[1])
            await self._confirm_sale(db, sale_id)
            logger.info("Venda %s confirmada via webhook merchant_order", sale_id)
        except (IndexError, ValueError):
            pass

    # ── Validar assinatura de webhook ─────────────────────────────────────────

    @staticmethod
    def verify_webhook_signature(
        x_signature: Optional[str],
        x_request_id: Optional[str],
        data_id: Optional[str],
        ts: Optional[str] = None,
    ) -> bool:
        """
        Valida header x-signature enviado pelo MP.
        Formato: ts=<timestamp>,v1=<hmac_sha256_hex>
        """
        secret = settings.MP_WEBHOOK_SECRET
        if not secret:
            logger.warning("MP_WEBHOOK_SECRET não configurado — assinatura não validada.")
            return True

        if not x_signature:
            return False

        extracted_ts = ts
        extracted_hash = None
        for part in x_signature.split(","):
            kv = part.split("=", 1)
            if len(kv) == 2:
                k, v = kv[0].strip(), kv[1].strip()
                if k == "ts":
                    extracted_ts = v
                elif k == "v1":
                    extracted_hash = v

        if not extracted_hash or not extracted_ts:
            return False

        parts = []
        if data_id:
            parts.append(f"id:{data_id.lower()}")
        if x_request_id:
            parts.append(f"request-id:{x_request_id}")
        if extracted_ts:
            parts.append(f"ts:{extracted_ts}")
        manifest = ";".join(parts) + ";"

        computed = hmac.new(
            secret.encode(), msg=manifest.encode(), digestmod=hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(computed, extracted_hash)

    # ── Handlers internos de webhook ──────────────────────────────────────────

    async def _handle_pix_webhook(self, db: AsyncSession, payload: dict) -> None:
        """Processa topic=payment (PIX)."""
        payment_id = str((payload.get("data") or {}).get("id", ""))
        if not payment_id:
            return

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{MP_BASE_URL}/v1/payments/{payment_id}",
                headers=_mp_headers(),
            )
        if resp.status_code != 200:
            logger.warning("Falha ao consultar pagamento PIX %s via webhook", payment_id)
            return

        data = resp.json()
        mp_status = data.get("status", "")
        external_ref = data.get("external_reference", "")

        if not external_ref.startswith("sale_"):
            return
        try:
            sale_id = int(external_ref.split("_")[1])
        except (IndexError, ValueError):
            return

        pix_tx_res = await db.execute(
            select(PixTransaction).where(PixTransaction.payment_id == payment_id)
        )
        pix_tx = pix_tx_res.scalar_one_or_none()
        if pix_tx and pix_tx.status not in ("pending",):
            logger.info("Webhook PIX ignorado (já processado): payment=%s status=%s", payment_id, pix_tx.status)
            return

        if mp_status == "approved":
            paid_amount = float(data.get("transaction_amount", 0))
            if pix_tx and abs(float(pix_tx.amount_expected) - paid_amount) > 0.02:
                logger.error(
                    "PIX FRAUDE DETECTADA: payment=%s esperado=%.2f pago=%.2f sale=%s",
                    payment_id, float(pix_tx.amount_expected), paid_amount, sale_id,
                )
                return
            await self._confirm_sale(db, sale_id)
            if pix_tx:
                await db.execute(
                    update(PixTransaction).where(PixTransaction.payment_id == payment_id)
                    .values(
                        status="approved",
                        amount_paid=paid_amount,
                        confirmed_at=datetime.now(timezone.utc),
                        confirmed_by="webhook",
                    )
                )
                await db.commit()
            logger.info("PIX confirmado via webhook: payment=%s sale=%s amount=%.2f",
                        payment_id, sale_id, paid_amount)
        elif mp_status in ("rejected", "cancelled", "refunded"):
            await self._cancel_sale(db, sale_id)
            if pix_tx:
                await db.execute(
                    update(PixTransaction).where(PixTransaction.payment_id == payment_id)
                    .values(status=mp_status)
                )
                await db.commit()
            logger.info("PIX %s via webhook: payment=%s sale=%s", mp_status, payment_id, sale_id)

    async def _handle_order_webhook(self, db: AsyncSession, payload: dict, action: str) -> None:
        """Processa topic=order (maquininha)."""
        event_data = payload.get("data", {})
        external_ref = event_data.get("external_reference", "")
        order_status = event_data.get("status", "")

        if not external_ref.startswith("sale_"):
            logger.debug("Webhook order sem external_reference reconhecível: %s", external_ref)
            return

        try:
            sale_id = int(external_ref.split("_")[1])
        except (IndexError, ValueError):
            return

        if action == "order.processed" or order_status == "processed":
            await self._confirm_sale(db, sale_id)
            logger.info("Venda %s confirmada via webhook order.processed", sale_id)

        elif action in ("order.canceled", "order.expired") or order_status in ("canceled", "expired"):
            await self._cancel_sale(db, sale_id)
            logger.info("Venda %s cancelada via webhook %s", sale_id, action)

        elif action == "order.refunded" or order_status == "refunded":
            await self._refund_sale(db, sale_id)
            logger.info("Venda %s reembolsada via webhook order.refunded", sale_id)

        elif action == "order.failed" or order_status == "failed":
            logger.warning("Pagamento falhou para venda %s (action=%s)", sale_id, action)

        elif action == "order.action_required" or order_status == "action_required":
            logger.warning("Ação requerida na maquininha para venda %s", sale_id)

    # ── Helpers de status de venda ─────────────────────────────────────────────

    async def _confirm_sale(self, db: AsyncSession, sale_id: int) -> None:
        from app.services.audit_service import AuditService
        from app.core.payment_events import signal_payment
        result = await db.execute(select(Sale).where(Sale.id == sale_id))
        sale = result.scalar_one_or_none()
        if sale and sale.status == SaleStatus.PENDING:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.COMPLETED)
            )
            await AuditService.log(
                db, "PDV_SALE_CONFIRMED",
                tenant_id=sale.tenant_id, entity="sale", entity_id=sale_id,
                detail={"from": "PENDING", "to": "COMPLETED", "sale_number": sale.sale_number},
            )
            await db.commit()
            if sale.payment_reference:
                signal_payment(sale.payment_reference, {"status": "approved", "paid": True})

    async def _cancel_sale(self, db: AsyncSession, sale_id: int) -> None:
        from app.services.audit_service import AuditService
        from app.core.payment_events import signal_payment
        result = await db.execute(select(Sale).where(Sale.id == sale_id))
        sale = result.scalar_one_or_none()
        if sale and sale.status == SaleStatus.PENDING:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.CANCELLED)
            )
            await AuditService.log(
                db, "PDV_SALE_CANCELLED",
                tenant_id=sale.tenant_id, entity="sale", entity_id=sale_id,
                detail={"from": "PENDING", "to": "CANCELLED", "sale_number": sale.sale_number},
            )
            await db.commit()
            if sale.payment_reference:
                signal_payment(sale.payment_reference, {"status": "cancelled", "paid": False})

    async def _refund_sale(self, db: AsyncSession, sale_id: int) -> None:
        from app.services.audit_service import AuditService
        result = await db.execute(select(Sale).where(Sale.id == sale_id))
        sale = result.scalar_one_or_none()
        if sale and sale.status == SaleStatus.COMPLETED:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.REFUNDED)
            )
            await AuditService.log(
                db, "PDV_SALE_REFUNDED",
                tenant_id=sale.tenant_id, entity="sale", entity_id=sale_id,
                detail={"from": "COMPLETED", "to": "REFUNDED", "sale_number": sale.sale_number},
            )
            await db.commit()


class MercadoPagoPixProvider(BasePixProvider):
    """
    Provider PIX via Mercado Pago.
    Usa POST /v1/payments com payment_method_id=pix.
    """

    provider_name = "mercadopago"

    async def create_pix_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
        payer_email: Optional[str] = None,
        mp_token: Optional[str] = None,
    ) -> dict:
        """Gera QR Code PIX via MP. Idempotente: reutiliza PIX pendente se existir."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise ValueError("Venda não encontrada.")

        # Usa token OAuth do lojista se fornecido, senão cai no token global do .env
        effective_token = mp_token or settings.MP_ACCESS_TOKEN
        if not effective_token:
            raise ValueError(
                "Mercado Pago não configurado. Conecte sua conta via MP OAuth ou defina MP_ACCESS_TOKEN no backend/.env."
            )

        idempotency_key = f"pix_{sale_id}_tenant_{tenant_id}"
        external_reference = f"sale_{sale_id}_tenant_{tenant_id}"

        # Helper local para headers com token efetivo (OAuth ou global)
        def _headers(idem: Optional[str] = None) -> dict:
            h = {
                "Authorization": f"Bearer {effective_token}",
                "Content-Type": "application/json",
            }
            if idem:
                h["X-Idempotency-Key"] = idem
            return h

        # Idempotência: reutiliza PIX anterior se já pendente para esta venda
        existing = await db.execute(
            select(PixTransaction).where(
                PixTransaction.sale_id == sale_id,
                PixTransaction.status == "pending",
                PixTransaction.tenant_id == tenant_id,
            )
        )
        existing_pix = existing.scalar_one_or_none()
        if existing_pix:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{MP_BASE_URL}/v1/payments/{existing_pix.payment_id}",
                    headers=_headers(),
                )
            if r.status_code == 200:
                d = r.json()
                poi = d.get("point_of_interaction", {})
                txn = poi.get("transaction_data", {})
                if d.get("status") == "pending" and txn.get("qr_code"):
                    logger.info("Reutilizando PIX existente: payment=%s sale=%s",
                                existing_pix.payment_id, sale_id)
                    return {
                        "sale_id": sale_id,
                        "payment_id": existing_pix.payment_id,
                        "qr_code": txn.get("qr_code", ""),
                        "qr_code_base64": txn.get("qr_code_base64", ""),
                        "expires_at": d.get("date_of_expiration"),
                        "status": "pending",
                        "message": "QR Code PIX reutilizado. Aguardando pagamento.",
                    }

        # Busca email real do cliente se não fornecido
        if not payer_email and sale.customer_id:
            from app.models.customer import Customer
            cust_res = await db.execute(
                select(Customer).where(Customer.id == sale.customer_id)
            )
            cust = cust_res.scalar_one_or_none()
            if cust and cust.email:
                payer_email = cust.email

        body = {
            "transaction_amount": float(sale.total_amount),
            "description": f"Venda #{sale.sale_number}",
            "payment_method_id": "pix",
            "payer": {
                "email": (
                    payer_email
                    or settings.MP_TEST_PAYER_EMAIL
                    or "cliente@pix.com"
                )
            },
            "external_reference": external_reference,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{MP_BASE_URL}/v1/payments",
                json=body,
                headers=_headers(idem=idempotency_key),
            )

        if resp.status_code not in (200, 201):
            logger.error("MP pix create error: %s %s", resp.status_code, resp.text)
            try:
                mp_error = resp.json()
            except Exception:
                mp_error = {"raw": resp.text}

            msg = str(mp_error.get("message", ""))
            if resp.status_code == 401 and "Unauthorized use of live credentials" in msg:
                raise ValueError(
                    "Mercado Pago rejeitou as credenciais: uso de credencial LIVE em contexto TEST. "
                    "Use as credenciais de teste (sandbox) da sua aplicação no Mercado Pago "
                    "(token de integração de teste), "
                    "ou execute tudo em produção com credenciais LIVE e conta real. "
                    "No sandbox PIX, defina também um pagador de teste válido "
                    "(payer_email ou MP_TEST_PAYER_EMAIL)."
                )

            raise ValueError(f"Erro ao gerar PIX no Mercado Pago: {resp.text}")

        data = resp.json()
        payment_id = str(data["id"])
        poi = data.get("point_of_interaction", {})
        txn = poi.get("transaction_data", {})
        expires_at_str = data.get("date_of_expiration")
        expires_dt = None
        if expires_at_str:
            try:
                from dateutil import parser as dtparser
                expires_dt = dtparser.parse(expires_at_str)
            except Exception:
                pass

        pix_tx = PixTransaction(
            payment_id=payment_id,
            sale_id=sale_id,
            tenant_id=tenant_id,
            amount_expected=sale.total_amount,
            status="pending",
            mp_external_reference=external_reference,
            payer_email=payer_email,
            expires_at=expires_dt,
            provider=self.provider_name,
        )
        db.add(pix_tx)

        await db.execute(
            update(Sale)
            .where(Sale.id == sale_id)
            .values(status=SaleStatus.PENDING, payment_reference=payment_id)
        )
        await db.commit()

        logger.info("PIX gerado: payment=%s sale=%s amount=%.2f",
                    payment_id, sale_id, float(sale.total_amount))
        return {
            "sale_id": sale_id,
            "payment_id": payment_id,
            "qr_code": txn.get("qr_code", ""),
            "qr_code_base64": txn.get("qr_code_base64", ""),
            "expires_at": expires_at_str,
            "status": data.get("status", "pending"),
            "message": "QR Code PIX gerado. Aguardando pagamento do cliente.",
        }

    async def get_pix_status(
        self,
        db: AsyncSession,
        payment_id: str,
        tenant_id: int,
    ) -> dict:
        """Consulta GET /v1/payments/{id} e confirma a venda quando aprovado."""
        result = await db.execute(
            select(Sale).where(
                Sale.payment_reference == payment_id,
                Sale.tenant_id == tenant_id,
            )
        )
        sale = result.scalar_one_or_none()

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{MP_BASE_URL}/v1/payments/{payment_id}",
                headers=_mp_headers(),
            )

        if resp.status_code != 200:
            return {
                "sale_id": sale.id if sale else None,
                "payment_id": payment_id,
                "status": "unknown",
                "paid": False,
                "message": "Erro ao consultar pagamento no Mercado Pago.",
            }

        data = resp.json()
        mp_status = data.get("status", "pending")
        paid = mp_status == "approved"

        if paid and sale:
            pix_tx_res = await db.execute(
                select(PixTransaction).where(PixTransaction.payment_id == payment_id)
            )
            pix_tx = pix_tx_res.scalar_one_or_none()
            paid_amount = float(data.get("transaction_amount", 0))
            if pix_tx and abs(float(pix_tx.amount_expected) - paid_amount) > 0.02:
                logger.error(
                    "PIX FRAUDE (polling): payment=%s esperado=%.2f pago=%.2f sale=%s",
                    payment_id, float(pix_tx.amount_expected), paid_amount, sale.id,
                )
                return {
                    "sale_id": sale.id,
                    "payment_id": payment_id,
                    "status": "amount_mismatch",
                    "paid": False,
                    "message": "Valor pago não confere com o total da venda. Contate o suporte.",
                }
            if not pix_tx or pix_tx.status == "pending":
                await self._confirm_sale(db, sale.id)
                if pix_tx:
                    await db.execute(
                        update(PixTransaction).where(PixTransaction.payment_id == payment_id)
                        .values(
                            status="approved",
                            amount_paid=paid_amount,
                            confirmed_at=datetime.now(timezone.utc),
                            confirmed_by="polling",
                        )
                    )
                    await db.commit()
            logger.info("PIX confirmado via polling: payment=%s sale=%s amount=%.2f",
                        payment_id, sale.id, paid_amount)

        return {
            "sale_id": sale.id if sale else None,
            "payment_id": payment_id,
            "status": mp_status,
            "paid": paid,
            "message": "Pagamento PIX confirmado!" if paid else "Aguardando pagamento PIX.",
        }

    async def refund_pix(
        self,
        db: AsyncSession,
        payment_id: str,
        tenant_id: int,
    ) -> dict:
        """POST /v1/payments/{id}/refunds — reembolso PIX aprovado."""
        from app.services.audit_service import AuditService

        pix_res = await db.execute(
            select(PixTransaction).where(
                PixTransaction.payment_id == payment_id,
                PixTransaction.tenant_id == tenant_id,
            )
        )
        pix_tx = pix_res.scalar_one_or_none()
        if not pix_tx:
            raise ValueError("Transação PIX não encontrada.")
        if pix_tx.status != "approved":
            raise ValueError(
                f"Só é possível reembolsar pagamentos aprovados (status atual: {pix_tx.status})."
            )

        idempotency_key = f"refund_pix_{payment_id}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{MP_BASE_URL}/v1/payments/{payment_id}/refunds",
                json={},
                headers=_mp_headers(idempotency_key=idempotency_key),
            )

        if resp.status_code not in (200, 201):
            raise ValueError(f"Erro ao reembolsar PIX no MP: {resp.text}")

        data = resp.json()
        refund_id = str(data.get("id", ""))

        await db.execute(
            update(PixTransaction)
            .where(PixTransaction.payment_id == payment_id)
            .values(status="refunded")
        )
        await self._refund_sale(db, pix_tx.sale_id)
        await AuditService.log(
            db, "PIX_REFUNDED",
            tenant_id=tenant_id, entity="pix_transaction", entity_id=pix_tx.id,
            detail={"payment_id": payment_id, "refund_id": refund_id, "sale_id": pix_tx.sale_id},
        )
        await db.commit()

        logger.info("PIX reembolsado: payment=%s refund=%s sale=%s", payment_id, refund_id, pix_tx.sale_id)
        return {
            "payment_id": payment_id,
            "refund_id": refund_id,
            "sale_id": pix_tx.sale_id,
            "status": "refunded",
            "message": "Reembolso PIX processado com sucesso.",
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _confirm_sale(self, db: AsyncSession, sale_id: int) -> None:
        from app.services.audit_service import AuditService
        from app.core.payment_events import signal_payment
        result = await db.execute(select(Sale).where(Sale.id == sale_id))
        sale = result.scalar_one_or_none()
        if sale and sale.status == SaleStatus.PENDING:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.COMPLETED)
            )
            await AuditService.log(
                db, "PIX_SALE_CONFIRMED",
                tenant_id=sale.tenant_id, entity="sale", entity_id=sale_id,
                detail={"from": "PENDING", "to": "COMPLETED", "sale_number": sale.sale_number},
            )
            await db.commit()
            if sale.payment_reference:
                signal_payment(sale.payment_reference, {"status": "approved", "paid": True})

    async def _cancel_sale(self, db: AsyncSession, sale_id: int) -> None:
        from app.services.audit_service import AuditService
        from app.core.payment_events import signal_payment
        result = await db.execute(select(Sale).where(Sale.id == sale_id))
        sale = result.scalar_one_or_none()
        if sale and sale.status == SaleStatus.PENDING:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.CANCELLED)
            )
            await AuditService.log(
                db, "PIX_SALE_CANCELLED",
                tenant_id=sale.tenant_id, entity="sale", entity_id=sale_id,
                detail={"from": "PENDING", "to": "CANCELLED", "sale_number": sale.sale_number},
            )
            await db.commit()
            if sale.payment_reference:
                signal_payment(sale.payment_reference, {"status": "cancelled", "paid": False})

    async def _refund_sale(self, db: AsyncSession, sale_id: int) -> None:
        from app.services.audit_service import AuditService
        result = await db.execute(select(Sale).where(Sale.id == sale_id))
        sale = result.scalar_one_or_none()
        if sale and sale.status == SaleStatus.COMPLETED:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.REFUNDED)
            )
            await AuditService.log(
                db, "PIX_SALE_REFUNDED",
                tenant_id=sale.tenant_id, entity="sale", entity_id=sale_id,
                detail={"from": "COMPLETED", "to": "REFUNDED", "sale_number": sale.sale_number},
            )
            await db.commit()
