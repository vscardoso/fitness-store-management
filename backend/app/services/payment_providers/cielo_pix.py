"""
Provider Cielo PIX — gera QR Code via API DICT Cielo (cielo-pix/v1).

Fluxo:
  1. create_pix_payment() → OAuth2 token → PUT /cob/{txid} → pixCopiaECola
  2. get_pix_status()     → GET /cob/{txid} → status ATIVA/CONCLUIDA
  3. Webhook Cielo PIX    → POST /webhooks/cielo-pix → confirma venda
  4. refund_pix()         → PUT /pix/{e2eid}/devolucao/{id}

Auth (OAuth2 client_credentials, expira em 3600s, cacheado por 55 min):
  POST {auth_base}/oauth/access-token
  Authorization: Basic base64(client_id:client_secret)
  Body JSON: {"grant_type": "client_credentials"}

Ambientes (CIELO_PIX_SANDBOX=true por padrão):
  Sandbox : api2.cielo.com.br/sandbox/v2  +  api2.cielo.com.br/sandbox/cielo-pix/v1
  Produção: api2.cielo.com.br/v2          +  api-mtls.cielo.com.br/cielo-pix/v1 (mTLS)

txid: "VENDA" + sale_id zero-padded em 21 dígitos = 26 chars alfanuméricos.
"""
import base64
import logging
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.models.pix_transaction import PixTransaction
from app.models.sale import Sale, SaleStatus
from app.models.store import Store
from .base import BasePixProvider

logger = logging.getLogger(__name__)

# Cache de token: {client_id: (token, expires_at_unix)}
_token_cache: dict[str, tuple[str, float]] = {}


def _urls() -> tuple[str, str]:
    """Retorna (auth_base, api_base) conforme CIELO_PIX_SANDBOX."""
    if getattr(settings, "CIELO_PIX_SANDBOX", True):
        return (
            "https://api2.cielo.com.br/sandbox/v2",
            "https://api2.cielo.com.br/sandbox/cielo-pix/v1",
        )
    return (
        "https://api2.cielo.com.br/v2",
        "https://api-mtls.cielo.com.br/cielo-pix/v1",
    )


def _make_txid(sale_id: int) -> str:
    return f"VENDA{sale_id:021d}"


def _parse_sale_id(txid: str) -> Optional[int]:
    if txid.startswith("VENDA"):
        try:
            return int(txid[5:])
        except ValueError:
            pass
    return None


async def _get_token() -> str:
    """Obtém (ou reutiliza cache de) token OAuth2 Cielo. Thread-safe para asyncio."""
    client_id = getattr(settings, "CIELO_PIX_CLIENT_ID", "")
    client_secret = getattr(settings, "CIELO_PIX_CLIENT_SECRET", "")

    cached = _token_cache.get(client_id)
    if cached and time.time() < cached[1]:
        return cached[0]

    auth_base, _ = _urls()
    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{auth_base}/oauth/access-token",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/json",
            },
            json={"grant_type": "client_credentials"},
        )

    if resp.status_code not in (200, 201):
        raise ValueError(f"Falha na autenticação Cielo PIX: {resp.status_code} — {resp.text}")

    data = resp.json()
    token = data["access_token"]
    expires_in = int(data.get("expires_in", 3600))
    # Guarda por expires_in - 5 min para evitar usar token próximo do vencimento
    _token_cache[client_id] = (token, time.time() + max(expires_in - 300, 60))

    logger.info("Token OAuth2 Cielo PIX obtido (expira em %ds)", expires_in)
    return token


