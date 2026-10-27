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
from app.tasks.wishlist_notifier import run_wishlist_notifier
from app.services.pdv_service import PDVService
from app.services.app_notification_service import AppNotificationService

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
            from app.core.rls import bypass_on
            await bypass_on(db)
            service = ConditionalNotificationService()
            result = await service.check_and_send_sla_notifications(db)
            logger.info(f"SLA check completed: {result}")
    except Exception as e:
        logger.error(f"Error in SLA check job: {e}", exc_info=True)


async def stock_alerts_push_job():
    """
    Job: sincroniza os alertas de estoque de todas as lojas e manda push dos novos.
    Roda a cada 15 minutos.
    """
    try:
        async with async_session_maker() as db:
            from app.core.rls import bypass_on
            await bypass_on(db)
            result = await AppNotificationService().run_stock_alerts(db)
            if result["pending"]:
                logger.info(f"Stock alerts push: {result}")
    except Exception as e:
        logger.error(f"Error in stock alerts push job: {e}", exc_info=True)


async def send_pending_reminder_job():
    """
    Job: Envia lembrete de envios pendentes.
    Roda a cada 2 horas.
    """
    try:
        async with async_session_maker() as db:
            from app.core.rls import bypass_on
            await bypass_on(db)
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
            from app.core.rls import bypass_on
            await bypass_on(db)
            service = ConditionalNotificationService()
            result = await service.send_overdue_shipments_alert(db)
            logger.info(f"Overdue alert sent: {result}")
    except Exception as e:
        logger.error(f"Error in overdue alert job: {e}", exc_info=True)


async def auto_cancel_stale_terminal_sales_job():
    """
    Job: Auto-cancela vendas PENDING de terminal (maquininha) com mais de 30 minutos.
    Roda a cada 5 minutos.
    """
    try:
        async with async_session_maker() as db:
            from app.core.rls import bypass_on
            await bypass_on(db)
            service = PDVService()
            count = await service.auto_cancel_stale_pending_sales(db, timeout_minutes=30)
            if count:
                logger.info(f"Auto-cancel terminal job: {count} vendas canceladas")
    except Exception as e:
        logger.error(f"Error in auto-cancel terminal job: {e}", exc_info=True)


async def expire_pix_transactions_job():
    """
    Job: Expira transações PIX pendentes cujo QR Code já venceu.
    Roda a cada 5 minutos.
    """
    try:
        async with async_session_maker() as db:
            from app.core.rls import bypass_on
            await bypass_on(db)
            service = PDVService()
            count = await service.expire_pending_pix(db)
            if count:
                logger.info(f"PIX expiration job: {count} transações expiradas")
    except Exception as e:
        logger.error(f"Error in PIX expiration job: {e}", exc_info=True)


async def send_missed_departure_alert_job():
    """
    Job: Envia alerta de envios PENDENTES que perderam o SLA de envio.
    Roda a cada 30 minutos.
    """
    try:
        async with async_session_maker() as db:
            from app.core.rls import bypass_on
            await bypass_on(db)
            service = ConditionalNotificationService()
            result = await service.send_missed_departure_alert(db)
            logger.info(f"Missed departure alert sent: {result}")
    except Exception as e:
        logger.error(f"Error in missed departure alert job: {e}", exc_info=True)


# ─── Líder entre workers ───────────────────────────────────────────────────
# Com mais de um worker do uvicorn, só UM pode rodar o agendador (senão cada job rodaria em dobro: lembretes e
# notificações duplicados). O líder é quem pega um bloqueio de sessão do Postgres e o segura enquanto o processo viver;
# se ele cair, o bloqueio solta sozinho e o worker que nascer no lugar assume.
_LEADER_KEY = 7_300_999_001
_leader_conn = None


async def acquire_leader_lock() -> bool:
    """True se este processo é o líder (roda agendador e preparo do banco). Sem Postgres (testes, SQLite) é sempre líder."""
    global _leader_conn
    from sqlalchemy import text
    from app.core.database import engine
    if engine.dialect.name != "postgresql":
        return True
    conn = await engine.connect()
    ok = bool((await conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _LEADER_KEY})).scalar())
    await conn.commit()  # o bloqueio é da sessão, não da transação: continua valendo
    if ok:
        _leader_conn = conn  # fica aberta de propósito; fechar soltaria o bloqueio
    else:
        await conn.close()
    return ok


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

    # Job 1b: Alertas de estoque (push) a cada 15 minutos
    scheduler.add_job(
        stock_alerts_push_job,
        trigger=IntervalTrigger(minutes=15),
        id="stock_alerts_push",
        name="Sincronizar alertas de estoque e enviar push",
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

    # Job 5: Notificar wishlist quando produto volta ao estoque (1h)
    scheduler.add_job(
        run_wishlist_notifier,
        trigger=IntervalTrigger(hours=1),
        id="wishlist_notifier",
        name="Notificar clientes: produto voltou ao estoque",
        replace_existing=True,
    )

    # Job 6: Expirar transações PIX vencidas a cada 5 minutos
    scheduler.add_job(
        expire_pix_transactions_job,
        trigger=IntervalTrigger(minutes=5),
        id="expire_pix_transactions",
        name="Expirar PIX pendentes vencidos",
        replace_existing=True,
    )

    # Job 7: Auto-cancelar vendas PENDING de terminal após 30 minutos
    scheduler.add_job(
        auto_cancel_stale_terminal_sales_job,
        trigger=IntervalTrigger(minutes=5),
        id="auto_cancel_stale_terminal_sales",
        name="Auto-cancelar maquininha PENDING > 30min",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Background scheduler started with 7 jobs")
    logger.info("   - SLA check (before deadline): every 1 minute")
    logger.info("   - Pending reminder: every 2 hours")
    logger.info("   - Overdue alert (SENT): every 4 hours")
    logger.info("   - Missed departure alert (PENDING): every 30 minutes")


def shutdown_scheduler():
    """Para o scheduler gracefully (só o líder o iniciou)."""
    if scheduler.running:
        scheduler.shutdown()
    logger.info("Background scheduler stopped")
