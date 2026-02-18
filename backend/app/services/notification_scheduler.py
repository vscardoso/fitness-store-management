"""
Serviço para agendamento de notificações push.
Gerencia notificações de envios condicionais:
- Hora de enviar
- Prazo de devolução vencido
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conditional_shipment import ConditionalShipment


class NotificationScheduler:
    """
    Gerencia agendamento de notificações push.

    Este serviço retorna os dados necessários para o mobile agendar as notificações
    localmente usando Expo Notifications.
    """

    @staticmethod
    def calculate_ship_notification_time(scheduled_ship_date: datetime) -> Optional[datetime]:
        """
        Calcula quando deve ser enviada a notificação de "hora de enviar".

        Args:
            scheduled_ship_date: Data/hora planejada para envio

        Returns:
            Data/hora para enviar notificação (15 min antes do envio)
        """
        if not scheduled_ship_date:
            return None

        # Notificar 15 minutos antes do horário de envio
        return scheduled_ship_date - timedelta(minutes=15)

    @staticmethod
    def calculate_deadline_notification_time(
        deadline: datetime
    ) -> Optional[datetime]:
        """
        Calcula quando deve ser enviada a notificação de "prazo vencendo".

        Args:
            deadline: Data/hora limite de devolução

        Returns:
            Data/hora para enviar notificação (1 dia antes)
        """
        if not deadline:
            return None

        # Notificar 1 dia antes do prazo
        return deadline - timedelta(days=1)

    @staticmethod
    def get_notification_schedule(
        shipment: ConditionalShipment
    ) -> Dict[str, Any]:
        """
        Retorna o agendamento completo de notificações para um envio.

        Args:
            shipment: ConditionalShipment

        Returns:
            Dict com notificações a agendar:
            {
                "ship_notification": {
                    "schedule_at": datetime,
                    "title": str,
                    "body": str,
                    "data": dict
                },
                "deadline_warning": {...},
                "deadline_expired": {...}
            }
        """
        notifications = {}

        # 1. Notificação: Hora de enviar (se agendado)
        if shipment.scheduled_ship_date and shipment.status == "PENDING":
            ship_notify_time = NotificationScheduler.calculate_ship_notification_time(
                shipment.scheduled_ship_date
            )

            if ship_notify_time and ship_notify_time > datetime.utcnow():
                notifications["ship_notification"] = {
                    "schedule_at": ship_notify_time,
                    "title": " Hora de Enviar",
                    "body": f"Envio #{shipment.id} está agendado para {shipment.scheduled_ship_date.strftime('%H:%M')}",
                    "data": {
                        "type": "shipment_time",
                        "shipment_id": shipment.id,
                        "route": f"/conditional/{shipment.id}",
                    }
                }

        # 2. Notificação: Prazo próximo (1 dia antes)
        if shipment.deadline and shipment.status in ["SENT", "PARTIAL_RETURN"]:
            warning_time = NotificationScheduler.calculate_deadline_notification_time(
                shipment.deadline
            )

            if warning_time and warning_time > datetime.utcnow():
                notifications["deadline_warning"] = {
                    "schedule_at": warning_time,
                    "title": " Prazo Próximo",
                    "body": f"Envio #{shipment.id} vence amanhã. Confirme devolução.",
                    "data": {
                        "type": "deadline_warning",
                        "shipment_id": shipment.id,
                        "route": f"/conditional/{shipment.id}",
                    }
                }

        # 3. Notificação: Prazo vencido (no momento exato)
        if shipment.deadline and shipment.status in ["SENT", "PARTIAL_RETURN"]:
            if shipment.deadline > datetime.utcnow():
                notifications["deadline_expired"] = {
                    "schedule_at": shipment.deadline,
                    "title": " Prazo Vencido",
                    "body": f"Envio #{shipment.id} atingiu o prazo de devolução!",
                    "data": {
                        "type": "deadline_expired",
                        "shipment_id": shipment.id,
                        "route": f"/conditional/{shipment.id}",
                        "priority": "high",
                    }
                }

        return notifications

    @staticmethod
    def cancel_shipment_notifications(shipment_id: int) -> Dict[str, Any]:
        """
        Retorna dados para cancelar todas as notificações de um envio.

        Args:
            shipment_id: ID do envio

        Returns:
            Dict com IDs das notificações para cancelar
        """
        return {
            "shipment_id": shipment_id,
            "notification_tags": [
                f"shipment_{shipment_id}_ship",
                f"shipment_{shipment_id}_deadline_warning",
                f"shipment_{shipment_id}_deadline_expired",
            ]
        }
