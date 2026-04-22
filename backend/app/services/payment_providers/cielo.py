"""
Provider Cielo LIO — integração cloud-to-terminal via Order Manager API v1.

Fluxo completo:
  1. setup_terminal()   → valida credenciais (merchant_id obrigatório)
  2. create_payment()   → POST /order-management/v1/orders (cria order)
                          → PUT  /order-management/v1/orders/{id}?operation=PLACE
                          → terminal recebe e exibe a order
  3. get_payment_status → GET /order-management/v1/orders/{id}
  4. cancel_payment()   → PUT /order-management/v1/orders/{id}?operation=CLOSE
  5. refund_payment()   → manual (Cielo não tem endpoint de estorno via API LIO)

Credenciais necessárias no provider_config do PDVTerminal:
  {
    "merchant_id": "xxxxx-xxxx-xxxx-xxxx",  # ID do estabelecimento na Cielo
  }

O CIELO_CLIENT_ID e CIELO_ACCESS_TOKEN são globais do SaaS (definidos em settings).

Nota: Cielo LIO hardware em descontinuação. Novos terminais são "Cielo Smart".
A API Order Manager continua funcional durante a transição.
"""
import logging
import uuid
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.models.pdv_terminal import PDVTerminal
from app.models.sale import Sale, SaleStatus
from .base import BaseTerminalProvider

logger = logging.getLogger(__name__)

CIELO_BASE_URL = "https://api.cielo.com.br/order-management/v1"
CIELO_SANDBOX_URL = "https://api.cielo.com.br/sandbox-lio/order-management/v1"


