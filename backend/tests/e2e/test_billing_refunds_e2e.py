"""
Testes E2E de cobranca e estornos (PDV/Point).

Objetivo:
- Validar os endpoints de cobranca no nivel HTTP + banco
- Mockar apenas a borda externa (Mercado Pago)
- Garantir transicoes de status das vendas
"""

from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.pdv_terminal import PDVTerminal
from app.models.pix_transaction import PixTransaction
from app.models.sale import PaymentMethod, Sale, SaleStatus
import app.services.pdv_service as pdv_service_module
import app.api.v1.endpoints.pdv as pdv_endpoints


class _FakeResponse:
    def __init__(self, status_code: int, data: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._data = data or {}
        self.text = text

    def json(self) -> dict:
        return self._data


class _FakeMPClient:
    """Cliente fake para simular chamadas HTTP ao Mercado Pago."""

    def __init__(self, responses: dict[str, _FakeResponse], *args, **kwargs):
        self._responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, json: dict | None = None, headers: dict | None = None):
        for suffix, response in self._responses.items():
            if url.endswith(suffix):
                return response
        return _FakeResponse(404, text=f"URL nao mockada: {url}")

    async def get(self, url: str, headers: dict | None = None):
        for suffix, response in self._responses.items():
            if url.endswith(suffix):
                return response
        return _FakeResponse(404, text=f"URL nao mockada: {url}")


