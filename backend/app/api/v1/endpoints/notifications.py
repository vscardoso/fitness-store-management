from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.notification import (
    PushTokenCreate, PushTokenResponse, SendNotificationRequest, NotificationResponse,
    AppNotificationResponse, UnreadCountResponse,
)
from app.services.app_notification_service import AppNotificationService
from app.services.notification_service import NotificationService
from app.services.conditional_notification_service import ConditionalNotificationService
from app.api.deps import get_current_active_user, get_current_tenant_id, require_role
from app.models.user import User, UserRole

router = APIRouter(prefix="/notifications", tags=["Notificações"])


def _somente_fora_de_producao() -> None:
    """Endpoints /test/* varrem todas as lojas: nao existem em producao."""
    from app.core.config import settings
    if settings.ENVIRONMENT == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


@router.get("/inbox", response_model=list[AppNotificationResponse])
async def list_inbox(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    _: User = Depends(get_current_active_user),
):
    """Alertas da loja (estoque baixo e zerado); não lidos primeiro"""
    return await AppNotificationService().list(db, tenant_id)


@router.get("/inbox/unread-count", response_model=UnreadCountResponse)
async def inbox_unread_count(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    _: User = Depends(get_current_active_user),
):
    return UnreadCountResponse(count=await AppNotificationService().unread_count(db, tenant_id))


@router.post("/inbox/read-all", response_model=UnreadCountResponse)
async def inbox_read_all(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    _: User = Depends(get_current_active_user),
):
    await AppNotificationService().mark_all_read(db, tenant_id)
    return UnreadCountResponse(count=0)


@router.post("/inbox/{notification_id}/read", response_model=AppNotificationResponse)
async def inbox_mark_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    _: User = Depends(get_current_active_user),
):
    n = await AppNotificationService().mark_read(db, tenant_id, notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    return n


@router.post("/inbox/push-now", dependencies=[Depends(require_role([UserRole.ADMIN]))])
async def inbox_push_now(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Sincroniza os alertas de estoque desta loja e dispara os pushes pendentes (ADMIN; o agendador faz o mesmo a cada 15 min)"""
    return await AppNotificationService().run_stock_alerts(db, tenant_id)


@router.post("/token", response_model=PushTokenResponse, status_code=status.HTTP_201_CREATED)
async def register_push_token(
    token_data: PushTokenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Registra token Expo Push"""
    service = NotificationService()
    token = await service.register_token(
        db, current_user.id, tenant_id, token_data.token, token_data.device_type
    )
    return token


class WebPushKeys(BaseModel):
    p256dh: str = Field(..., min_length=10, max_length=255)
    auth: str = Field(..., min_length=4, max_length=255)


class WebPushSubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=10, max_length=2000)
    keys: WebPushKeys


class WebPushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=10, max_length=2000)


@router.get("/web-push/key")
async def web_push_key(current_user: User = Depends(get_current_active_user)):
    """Chave pública para o app instalado se inscrever (Web Push). enabled=false: servidor sem as chaves."""
    from app.core.config import settings
    from app.services import web_push_service
    return {"enabled": web_push_service.enabled(), "public_key": settings.VAPID_PUBLIC_KEY or None}


@router.post("/web-push/subscribe", status_code=status.HTTP_201_CREATED)
async def web_push_subscribe(
    body: WebPushSubscribeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Inscreve este aparelho para receber as notificações do app instalado."""
    from app.services import web_push_service
    if not body.endpoint.startswith("https://"):
        raise HTTPException(status_code=400, detail="Inscrição inválida.")
    sub = await web_push_service.subscribe(
        db, user_id=current_user.id, tenant_id=tenant_id, endpoint=body.endpoint,
        p256dh=body.keys.p256dh, auth=body.keys.auth, user_agent=request.headers.get("user-agent"),
    )
    return {"ok": True, "id": sub.id}


@router.post("/web-push/unsubscribe")
async def web_push_unsubscribe(
    body: WebPushUnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from app.services import web_push_service
    return {"ok": await web_push_service.unsubscribe(db, user_id=current_user.id, endpoint=body.endpoint)}


@router.post("/send", response_model=NotificationResponse, dependencies=[Depends(require_role([UserRole.ADMIN]))])
async def send_notification(
    notif_data: SendNotificationRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Envia notificação push (ADMIN)"""
    service = NotificationService()
    result = await service.send_notification(
        db, tenant_id, notif_data.user_ids, notif_data.title, notif_data.body, notif_data.data
    )
    return result


@router.post("/test/check-sla", dependencies=[Depends(require_role([UserRole.ADMIN])), Depends(_somente_fora_de_producao)])
async def test_check_sla_notifications(
    db: AsyncSession = Depends(get_db),
):
    """
    [TESTE] Verifica e envia notificações de SLA (departure e return).
    Use este endpoint para testar manualmente o sistema de notificações periódicas.
    """
    service = ConditionalNotificationService()
    result = await service.check_and_send_sla_notifications(db)
    return {
        "success": True,
        "message": "Verificação de SLA concluída",
        "result": result
    }


@router.post("/test/pending-reminder", dependencies=[Depends(require_role([UserRole.ADMIN])), Depends(_somente_fora_de_producao)])
async def test_pending_shipments_reminder(
    db: AsyncSession = Depends(get_db),
):
    """
    [TESTE] Envia notificação de lembrete para todos envios pendentes.
    Agrupa por tenant e envia um resumo consolidado.
    """
    service = ConditionalNotificationService()
    result = await service.send_pending_shipments_reminder(db)
    return {
        "success": True,
        "message": "Lembrete de envios pendentes enviado",
        "result": result
    }


@router.post("/test/overdue-alert", dependencies=[Depends(require_role([UserRole.ADMIN])), Depends(_somente_fora_de_producao)])
async def test_overdue_shipments_alert(
    db: AsyncSession = Depends(get_db),
):
    """
    [TESTE] Envia notificação CRÍTICA para todos envios atrasados.
    Agrupa por tenant e inclui lista de clientes afetados.
    """
    service = ConditionalNotificationService()
    result = await service.send_overdue_shipments_alert(db)
    return {
        "success": True,
        "message": "Alerta de envios atrasados enviado",
        "result": result
    }


@router.post("/test/missed-departure-alert", dependencies=[Depends(require_role([UserRole.ADMIN])), Depends(_somente_fora_de_producao)])
async def test_missed_departure_alert(
    db: AsyncSession = Depends(get_db),
):
    """
    [TESTE] Envia notificação CRÍTICA para envios PENDENTES que perderam o SLA de envio.

    Detecta envios que deveriam ter sido enviados mas ainda estão pendentes:
    - Status: PENDING
    - departure_datetime: definido e no passado
    """
    service = ConditionalNotificationService()
    result = await service.send_missed_departure_alert(db)
    return {
        "success": True,
        "message": "Alerta de SLA perdido enviado",
        "result": result
    }