class CieloLIOProvider(BaseTerminalProvider):
    """
    Cielo LIO via Order Manager API v1.
    Envia pagamento para terminal LIO físico via cloud.
    Cada terminal usa merchant_id do lojista; Client-Id e Access-Token são do SaaS.
    """

    provider_name = "cielo"

    def _base_url(self) -> str:
        env = getattr(settings, "ENVIRONMENT", "development")
        return CIELO_BASE_URL if env == "production" else CIELO_SANDBOX_URL

    def _get_headers(self, merchant_id: str) -> dict:
        """Monta os 3 headers de autenticação Cielo."""
        return {
            "Client-Id": getattr(settings, "CIELO_CLIENT_ID", ""),
            "Access-Token": getattr(settings, "CIELO_ACCESS_TOKEN", ""),
            "Merchant-Id": merchant_id,
            "Content-Type": "application/json",
        }

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

    def _validate_credentials(self, terminal: PDVTerminal) -> str:
        """Valida e retorna merchant_id. Lança ValueError se ausente."""
        cfg = terminal.provider_config or {}
        merchant_id = cfg.get("merchant_id", "").strip()
        if not merchant_id:
            raise ValueError(
                "Credencial Cielo ausente: 'merchant_id' não configurado. "
                "Acesse a tela de terminais e configure as credenciais."
            )
        if not getattr(settings, "CIELO_CLIENT_ID", ""):
            raise ValueError("CIELO_CLIENT_ID não configurado no servidor.")
        if not getattr(settings, "CIELO_ACCESS_TOKEN", ""):
            raise ValueError("CIELO_ACCESS_TOKEN não configurado no servidor.")
        return merchant_id

    # ── Setup ─────────────────────────────────────────────────────────────────

    async def setup_terminal(
        self,
        db: AsyncSession,
        terminal_id: int,
        tenant_id: int,
    ) -> dict:
        """Valida credenciais e marca terminal como configurado."""
        terminal = await self._get_terminal(db, terminal_id, tenant_id)
        cfg = terminal.provider_config or {}
        merchant_id = cfg.get("merchant_id", "").strip()

        if not merchant_id:
            await db.execute(
                update(PDVTerminal)
                .where(PDVTerminal.id == terminal_id)
                .values(is_configured=False, is_pdv_active=False)
            )
            await db.commit()
            return {
                "terminal_id": terminal_id,
                "message": "Configure o Merchant-Id Cielo para ativar o terminal.",
                "configured": False,
            }

        await db.execute(
            update(PDVTerminal)
            .where(PDVTerminal.id == terminal_id)
            .values(is_configured=True, is_pdv_active=True)
        )
        await db.commit()
        return {
            "terminal_id": terminal_id,
            "message": "Terminal Cielo LIO configurado.",
            "configured": True,
            "merchant_id": merchant_id,
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
        Cria order na Cielo e faz PLACE para enviar ao terminal físico.
        O operador verá a cobrança na tela da Cielo LIO.
        """
        terminal = await self._get_terminal(db, terminal_id, tenant_id)
        merchant_id = self._validate_credentials(terminal)

        # Cielo usa centavos (integer)
        amount_cents = int(round(total_amount * 100))
        order_number = f"SALE{sale_id}_{uuid.uuid4().hex[:8].upper()}"
        headers = self._get_headers(merchant_id)
        base = self._base_url()

        # Passo 1: Criar order
        order_body = {
            "number": order_number,
            "reference": description or f"Venda #{sale_id}",
            "status": "DRAFT",
            "items": [{
                "sku": f"SALE{sale_id}",
                "name": description or f"Venda #{sale_id}",
                "unit_price": amount_cents,
                "quantity": 1,
                "unit_of_measure": "EACH",
            }],
            "price": amount_cents,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            create_resp = await client.post(
                f"{base}/orders",
                json=order_body,
                headers=headers,
            )

        if create_resp.status_code not in (200, 201):
            logger.error(f"Cielo create order error {create_resp.status_code}: {create_resp.text}")
            raise ValueError(f"Erro ao criar order Cielo: {create_resp.text}")

        order_data = create_resp.json()
        order_id = order_data.get("id") or order_data.get("orderId")
        if not order_id:
            raise ValueError("Cielo não retornou order ID.")

        # Passo 2: PLACE — enviar para o terminal
        async with httpx.AsyncClient(timeout=30) as client:
            place_resp = await client.put(
                f"{base}/orders/{order_id}?operation=PLACE",
                headers=headers,
            )

        if place_resp.status_code not in (200, 204):
            logger.error(f"Cielo PLACE error {place_resp.status_code}: {place_resp.text}")
            # PLACE falhou mas order foi criada — salva referência para debug
            logger.warning(f"Order {order_id} criada mas não enviada ao terminal — verifique se o LIO está ligado")

        # Salva referência e PENDING na venda
        await db.execute(
            update(Sale)
            .where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
            .values(payment_reference=order_id, status=SaleStatus.PENDING)
        )
        await db.commit()

        logger.info(f"Cielo order {order_id} enviada ao terminal para venda {sale_id}")

        return {
            "sale_id": sale_id,
            "terminal_id": terminal_id,
            "order_id": order_id,
            "status": "pending",
            "message": "Pedido enviado ao terminal Cielo LIO. Aguardando pagamento.",
        }

    # ── Status do pagamento ───────────────────────────────────────────────────

    async def get_payment_status(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """Consulta status do order na Cielo."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise ValueError("Venda não encontrada.")

        order_id = sale.payment_reference
        if not order_id:
            return {"sale_id": sale_id, "order_id": None, "status": "unknown", "paid": False, "message": "Sem referência Cielo."}

        terminal_result = await db.execute(
            select(PDVTerminal).where(
                PDVTerminal.tenant_id == tenant_id,
                PDVTerminal.provider == "cielo",
                PDVTerminal.is_active == True,
            )
        )
        terminal = terminal_result.scalars().first()
        if not terminal:
            raise ValueError("Terminal Cielo não encontrado.")

        merchant_id = self._validate_credentials(terminal)

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{self._base_url()}/orders/{order_id}",
                headers=self._get_headers(merchant_id),
            )

        if resp.status_code != 200:
            raise ValueError(f"Erro ao consultar status Cielo: {resp.text}")

        data = resp.json()
        cielo_status = data.get("status", "DRAFT")
        paid = cielo_status in ("PAID", "CLOSED")

        if paid and sale.status != SaleStatus.COMPLETED:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.COMPLETED)
            )
            await db.commit()
            logger.info(f"Venda {sale_id} confirmada via polling Cielo")

        return {
            "sale_id": sale_id,
            "order_id": order_id,
            "status": cielo_status.lower(),
            "paid": paid,
            "message": "Pago com sucesso!" if paid else "Aguardando pagamento no terminal Cielo.",
        }

    # ── Cancelar ──────────────────────────────────────────────────────────────

    async def cancel_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
    ) -> dict:
        """Envia CLOSE para a order Cielo e cancela a venda localmente."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise ValueError("Venda não encontrada.")

        order_id = sale.payment_reference

        if order_id:
            terminal_result = await db.execute(
                select(PDVTerminal).where(
                    PDVTerminal.tenant_id == tenant_id,
                    PDVTerminal.provider == "cielo",
                    PDVTerminal.is_active == True,
                )
            )
            terminal = terminal_result.scalars().first()
            if terminal:
                try:
                    merchant_id = self._validate_credentials(terminal)
                    async with httpx.AsyncClient(timeout=15) as client:
                        await client.put(
                            f"{self._base_url()}/orders/{order_id}?operation=CLOSE",
                            headers=self._get_headers(merchant_id),
                        )
                    logger.info(f"Cielo order {order_id} fechada remotamente")
                except Exception as e:
                    logger.warning(f"Falha ao fechar Cielo remotamente: {e} — cancelando localmente")

        await db.execute(
            update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.CANCELLED)
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
        """Cielo LIO não tem endpoint de estorno via API — marca localmente."""
        await db.execute(
            update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.REFUNDED)
        )
        await db.commit()
        return {
            "sale_id": sale_id,
            "order_id": None,
            "refund_id": None,
            "status": "refunded",
            "message": "Venda marcada como reembolsada. Execute o estorno diretamente no terminal Cielo.",
        }
