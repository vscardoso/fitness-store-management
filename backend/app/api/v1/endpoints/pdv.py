"""
Endpoints PDV — agnóstico ao provedor de pagamento.

Prefixo: /pdv

Suporta: Mercado Pago, Cielo, Stone, Rede, GetNet, PagSeguro, SumUp, manual.
O provider é determinado pelo campo `provider` do terminal.
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.repositories.pdv_repository import PDVTerminalRepository
from app.services.pdv_service import PDVService
from app.schemas.pdv import (
    PDVTerminalCreate,
    PDVTerminalResponse,
    ProviderListResponse,
    MPStoreSetupRequest,
    MPStoreSetupResponse,
    MPPOSSetupResponse,
    MPDeviceListResponse,
    ActivatePDVRequest,
    ActivatePDVResponse,
    PDVPaymentRequest,
    PDVPaymentResponse,
    PDVPaymentStatusResponse,
    PDVOrderRequest,
    PDVOrderResponse,
    PDVOrderActionResponse,
    ManualConfirmResponse,
    PixPaymentResponse,
    PixStatusResponse,
    PixStartRequest,
    PixStartResponse,
    PixRefundResponse,
    TerminalStartRequest,
    TerminalStartResponse,
    PendingSaleResponse,
    TerminalCredentialsUpdate,
    TerminalCredentialsResponse,
)

router = APIRouter(prefix="/pdv", tags=["PDV"])
_repo = PDVTerminalRepository()
_service = PDVService()


# ── Providers disponíveis ────────────────────────────────────────────────────

@router.get("/providers", response_model=ProviderListResponse)
async def list_providers():
    """Lista providers de pagamento disponíveis para terminais e PIX."""
    return _service.get_available_providers()


# ── Passo 1: Setup loja no provider ──────────────────────────────────────────

@router.post("/store/setup", response_model=MPStoreSetupResponse)
async def setup_store(
    payload: MPStoreSetupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria a loja no provider externo (atualmente: Mercado Pago)."""
    try:
        return await _service.setup_provider_store(db, current_user.tenant_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ── Passo 2: Caixas (terminais) ─────────────────────────────────────────────

@router.post("/terminals", response_model=PDVTerminalResponse, status_code=201)
async def create_terminal(
    payload: PDVTerminalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria um novo caixa PDV local com o provider especificado."""
    existing = await _repo.get_by_external_id(db, payload.external_id, current_user.tenant_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe um terminal com external_id '{payload.external_id}'.",
        )
    terminal = await _repo.create(db, {
        "name": payload.name,
        "external_id": payload.external_id,
        "provider": payload.provider,
        "tenant_id": current_user.tenant_id,
    })
    return terminal


@router.get("/terminals", response_model=List[PDVTerminalResponse])
async def list_terminals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todos os caixas/terminais ativos do tenant."""
    return await _repo.get_by_tenant(db, current_user.tenant_id)


@router.post("/terminals/{terminal_id}/setup", response_model=MPPOSSetupResponse)
async def setup_terminal(
    terminal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Configura o terminal no provider externo (ex: cria POS no MP)."""
    try:
        return await _service.setup_terminal(db, terminal_id, current_user.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/terminals/{terminal_id}", status_code=204)
async def delete_terminal(
    terminal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Desativa (soft delete) um caixa/terminal."""
    terminal = await _repo.get(db, terminal_id)
    if not terminal or terminal.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Terminal não encontrado.")
    await _repo.delete(db, terminal_id)


@router.put("/terminals/{terminal_id}/credentials", response_model=TerminalCredentialsResponse)
async def update_terminal_credentials(
    terminal_id: int,
    payload: TerminalCredentialsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Salva credenciais de integração cloud no terminal (Stone sk_key, Cielo merchant_id, etc.).
    Após salvar, executa setup automático para validar e marcar como configurado.
    """
    from sqlalchemy import select, update as sql_update
    from app.models.pdv_terminal import PDVTerminal

    result = await db.execute(
        select(PDVTerminal).where(
            PDVTerminal.id == terminal_id,
            PDVTerminal.tenant_id == current_user.tenant_id,
            PDVTerminal.is_active == True,
        )
    )
    terminal = result.scalar_one_or_none()
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal não encontrado.")

    # Mescla credenciais novas com provider_config existente
    cfg = dict(terminal.provider_config or {})
    data = payload.model_dump(exclude_none=True)

    field_map = {
        "stone": ["sk_key", "device_serial_number", "stonecode"],
        "cielo": ["merchant_id"],
        "mercadopago": ["mp_access_token", "mp_terminal_id"],
    }
    allowed = field_map.get(terminal.provider, list(data.keys()))
    for field in allowed:
        if field in data:
            cfg[field] = data[field]

    await db.execute(
        sql_update(PDVTerminal)
        .where(PDVTerminal.id == terminal_id)
        .values(provider_config=cfg)
    )
    await db.commit()

    # Re-executa setup para validar e marcar is_configured
    try:
        setup_result = await _service.setup_terminal(db, terminal_id, current_user.tenant_id)
        configured = setup_result.get("configured", False)
        message = setup_result.get("message", "Credenciais salvas.")
    except ValueError as e:
        configured = False
        message = str(e)

    return TerminalCredentialsResponse(
        terminal_id=terminal_id,
        provider=terminal.provider,
        configured=configured,
        message=message,
    )


# ── Dispositivos físicos do provider ─────────────────────────────────────────

@router.get("/devices", response_model=MPDeviceListResponse)
async def list_provider_devices(
    provider: str = "mercadopago",
    store_id: Optional[str] = None,
    pos_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista dispositivos físicos (maquininhas) do provider."""
    try:
        return await _service.list_provider_devices(
            db, current_user.tenant_id, provider, store_id, pos_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# Compat: rota antiga /mp-terminals
@router.get("/mp-terminals", response_model=MPDeviceListResponse, include_in_schema=False)
async def list_mp_device_terminals(
    store_id: Optional[str] = None,
    pos_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await _service.list_provider_devices(
            db, current_user.tenant_id, "mercadopago", store_id, pos_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ── Ativar modo PDV ──────────────────────────────────────────────────────────

@router.post("/terminals/{terminal_id}/activate", response_model=ActivatePDVResponse)
async def activate_pdv_mode(
    terminal_id: int,
    payload: ActivatePDVRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ativa o modo PDV no terminal físico."""
    try:
        device_id = payload.get_device_id()
        if not device_id:
            raise ValueError("Informe terminal_device_id ou mp_terminal_id.")
        return await _service.activate_pdv_mode(
            db, terminal_id, current_user.tenant_id, device_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ── Orders (pagamento via terminal) ──────────────────────────────────────────

@router.post("/orders", response_model=PDVOrderResponse)
async def create_order(
    payload: PDVOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria pagamento no terminal usando o provider configurado."""
    try:
        return await _service.create_order(db, current_user.tenant_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/orders/{sale_id}/status", response_model=PDVPaymentStatusResponse)
async def get_order_status(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consulta status do pagamento no terminal."""
    try:
        return await _service.get_order_status(db, sale_id, current_user.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/orders/{sale_id}/cancel", response_model=PDVOrderActionResponse)
async def cancel_order(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancela pagamento pendente."""
    try:
        return await _service.cancel_order(db, sale_id, current_user.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/orders/{sale_id}/refund", response_model=PDVOrderActionResponse)
async def refund_order(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reembolso total de pagamento confirmado."""
    try:
        return await _service.refund_order(db, sale_id, current_user.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ── Confirmação manual ────────────────────────────────────────────────────────

@router.post("/orders/{sale_id}/confirm", response_model=ManualConfirmResponse)
async def confirm_manual_payment(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirma pagamento manualmente (para providers sem integração cloud)."""
    try:
        return await _service.confirm_manual_payment(db, sale_id, current_user.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ── Terminal Start (atomic sale + terminal dispatch) ─────────────────────────

@router.post("/terminal/start", status_code=201)
async def terminal_start(
    payload: TerminalStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria venda PENDING + envia para terminal atomicamente. Evita race condition."""
    try:
        return await _service.create_terminal_start(
            db, current_user.tenant_id, current_user.id, payload.model_dump()
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ── PIX QR Code ───────────────────────────────────────────────────────────────

@router.post("/pix/start", response_model=PixStartResponse, status_code=201)
async def pix_start(
    payload: PixStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria venda PENDING + gera QR Code PIX atomicamente."""
    try:
        return await _service.create_pix_start(
            db,
            current_user.tenant_id,
            current_user.id,
            payload.model_dump(exclude={"payer_email"}),
            payer_email=payload.payer_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/pix/{sale_id}", response_model=PixPaymentResponse)
async def generate_pix(
    sale_id: int,
    payer_email: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gera QR Code PIX para uma venda existente."""
    try:
        return await _service.create_pix_payment(
            db, sale_id, current_user.tenant_id, payer_email
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/pix/{payment_id}/refund", response_model=PixRefundResponse)
async def refund_pix(
    payment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reembolsa pagamento PIX aprovado."""
    try:
        return await _service.refund_pix_payment(db, payment_id, current_user.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/pix/{payment_id}/events")
async def pix_sse(
    payment_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE: stream de eventos do pagamento PIX. Timeout: 35 min."""
    from app.core.payment_events import get_or_create_event, get_result, cleanup

    async def generate():
        yield f"data: {json.dumps({'status': 'pending', 'paid': False})}\n\n"
        event = get_or_create_event(payment_id)
        try:
            await asyncio.wait_for(event.wait(), timeout=35 * 60)
            result = get_result(payment_id) or {"status": "expired", "paid": False}
        except asyncio.TimeoutError:
            result = {"status": "expired", "paid": False}
        finally:
            cleanup(payment_id)
        yield f"data: {json.dumps(result)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/pix/{payment_id}/status", response_model=PixStatusResponse)
async def check_pix_status(
    payment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consulta status do pagamento PIX."""
    return await _service.get_pix_payment_status(db, payment_id, current_user.tenant_id)


# ── Compat: rotas antigas ────────────────────────────────────────────────────

@router.post("/payment", response_model=PDVOrderResponse, include_in_schema=False)
async def create_payment_compat(
    payload: PDVPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await _service.create_order(db, current_user.tenant_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/payment/{sale_id}/status", response_model=PDVPaymentStatusResponse, include_in_schema=False)
async def check_payment_status_compat(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await _service.get_order_status(db, sale_id, current_user.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ── Webhooks ─────────────────────────────────────────────────────────────────

@router.post("/webhooks/mp", status_code=200)
async def mp_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Recebe webhook do Mercado Pago (Point + PIX). Valida HMAC-SHA256."""
    x_signature = request.headers.get("x-signature")
    x_request_id = request.headers.get("x-request-id")
    data_id = request.query_params.get("data.id")

    if not _service.verify_webhook_signature(x_signature, x_request_id, data_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Assinatura de webhook inválida.",
        )

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    await _service.process_webhook(db, payload, provider="mercadopago")
    return {"status": "ok"}


# ── Webhooks Stone ───────────────────────────────────────────────────────────

@router.post("/webhooks/stone", status_code=200)
async def stone_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Recebe webhooks da Stone/Pagar.me (charge.paid, charge.refunded).
    Após charge.paid, fecha o pedido e confirma a venda.
    """
    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}

    event_type = payload.get("type", "")
    if event_type == "charge.paid":
        from sqlalchemy import select as _select, update as _update
        from app.models.sale import Sale, SaleStatus
        charge = payload.get("data", {})
        metadata = charge.get("metadata", {})
        sale_id = metadata.get("sale_id")
        if sale_id:
            await db.execute(
                _update(Sale).where(Sale.id == int(sale_id)).values(status=SaleStatus.COMPLETED)
            )
            await db.commit()

            from app.core.payment_events import signal_payment
            signal_payment(str(sale_id), {"status": "approved", "paid": True})

    return {"status": "ok"}


# ── Webhooks Cielo ────────────────────────────────────────────────────────────

@router.post("/webhooks/cielo", status_code=200)
async def cielo_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Recebe webhooks da Cielo LIO (status change).
    Confirma venda quando status = PAID.
    """
    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}

    order_status = payload.get("status", "")
    order_id = payload.get("id") or payload.get("orderId")

    if order_status in ("PAID", "CLOSED") and order_id:
        from sqlalchemy import select as _select, update as _update
        from app.models.sale import Sale, SaleStatus
        result = await db.execute(
            _select(Sale).where(Sale.payment_reference == str(order_id))
        )
        sale = result.scalar_one_or_none()
        if sale and sale.status != SaleStatus.COMPLETED:
            await db.execute(
                _update(Sale).where(Sale.id == sale.id).values(status=SaleStatus.COMPLETED)
            )
            await db.commit()

            from app.core.payment_events import signal_payment
            signal_payment(str(sale.id), {"status": "approved", "paid": True})

    return {"status": "ok"}


# ── Pagamentos Pendentes ──────────────────────────────────────────────────────

@router.get("/pending-sales", response_model=List[PendingSaleResponse])
async def list_pending_sales(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista vendas com status PENDING (PIX ou terminal aguardando confirmação)."""
    return await _service.get_pending_sales(db, current_user.tenant_id)
