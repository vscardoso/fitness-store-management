"""
Background scheduler para tarefas periódicas.
Usa APScheduler para rodar jobs assíncronos em background.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.services.conditional_notification_service import ConditionalNotificationService

logger = logging.getLogger(__name__)

# Instância global do scheduler
scheduler = AsyncIOScheduler()


async def check_sla_notifications_job():
    """
    Job: Verifica SLAs e envia notificações de departure/return.
    Roda a cada 1 minuto.
    """
    try:
        async with async_session_maker() as db:
            service = ConditionalNotificationService()
            result = await service.check_and_send_sla_notifications(db)
            logger.info(f"SLA check completed: {result}")
    except Exception as e:
        logger.error(f"Error in SLA check job: {e}", exc_info=True)


async def send_pending_reminder_job():
    """
    Job: Envia lembrete de envios pendentes.
    Roda a cada 2 horas.
    """
    try:
        async with async_session_maker() as db:
            service = ConditionalNotificationService()
            result = await service.send_pending_shipments_reminder(db)
            logger.info(f"Pending reminder sent: {result}")
    except Exception as e:
        logger.error(f"Error in pending reminder job: {e}", exc_info=True)


async def send_overdue_alert_job():
    """
    Job: Envia alerta de envios atrasados (SENT/PARTIAL_RETURN com deadline vencido).
    Roda a cada 4 horas.
    """
    try:
        async with async_session_maker() as db:
            service = ConditionalNotificationService()
            result = await service.send_overdue_shipments_alert(db)
            logger.info(f"Overdue alert sent: {result}")
    except Exception as e:
        logger.error(f"Error in overdue alert job: {e}", exc_info=True)


async def send_missed_departure_alert_job():
    """
    Job: Envia alerta de envios PENDENTES que perderam o SLA de envio.
    Roda a cada 30 minutos.
    """
    try:
        async with async_session_maker() as db:
            service = ConditionalNotificationService()
            result = await service.send_missed_departure_alert(db)
            logger.info(f"Missed departure alert sent: {result}")
    except Exception as e:
        logger.error(f"Error in missed departure alert job: {e}", exc_info=True)


def start_scheduler():
    """Inicia o scheduler com todos os jobs configurados."""

    # Job 1: Verificar SLAs a cada 1 minuto (notifica antes do SLA)
    scheduler.add_job(
        check_sla_notifications_job,
        trigger=IntervalTrigger(minutes=1),
        id="check_sla_notifications",
        name="Verificar SLAs e enviar notificações",
        replace_existing=True,
    )

    # Job 2: Lembrete de pendentes a cada 2 horas
    scheduler.add_job(
        send_pending_reminder_job,
        trigger=IntervalTrigger(hours=2),
        id="send_pending_reminder",
        name="Enviar lembrete de envios pendentes",
        replace_existing=True,
    )

    # Job 3: Alerta de atrasados (SENT/PARTIAL) a cada 4 horas
    scheduler.add_job(
        send_overdue_alert_job,
        trigger=IntervalTrigger(hours=4),
        id="send_overdue_alert",
        name="Enviar alerta de envios atrasados",
        replace_existing=True,
    )

    # Job 4: Alerta de PENDENTES que perderam SLA a cada 30 minutos
    scheduler.add_job(
        send_missed_departure_alert_job,
        trigger=IntervalTrigger(minutes=30),
        id="send_missed_departure_alert",
        name="Enviar alerta de envios pendentes que perderam SLA",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Background scheduler started with 4 jobs")
    logger.info("   - SLA check (before deadline): every 1 minute")
    logger.info("   - Pending reminder: every 2 hours")
    logger.info("   - Overdue alert (SENT): every 4 hours")
    logger.info("   - Missed departure alert (PENDING): every 30 minutes")


def shutdown_scheduler():
    """Para o scheduler gracefully."""
    scheduler.shutdown()
    logger.info("Background scheduler stopped")