class CieloPixProvider(BasePixProvider):
    """
    Provider PIX via API Cielo (cobranças imediatas /cob).
    Confirmação por webhook ou polling em /cob/{txid}.
    """

    provider_name = "cielo_pix"

    async def create_pix_payment(
        self,
        db: AsyncSession,
        sale_id: int,
        tenant_id: int,
        payer_email: Optional[str] = None,
        mp_token: Optional[str] = None,
    ) -> dict:
        """Gera QR Code PIX Cielo. Idempotente: reutiliza cobrança ativa se já existir."""
        result = await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise ValueError("Venda não encontrada.")

        store_res = await db.execute(select(Store).where(Store.id == tenant_id))
        store = store_res.scalar_one_or_none()
        pix_key = (store.pix_key or "").strip() if store else ""
        if not pix_key:
            raise ValueError(
                "Chave PIX não configurada para esta loja. "
                "Acesse Configurações → Chave PIX e configure a chave do estabelecimento."
            )

        txid = _make_txid(sale_id)
        expiracao = int(getattr(settings, "CIELO_PIX_EXPIRACAO_SEGUNDOS", 3600))

        # Idempotência: se já existe cobrança pendente, retorna o QR existente
        existing_res = await db.execute(
            select(PixTransaction).where(
                PixTransaction.sale_id == sale_id,
                PixTransaction.status == "pending",
                PixTransaction.tenant_id == tenant_id,
                PixTransaction.provider == self.provider_name,
            )
        )
        existing = existing_res.scalar_one_or_none()
        if existing:
            cob = await self._fetch_cob(txid)
            if cob and cob.get("status") == "ATIVA":
                logger.info("Reutilizando PIX Cielo: txid=%s sale=%s", txid, sale_id)
                return {
                    "sale_id": sale_id,
                    "payment_id": txid,
                    "qr_code": cob.get("pixCopiaECola", ""),
                    "qr_code_base64": "",
                    "expires_at": existing.expires_at.isoformat() if existing.expires_at else None,
                    "status": "pending",
                    "is_generic": False,
                    "message": "QR Code PIX reutilizado. Aguardando pagamento.",
                }

        token = await _get_token()
        _, api_base = _urls()

        body: dict = {
            "calendario": {"expiracao": expiracao},
            "valor": {"original": f"{float(sale.total_amount):.2f}"},
            "chave": pix_key,
            "solicitacaoPagador": f"Venda #{sale.sale_number}"[:140],
        }

        # Inclui devedor se o cliente tiver CPF/CNPJ cadastrado
        if sale.customer_id:
            from app.models.customer import Customer
            cust_res = await db.execute(select(Customer).where(Customer.id == sale.customer_id))
            cust = cust_res.scalar_one_or_none()
            if cust:
                cpf = (cust.cpf or "").replace(".", "").replace("-", "")
                cnpj = (cust.cnpj or "").replace(".", "").replace("/", "").replace("-", "") if hasattr(cust, "cnpj") else ""
                if cpf and len(cpf) == 11:
                    body["devedor"] = {"cpf": cpf, "nome": cust.name}
                elif cnpj and len(cnpj) == 14:
                    body["devedor"] = {"cnpj": cnpj, "nome": cust.name}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.put(
                f"{api_base}/cob/{txid}",
                json=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code not in (200, 201):
            logger.error("Cielo PIX /cob erro: %s %s", resp.status_code, resp.text)
            raise ValueError(f"Erro ao gerar PIX Cielo: {resp.text}")

        data = resp.json()
        pix_copia_e_cola = data.get("pixCopiaECola", "")
        expires_at_dt = datetime.now(timezone.utc) + timedelta(seconds=expiracao)

        pix_tx = PixTransaction(
            payment_id=txid,
            sale_id=sale_id,
            tenant_id=tenant_id,
            amount_expected=sale.total_amount,
            status="pending",
            mp_external_reference=f"sale_{sale_id}_tenant_{tenant_id}",
            payer_email=payer_email,
            expires_at=expires_at_dt,
            provider=self.provider_name,
        )
        db.add(pix_tx)

        await db.execute(
            update(Sale).where(Sale.id == sale_id)
            .values(status=SaleStatus.PENDING, payment_reference=txid)
        )
        await db.commit()

        logger.info("PIX Cielo gerado: txid=%s sale=%s amount=%.2f",
                    txid, sale_id, float(sale.total_amount))
        return {
            "sale_id": sale_id,
            "payment_id": txid,
            "qr_code": pix_copia_e_cola,
            "qr_code_base64": "",
            "expires_at": expires_at_dt.isoformat(),
            "status": "pending",
            "is_generic": False,
            "message": "QR Code PIX Cielo gerado. Aguardando pagamento.",
        }

    async def get_pix_status(
        self,
        db: AsyncSession,
        payment_id: str,
        tenant_id: int,
    ) -> dict:
        """Consulta GET /cob/{txid}. Confirma venda quando status=CONCLUIDA."""
        result = await db.execute(
            select(Sale).where(
                Sale.payment_reference == payment_id,
                Sale.tenant_id == tenant_id,
            )
        )
        sale = result.scalar_one_or_none()

        cob = await self._fetch_cob(payment_id)
        if not cob:
            return {
                "sale_id": sale.id if sale else None,
                "payment_id": payment_id,
                "status": "unknown",
                "paid": False,
                "message": "Erro ao consultar PIX Cielo.",
            }

        cielo_status = cob.get("status", "ATIVA")
        paid = cielo_status == "CONCLUIDA"

        if paid and sale and sale.status == SaleStatus.PENDING:
            await self._confirm_sale(db, sale.id, payment_id)

        return {
            "sale_id": sale.id if sale else None,
            "payment_id": payment_id,
            "status": cielo_status.lower(),
            "paid": paid,
            "message": "Pagamento PIX Cielo confirmado!" if paid else "Aguardando pagamento PIX Cielo.",
        }

    async def refund_pix(
        self,
        db: AsyncSession,
        payment_id: str,
        tenant_id: int,
    ) -> dict:
        """
        Estorno via PUT /pix/{e2eid}/devolucao/{id}.
        O endToEndId é armazenado em PixTransaction.confirmed_by após o webhook.
        """
        from app.services.audit_service import AuditService

        pix_res = await db.execute(
            select(PixTransaction).where(
                PixTransaction.payment_id == payment_id,
                PixTransaction.tenant_id == tenant_id,
            )
        )
        pix_tx = pix_res.scalar_one_or_none()
        if not pix_tx:
            raise ValueError("Transação PIX Cielo não encontrada.")
        if pix_tx.status != "approved":
            raise ValueError(f"Só é possível estornar pagamentos aprovados (status: {pix_tx.status}).")

        # endToEndId fica em confirmed_by (começa com 'E')
        e2eid = pix_tx.confirmed_by if (pix_tx.confirmed_by or "").startswith("E") else None
        if not e2eid:
            raise ValueError(
                "endToEndId não disponível. Faça o estorno diretamente no portal Cielo."
            )

        token = await _get_token()
        _, api_base = _urls()
        devolucao_id = f"DEV{pix_tx.id:020d}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.put(
                f"{api_base}/pix/{e2eid}/devolucao/{devolucao_id}",
                json={"valor": f"{float(pix_tx.amount_expected):.2f}"},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code not in (200, 201):
            raise ValueError(f"Erro ao solicitar estorno Cielo PIX: {resp.text}")

        await db.execute(
            update(PixTransaction).where(PixTransaction.payment_id == payment_id)
            .values(status="refunded")
        )
        await self._refund_sale(db, pix_tx.sale_id)
        await AuditService.log(
            db, "CIELO_PIX_REFUNDED",
            tenant_id=tenant_id, entity="pix_transaction", entity_id=pix_tx.id,
            detail={"txid": payment_id, "e2eid": e2eid, "sale_id": pix_tx.sale_id},
        )
        await db.commit()

        logger.info("Estorno Cielo PIX: txid=%s e2eid=%s sale=%s", payment_id, e2eid, pix_tx.sale_id)
        return {
            "payment_id": payment_id,
            "refund_id": devolucao_id,
            "sale_id": pix_tx.sale_id,
            "status": "refunded",
            "message": "Estorno PIX Cielo solicitado com sucesso.",
        }

    async def process_webhook(self, db: AsyncSession, payload: dict) -> None:
        """
        Processa notificação Cielo PIX.
        Payload: {"pix": [{"endToEndId": "E...", "txid": "VENDA...", "valor": "10.00", "horario": "..."}]}
        Apenas PIX com txid conhecido (gerado por este sistema) são processados.
        """
        for pix in payload.get("pix", []):
            e2eid = pix.get("endToEndId", "")
            txid = pix.get("txid", "")
            valor_str = pix.get("valor", "0")

            if not txid:
                continue

            sale_id = _parse_sale_id(txid)
            if not sale_id:
                logger.warning("Webhook Cielo PIX: txid não reconhecido: %s", txid)
                continue

            pix_tx_res = await db.execute(
                select(PixTransaction).where(PixTransaction.payment_id == txid)
            )
            pix_tx = pix_tx_res.scalar_one_or_none()

            if pix_tx and pix_tx.status != "pending":
                logger.info("Webhook Cielo PIX ignorado (já processado): txid=%s status=%s",
                            txid, pix_tx.status)
                continue

            try:
                valor_pago = Decimal(valor_str)
            except Exception:
                valor_pago = Decimal("0")

            if pix_tx and abs(float(pix_tx.amount_expected) - float(valor_pago)) > 0.02:
                logger.error(
                    "CIELO PIX FRAUDE: txid=%s esperado=%.2f pago=%.2f sale=%s",
                    txid, float(pix_tx.amount_expected), float(valor_pago), sale_id,
                )
                continue

            await self._confirm_sale(db, sale_id, txid)

            if pix_tx:
                await db.execute(
                    update(PixTransaction).where(PixTransaction.payment_id == txid)
                    .values(
                        status="approved",
                        amount_paid=valor_pago,
                        confirmed_at=datetime.now(timezone.utc),
                        confirmed_by=e2eid,  # endToEndId armazenado para estorno futuro
                    )
                )
                await db.commit()

            logger.info("PIX Cielo confirmado via webhook: txid=%s e2eid=%s sale=%s amount=%s",
                        txid, e2eid, sale_id, valor_str)

    async def register_webhook(self, pix_key: str, callback_url: str) -> dict:
        """
        Registra URL de callback na Cielo para receber notificações de PIX pagos.
        Deve ser chamado uma vez por chave PIX.
        PUT /webhook/{chave}
        """
        token = await _get_token()
        _, api_base = _urls()

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.put(
                f"{api_base}/webhook/{pix_key}",
                json={"webhookUrl": callback_url},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code not in (200, 201, 204):
            raise ValueError(f"Erro ao registrar webhook Cielo PIX: {resp.text}")

        logger.info("Webhook Cielo PIX registrado: chave=%s url=%s", pix_key, callback_url)
        return {
            "chave": pix_key,
            "webhookUrl": callback_url,
            "message": "Webhook Cielo PIX registrado com sucesso.",
        }

    # ── Helpers internos ──────────────────────────────────────────────────────

    async def _fetch_cob(self, txid: str) -> Optional[dict]:
        """GET /cob/{txid}. Retorna None em caso de erro."""
        try:
            token = await _get_token()
            _, api_base = _urls()
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{api_base}/cob/{txid}",
                    headers={"Authorization": f"Bearer {token}"},
                )
            if resp.status_code == 200:
                return resp.json()
        except Exception as exc:
            logger.warning("Erro ao consultar /cob/%s: %s", txid, exc)
        return None

    async def _confirm_sale(self, db: AsyncSession, sale_id: int, txid: str) -> None:
        from app.services.audit_service import AuditService
        from app.core.payment_events import signal_payment

        result = await db.execute(select(Sale).where(Sale.id == sale_id))
        sale = result.scalar_one_or_none()
        if sale and sale.status == SaleStatus.PENDING:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.COMPLETED)
            )
            await AuditService.log(
                db, "CIELO_PIX_CONFIRMED",
                tenant_id=sale.tenant_id, entity="sale", entity_id=sale_id,
                detail={"txid": txid, "sale_number": sale.sale_number},
            )
            await db.commit()
            if sale.payment_reference:
                signal_payment(sale.payment_reference, {"status": "approved", "paid": True})

    async def _refund_sale(self, db: AsyncSession, sale_id: int) -> None:
        from app.services.audit_service import AuditService

        result = await db.execute(select(Sale).where(Sale.id == sale_id))
        sale = result.scalar_one_or_none()
        if sale and sale.status == SaleStatus.COMPLETED:
            await db.execute(
                update(Sale).where(Sale.id == sale_id).values(status=SaleStatus.REFUNDED)
            )
            await AuditService.log(
                db, "CIELO_PIX_REFUNDED_SALE",
                tenant_id=sale.tenant_id, entity="sale", entity_id=sale_id,
                detail={"from": "COMPLETED", "to": "REFUNDED"},
            )
            await db.commit()
