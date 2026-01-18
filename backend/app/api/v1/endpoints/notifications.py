from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.notification import PushTokenCreate, PushTokenResponse, SendNotificationRequest, NotificationResponse
from app.services.notification_service import NotificationService
from app.services.conditional_notification_service import ConditionalNotificationService
from app.api.deps import get_current_active_user, get_current_tenant_id, require_role
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["Notificações"])


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


@router.post("/send", response_model=NotificationResponse, dependencies=[Depends(require_role(["ADMIN"]))])
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


@router.post("/test/check-sla", dependencies=[Depends(require_role(["ADMIN"]))])
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


@router.post("/test/pending-reminder", dependencies=[Depends(require_role(["ADMIN"]))])
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


@router.post("/test/overdue-alert", dependencies=[Depends(require_role(["ADMIN"]))])
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


@router.post("/test/missed-departure-alert", dependencies=[Depends(require_role(["ADMIN"]))])
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
