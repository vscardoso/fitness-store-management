"""
Provider Stone Connect — integração cloud-to-terminal via Pagar.me API v5.

Fluxo completo:
  1. setup_terminal()   → valida credenciais (sk_key + serial_number obrigatórios)
  2. create_payment()   → POST /core/v5/orders/ com poi_payment_settings
                          → terminal recebe automaticamente e exibe o valor
  3. get_payment_status → GET /core/v5/orders/{id} → polling de status
  4. cancel_payment()   → PATCH /core/v5/orders/{id}/closed (status: canceled)
  5. refund_payment()   → DELETE /core/v5/charges/{charge_id}

Credenciais necessárias no provider_config do PDVTerminal:
  {
    "sk_key": "sk_live_xxxxxxx",           # Secret key Pagar.me do lojista
    "device_serial_number": "ABC123456",   # Serial da maquininha (etiqueta S/N)
    "stonecode": "123456789",              # Opcional — código do estabelecimento Stone
  }

O STONE_SERVICE_REFERER_NAME é global (do SaaS parceiro), definido em settings.
"""
import base64
import logging
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.models.pdv_terminal import PDVTerminal
from app.models.sale import Sale, SaleStatus
from .base import BaseTerminalProvider

logger = logging.getLogger(__name__)

STONE_BASE_URL = "https://api.pagar.me"