async def _create_sale(async_session, status: SaleStatus, payment_reference: str | None = None) -> Sale:
    sale = Sale(
        tenant_id=1,
        sale_number=f"E2E-{uuid4().hex[:10]}",
        status=status,
        subtotal=Decimal("100.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        total_amount=Decimal("100.00"),
        payment_method=PaymentMethod.CREDIT_CARD,
        payment_reference=payment_reference,
        seller_id=1,
        notes="Teste E2E cobranca",
    )
    async_session.add(sale)
    await async_session.commit()
    await async_session.refresh(sale)
    return sale


async def _create_active_terminal(async_session) -> PDVTerminal:
    terminal = PDVTerminal(
        tenant_id=1,
        name="Caixa E2E",
        external_id=f"E2E-{uuid4().hex[:8]}",
        mp_pos_id="POS-123",
        mp_terminal_id="TERM-123",
        operating_mode="PDV",
        is_configured=True,
        is_pdv_active=True,
        is_active=True,
    )
    async_session.add(terminal)
    await async_session.commit()
    await async_session.refresh(terminal)
    return terminal


async def _create_pix_transaction(
    async_session,
    sale_id: int,
    payment_id: str,
    amount_expected: Decimal,
    status: str = "pending",
) -> PixTransaction:
    tx = PixTransaction(
        tenant_id=1,
        sale_id=sale_id,
        payment_id=payment_id,
        amount_expected=amount_expected,
        amount_paid=None,
        status=status,
        mp_external_reference=f"sale_{sale_id}_tenant_1",
        payer_email="cliente@teste.com",
    )
    async_session.add(tx)
    await async_session.commit()
    await async_session.refresh(tx)
    return tx


@pytest.mark.asyncio
async def test_create_order_e2e_updates_sale_payment_reference(test_client: AsyncClient, auth_token: str, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING)
    terminal = await _create_active_terminal(async_session)

    responses = {
        "/v1/orders": _FakeResponse(
            201,
            {
                "id": "ord_e2e_123",
                "status": "created",
                "transactions": {"payments": [{"id": "pay_e2e_123"}]},
            },
        )
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )

    response = await test_client.post(
        "/api/v1/pdv/orders",
        json={
            "sale_id": sale.id,
            "terminal_id": terminal.id,
            "total_amount": 100.0,
            "description": "Cobranca E2E",
            "payment_type": "credit_card",
            "installments": 1,
            "installments_cost": "seller",
        },
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["mp_order_id"] == "ord_e2e_123"
    assert data["status"] == "created"

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.payment_reference == "ord_e2e_123"


@pytest.mark.asyncio
async def test_cancel_order_e2e_marks_sale_cancelled(test_client: AsyncClient, auth_token: str, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING, payment_reference="ord_cancel_123")

    responses = {
        "/v1/orders/ord_cancel_123/cancel": _FakeResponse(200, {"status": "canceled"}),
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )

    response = await test_client.post(
        f"/api/v1/pdv/orders/{sale.id}/cancel",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "canceled"

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.CANCELLED


@pytest.mark.asyncio
async def test_cancel_order_e2e_returns_400_when_at_terminal(test_client: AsyncClient, auth_token: str, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING, payment_reference="ord_at_terminal_123")

    responses = {
        "/v1/orders/ord_at_terminal_123/cancel": _FakeResponse(422, {"message": "at_terminal"}, "at_terminal"),
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )

    response = await test_client.post(
        f"/api/v1/pdv/orders/{sale.id}/cancel",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 400
    assert "maquininha" in response.json()["detail"].lower()

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.PENDING


@pytest.mark.asyncio
async def test_refund_order_e2e_marks_sale_refunded(test_client: AsyncClient, auth_token: str, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.COMPLETED, payment_reference="ord_refund_123")

    responses = {
        "/v1/orders/ord_refund_123/refund": _FakeResponse(
            200,
            {"transactions": {"refunds": [{"id": "rfnd_123"}]}}
        ),
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )

    response = await test_client.post(
        f"/api/v1/pdv/orders/{sale.id}/refund",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "refunded"
    assert data["refund_id"] == "rfnd_123"

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.REFUNDED


@pytest.mark.asyncio
async def test_order_webhook_processed_confirms_pending_sale(test_client: AsyncClient, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING)

    # Evita dependencia de segredo de assinatura nos testes.
    monkeypatch.setattr(pdv_endpoints._service, "verify_webhook_signature", lambda *args, **kwargs: True)

    payload = {
        "type": "order",
        "action": "order.processed",
        "data": {
            "external_reference": f"sale_{sale.id}_tenant_1",
            "status": "processed",
        },
    }

    response = await test_client.post(
        "/api/v1/pdv/webhooks/mp?data.id=evt_1",
        json=payload,
        headers={"x-signature": "any", "x-request-id": "req_1"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.COMPLETED


@pytest.mark.asyncio
async def test_order_webhook_refunded_marks_sale_refunded(test_client: AsyncClient, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.COMPLETED)

    monkeypatch.setattr(pdv_endpoints._service, "verify_webhook_signature", lambda *args, **kwargs: True)

    payload = {
        "type": "order",
        "action": "order.refunded",
        "data": {
            "external_reference": f"sale_{sale.id}_tenant_1",
            "status": "refunded",
        },
    }

    response = await test_client.post(
        "/api/v1/pdv/webhooks/mp?data.id=evt_2",
        json=payload,
        headers={"x-signature": "any", "x-request-id": "req_2"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.REFUNDED


@pytest.mark.asyncio
async def test_pix_webhook_approved_confirms_sale_and_updates_transaction(test_client: AsyncClient, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING, payment_reference="pix_approved_123")
    tx = await _create_pix_transaction(async_session, sale.id, "pix_approved_123", Decimal("100.00"))

    responses = {
        "/v1/payments/pix_approved_123": _FakeResponse(
            200,
            {
                "id": "pix_approved_123",
                "status": "approved",
                "transaction_amount": 100.0,
                "external_reference": f"sale_{sale.id}_tenant_1",
            },
        )
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )
    monkeypatch.setattr(pdv_endpoints._service, "verify_webhook_signature", lambda *args, **kwargs: True)

    response = await test_client.post(
        "/api/v1/pdv/webhooks/mp?data.id=evt_pix_ok",
        json={"type": "payment", "data": {"id": "pix_approved_123"}},
        headers={"x-signature": "any", "x-request-id": "req_pix_ok"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.COMPLETED

    tx_db = (
        await async_session.execute(select(PixTransaction).where(PixTransaction.id == tx.id))
    ).scalar_one()
    assert tx_db.status == "approved"
    assert float(tx_db.amount_paid) == 100.0


@pytest.mark.asyncio
async def test_pix_webhook_rejected_cancels_sale_and_updates_transaction(test_client: AsyncClient, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING, payment_reference="pix_rejected_123")
    tx = await _create_pix_transaction(async_session, sale.id, "pix_rejected_123", Decimal("100.00"))

    responses = {
        "/v1/payments/pix_rejected_123": _FakeResponse(
            200,
            {
                "id": "pix_rejected_123",
                "status": "rejected",
                "transaction_amount": 100.0,
                "external_reference": f"sale_{sale.id}_tenant_1",
            },
        )
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )
    monkeypatch.setattr(pdv_endpoints._service, "verify_webhook_signature", lambda *args, **kwargs: True)

    response = await test_client.post(
        "/api/v1/pdv/webhooks/mp?data.id=evt_pix_rejected",
        json={"type": "payment", "data": {"id": "pix_rejected_123"}},
        headers={"x-signature": "any", "x-request-id": "req_pix_rejected"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.CANCELLED

    tx_db = (
        await async_session.execute(select(PixTransaction).where(PixTransaction.id == tx.id))
    ).scalar_one()
    assert tx_db.status == "rejected"


@pytest.mark.asyncio
async def test_pix_status_e2e_returns_amount_mismatch_and_does_not_confirm_sale(test_client: AsyncClient, auth_token: str, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING, payment_reference="pix_mismatch_123")
    tx = await _create_pix_transaction(async_session, sale.id, "pix_mismatch_123", Decimal("100.00"))

    responses = {
        "/v1/payments/pix_mismatch_123": _FakeResponse(
            200,
            {
                "id": "pix_mismatch_123",
                "status": "approved",
                "transaction_amount": 90.0,
                "external_reference": f"sale_{sale.id}_tenant_1",
            },
        )
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )

    response = await test_client.get(
        f"/api/v1/pdv/pix/{tx.payment_id}/status",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "amount_mismatch"
    assert data["paid"] is False

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.PENDING

    tx_db = (
        await async_session.execute(select(PixTransaction).where(PixTransaction.id == tx.id))
    ).scalar_one()
    assert tx_db.status == "pending"


@pytest.mark.asyncio
async def test_pix_status_e2e_approved_confirms_sale_and_updates_transaction(test_client: AsyncClient, auth_token: str, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING, payment_reference="pix_ok_status_123")
    tx = await _create_pix_transaction(async_session, sale.id, "pix_ok_status_123", Decimal("100.00"))

    responses = {
        "/v1/payments/pix_ok_status_123": _FakeResponse(
            200,
            {
                "id": "pix_ok_status_123",
                "status": "approved",
                "transaction_amount": 100.0,
                "external_reference": f"sale_{sale.id}_tenant_1",
            },
        )
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )

    response = await test_client.get(
        f"/api/v1/pdv/pix/{tx.payment_id}/status",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "approved"
    assert data["paid"] is True

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.COMPLETED

    tx_db = (
        await async_session.execute(select(PixTransaction).where(PixTransaction.id == tx.id))
    ).scalar_one()
    assert tx_db.status == "approved"
    assert float(tx_db.amount_paid) == 100.0


@pytest.mark.asyncio
async def test_pix_status_e2e_expired_returns_not_paid_and_keeps_pending_sale(test_client: AsyncClient, auth_token: str, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.PENDING, payment_reference="pix_expired_status_123")
    tx = await _create_pix_transaction(async_session, sale.id, "pix_expired_status_123", Decimal("100.00"))

    responses = {
        "/v1/payments/pix_expired_status_123": _FakeResponse(
            200,
            {
                "id": "pix_expired_status_123",
                "status": "expired",
                "transaction_amount": 100.0,
                "external_reference": f"sale_{sale.id}_tenant_1",
            },
        )
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )

    response = await test_client.get(
        f"/api/v1/pdv/pix/{tx.payment_id}/status",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "expired"
    assert data["paid"] is False

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.PENDING

    tx_db = (
        await async_session.execute(select(PixTransaction).where(PixTransaction.id == tx.id))
    ).scalar_one()
    assert tx_db.status == "pending"


@pytest.mark.asyncio
async def test_refund_pix_e2e_marks_sale_and_transaction_refunded(test_client: AsyncClient, auth_token: str, async_session, monkeypatch):
    sale = await _create_sale(async_session, SaleStatus.COMPLETED, payment_reference="pix_refund_ok_123")
    tx = await _create_pix_transaction(async_session, sale.id, "pix_refund_ok_123", Decimal("100.00"), status="approved")

    responses = {
        "/v1/payments/pix_refund_ok_123/refunds": _FakeResponse(201, {"id": "rf_pix_123"}),
    }

    monkeypatch.setattr(
        pdv_service_module.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _FakeMPClient(responses, *args, **kwargs),
    )

    response = await test_client.post(
        f"/api/v1/pdv/pix/{tx.payment_id}/refund",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "refunded"
    assert data["refund_id"] == "rf_pix_123"

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.REFUNDED

    tx_db = (
        await async_session.execute(select(PixTransaction).where(PixTransaction.id == tx.id))
    ).scalar_one()
    assert tx_db.status == "refunded"


@pytest.mark.asyncio
async def test_refund_pix_e2e_returns_400_when_transaction_not_approved(test_client: AsyncClient, auth_token: str, async_session):
    sale = await _create_sale(async_session, SaleStatus.PENDING, payment_reference="pix_refund_blocked_123")
    tx = await _create_pix_transaction(async_session, sale.id, "pix_refund_blocked_123", Decimal("100.00"), status="pending")

    response = await test_client.post(
        f"/api/v1/pdv/pix/{tx.payment_id}/refund",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert response.status_code == 400
    assert "aprovad" in response.json()["detail"].lower()

    sale_db = (
        await async_session.execute(select(Sale).where(Sale.id == sale.id))
    ).scalar_one()
    assert sale_db.status == SaleStatus.PENDING