class StoneConnectProvider(BaseTerminalProvider):
    """
    Stone Connect via Pagar.me API v5.
    Envia pagamento diretamente para a maquininha Stone física.
    Cada terminal usa as credenciais do próprio lojista (sk_key + serial_number).
    """

    provider_name = "stone"

    # ── Helpers internos ──────────────────────────────────────────────────────

    async def _get_terminal(self, db: AsyncSession, terminal_id: int, tenant_id: int) -> PDVTerminal:
        result = await db.execute(
            select(PDVTerminal).where(
                PDVTerminal.id == terminal_id,
                PDVTerminal.tenant_id == tenant_id,
                PDVTerminal.is_active == True,
            )
        )
        terminal = result.scalar_one_or_none()
        if not terminal:
            raise ValueError("Terminal não encontrado.")
        return terminal

    def _get_headers(self, sk_key: str) -> dict:
        """Monta headers de autenticação para a API Pagar.me."""
        encoded = base64.b64encode(f"{sk_key}:".encode()).decode()
        headers = {
            "Authorization": f"Basic {encoded}",
            "Content-Type": "application/json",
        }
        referer = getattr(settings, "STONE_SERVICE_REFERER_NAME", "")
        if referer:
            headers["ServiceRefererName"] = referer
        return headers

    def _validate_credentials(self, terminal: PDVTerminal) -> tuple[str, str]:
        """Valida e retorna (sk_key, device_serial_number). Lança ValueError se ausentes."""
        cfg = terminal.provider_config or {}
        sk_key = cfg.get("sk_key", "").strip()
        serial = cfg.get("device_serial_number", "").strip()
        if not sk_key:
            raise ValueError(
                "Credencial Stone ausente: 'sk_key' não configurada no terminal. "
                "Acesse a tela de terminais e configure as credenciais."
            )
        if not serial:
            raise ValueError(
                "Credencial Stone ausente: 'device_serial_number' não configurado. "
                "Informe o número de série (etiqueta S/N) da maquininha."
            )
        return sk_key, serial

    # ── Setup ─────────────────────────────────────────────────────────────────

    async def setup_terminal(
        self,
        db: AsyncSession,
        terminal_id: int,
        tenant_id: int,
    ) -> dict:
        """
        Valida as credenciais Stone e marca terminal como configurado.
        Não faz chamada à API — a configuração real é feita no Pagar.me Dashboard.
        """
        terminal = await self._get_terminal(db, terminal_id, tenant_id)

        cfg = terminal.provider_config or {}
        sk_key = cfg.get("sk_key", "").strip()
        serial = cfg.get("device_serial_number", "").strip()

        if not sk_key or not serial:
            # Marca como pendente — lojista ainda não inseriu as credenciais
            await db.execute(
                update(PDVTerminal)
                .where(PDVTerminal.id == terminal_id)
                .values(is_configured=False, is_pdv_active=False)
            )
            await db.commit()
            return {
                "terminal_id": terminal_id,
                "message": "Configure as credenciais Stone (sk_key e serial) para ativar o terminal.",
                "configured": False,
            }

        # Com credenciais presentes, marca como configurado
        await db.execute(
            update(PDVTerminal)
            .where(PDVTerminal.id == terminal_id)
            .values(is_configured=True, is_pdv_active=True)
        )
        await db.commit()
        return {
            "terminal_id": terminal_id,
            "message": "Terminal Stone configurado. Certifique-se que a maquininha está ligada e conectada.",
            "configured": True,
            "device_serial_number": serial,
        }

    # ── Criar pagamento ───────────────────────────────────────────────────────

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
        installments_cost: Optional[str] = None,
    ) -> dict:
        """
        Envia pagamento diretamente para a maquininha Stone via Pagar.me API.
        O valor aparece automaticamente na tela do terminal.
        """
        terminal = await self._get_terminal(db, terminal_id, tenant_id)
        sk_key, serial = self._validate_credentials(terminal)

        # Stone usa centavos (integer)
        amount_cents = int(round(total_amount * 100))
        installments = max(1, installments or 1)
        payment_type = payment_type or "credit_card"

        body = {
            "customer": {
                "name": "Cliente",
                "email": f"venda_{sale_id}@loja.com",
            },
            "items": [{
                "amount": amount_cents,
                "description": description or f"Venda #{sale_id}",
                "quantity": 1,
                "code": f"SALE{sale_id}",
            }],
            "closed": False,
            "metadata": {
                "sale_id": str(sale_id),
                "tenant_id": str(tenant_id),
            },
            "poi_payment_settings": {
                "visible": True,
                "display_name": description or f"Venda #{sale_id}",
                "print_order_receipt": False,
                "devices_serial_number": [serial],
                "payment_setup": {
                    "type": "credit" if payment_type == "credit_card" else "debit",
                    "installments": installments if payment_type == "credit_card" else 1,
                    "installment_type": installments_cost or "merchant",
                },
            },
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{STONE_BASE_URL}/core/v5/orders/",
                json=body,
                headers=self._get_headers(sk_key),
            )

        if resp.status_code not in (200, 201):
            logger.error(f"Stone create_payment error {resp.status_code}: {resp.text}")
            raise ValueError(f"Erro ao criar pedido Stone: {resp.text}")

        data = resp.json()
        order_id = data["id"]

        # Salva referência e status PENDING na venda
        await db.execute(
            update(Sale)
            .where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
            .values(payment_reference=order_id, status=SaleStatus.PENDING)
        )
        await db.commit()

        logger.info(f"Stone order {order_id} criado para venda {sale_id} (R${total_amount:.2f})")

        return {
            "sale_id": sale_id,
            "terminal_id": terminal_id,
            "order_id": order_id,
            "status": "pending",
            "message": "Pedido enviado à maquininha Stone. Aguardando pagamento do cliente.",
        }

    # ── Status do pagamento ───────────────────────────────────────────────────

    async def get_payment_status(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """
        Consulta status atual do pedido na API Stone.
        Confirma ou cancela a venda automaticamente.
        """
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise ValueError("Venda não encontrada.")

        order_id = sale.payment_reference
        if not order_id:
            return {"sale_id": sale_id, "order_id": None, "status": "unknown", "paid": False, "message": "Sem referência de pedido Stone."}

        # Buscar credenciais pelo terminal da venda
        terminal_result = await db.execute(
            select(PDVTerminal).where(
                PDVTerminal.tenant_id == tenant_id,
                PDVTerminal.provider == "stone",
                PDVTerminal.is_active == True,
            )
        )
        terminal = terminal_result.scalars().first()
        if not terminal:
            raise ValueError("Terminal Stone não encontrado para este tenant.")

        sk_key, _ = self._validate_credentials(terminal)

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{STONE_BASE_URL}/core/v5/orders/{order_id}",
                headers=self._get_headers(sk_key),
            )

        if resp.status_code != 200:
            logger.error(f"Stone get_status error {resp.status_code}: {resp.text}")
            raise ValueError(f"Erro ao consultar status Stone: {resp.text}")

        data = resp.json()
        stone_status = data.get("status", "pending")
        paid = stone_status == "paid"

        if paid and sale.status != SaleStatus.COMPLETED:
            await db.execute(
                update(Sale)
                .where(Sale.id == sale_id)
                .values(status=SaleStatus.COMPLETED)
            )
            await db.commit()
            logger.info(f"Venda {sale_id} confirmada via polling Stone")

        return {
            "sale_id": sale_id,
            "order_id": order_id,
            "status": stone_status,
            "paid": paid,
            "message": "Pago com sucesso!" if paid else "Aguardando pagamento na maquininha.",
        }

    # ── Cancelar pagamento ────────────────────────────────────────────────────

    async def cancel_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """Cancela pedido Stone e cancela a venda localmente."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise ValueError("Venda não encontrada.")

        order_id = sale.payment_reference

        # Tenta cancelar no provider externo se tiver referência
        if order_id and order_id.startswith("or_"):
            terminal_result = await db.execute(
                select(PDVTerminal).where(
                    PDVTerminal.tenant_id == tenant_id,
                    PDVTerminal.provider == "stone",
                    PDVTerminal.is_active == True,
                )
            )
            terminal = terminal_result.scalars().first()
            if terminal:
                try:
                    cfg = terminal.provider_config or {}
                    sk_key = cfg.get("sk_key", "").strip()
                    if sk_key:
                        async with httpx.AsyncClient(timeout=15) as client:
                            await client.patch(
                                f"{STONE_BASE_URL}/core/v5/orders/{order_id}/closed",
                                json={"status": "canceled"},
                                headers=self._get_headers(sk_key),
                            )
                        logger.info(f"Stone order {order_id} cancelado remotamente")
                except Exception as e:
                    logger.warning(f"Falha ao cancelar Stone remotamente: {e} — cancelando localmente")

        # Sempre cancela localmente
        await db.execute(
            update(Sale)
            .where(Sale.id == sale_id)
            .values(status=SaleStatus.CANCELLED)
        )
        await db.commit()

        return {
            "sale_id": sale_id,
            "order_id": order_id,
            "status": "canceled",
            "message": "Pagamento cancelado.",
        }

    # ── Reembolso ─────────────────────────────────────────────────────────────

    async def refund_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """Estorno via DELETE /charges/{charge_id} na API Stone."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise ValueError("Venda não encontrada.")

        order_id = sale.payment_reference
        if not order_id:
            raise ValueError("Venda sem referência de pedido Stone para estorno.")

        terminal_result = await db.execute(
            select(PDVTerminal).where(
                PDVTerminal.tenant_id == tenant_id,
                PDVTerminal.provider == "stone",
                PDVTerminal.is_active == True,
            )
        )
        terminal = terminal_result.scalars().first()
        if not terminal:
            raise ValueError("Terminal Stone não encontrado.")

        sk_key, _ = self._validate_credentials(terminal)

        # Busca o charge_id dentro do pedido
        async with httpx.AsyncClient(timeout=15) as client:
            order_resp = await client.get(
                f"{STONE_BASE_URL}/core/v5/orders/{order_id}",
                headers=self._get_headers(sk_key),
            )

        if order_resp.status_code != 200:
            raise ValueError(f"Erro ao buscar pedido Stone para estorno: {order_resp.text}")

        order_data = order_resp.json()
        charges = order_data.get("charges", [])
        if not charges:
            raise ValueError("Nenhuma charge encontrada no pedido Stone para estorno.")

        charge_id = charges[0]["id"]

        async with httpx.AsyncClient(timeout=15) as client:
            refund_resp = await client.delete(
                f"{STONE_BASE_URL}/core/v5/charges/{charge_id}",
                headers=self._get_headers(sk_key),
            )

        if refund_resp.status_code not in (200, 201):
            raise ValueError(f"Erro ao estornar na Stone: {refund_resp.text}")

        await db.execute(
            update(Sale)
            .where(Sale.id == sale_id)
            .values(status=SaleStatus.REFUNDED)
        )
        await db.commit()

        logger.info(f"Stone charge {charge_id} estornado para venda {sale_id}")

        return {
            "sale_id": sale_id,
            "order_id": order_id,
            "refund_id": charge_id,
            "status": "refunded",
            "message": "Estorno realizado com sucesso na Stone.",
        }
