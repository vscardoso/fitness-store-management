"""
Script para testar o sistema de notificações.
Verifica:
1. Tokens push registrados
2. Envios condicionais pendentes
3. Envios com SLA próximo
"""
import asyncio
from datetime import datetime
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.notification import PushToken
from app.models.conditional_shipment import ConditionalShipment
from app.services.conditional_notification_service import ConditionalNotificationService


async def main():
    async with async_session_maker() as db:
        # 1. Verificar tokens push
        result = await db.execute(select(PushToken).where(PushToken.is_active == True))
        tokens = result.scalars().all()
        print(f"\n[TOKENS PUSH] Registrados: {len(tokens)}")
        for token in tokens:
            print(f"   - User ID {token.user_id}: {token.token[:50]}... ({token.device_type})")

        # 2. Verificar envios pendentes
        result = await db.execute(
            select(ConditionalShipment).where(
                ConditionalShipment.status == 'PENDING',
                ConditionalShipment.is_active == True
            )
        )
        pending = result.scalars().all()
        print(f"\n[PENDENTES] Total: {len(pending)}")

        # 2.1 Verificar quais perderam o SLA
        now = datetime.utcnow()
        missed_sla = []
        for shipment in pending:
            print(f"   - Envio #{shipment.id} (Cliente: {shipment.customer_id})")
            if shipment.departure_datetime:
                print(f"     Departure: {shipment.departure_datetime}")
                if shipment.departure_datetime < now:
                    hours_late = int((now - shipment.departure_datetime).total_seconds() / 3600)
                    print(f"     *** ATRASADO: {hours_late}h ***")
                    missed_sla.append(shipment)

        if missed_sla:
            print(f"\n[ALERTA] {len(missed_sla)} envio(s) PENDENTE(s) que perderam o SLA de envio!")

        # 3. Verificar envios enviados (SENT)
        result = await db.execute(
            select(ConditionalShipment).where(
                ConditionalShipment.status.in_(['SENT', 'PARTIAL_RETURN']),
                ConditionalShipment.is_active == True
            )
        )
        sent = result.scalars().all()
        print(f"\n[ENVIADOS] Total: {len(sent)}")
        for shipment in sent:
            print(f"   - Envio #{shipment.id} (Cliente: {shipment.customer_id})")
            if shipment.return_datetime:
                print(f"     Return: {shipment.return_datetime}")
            if shipment.deadline:
                print(f"     Deadline: {shipment.deadline}")

        # 4. Testar envio de lembrete de pendentes
        if len(tokens) > 0:
            print(f"\n[TESTE] Enviando notificacao de lembretes...")
            service = ConditionalNotificationService()
            result = await service.send_pending_shipments_reminder(db)
            print(f"   Resultado: {result}")
        else:
            print(f"\n[AVISO] Nenhum token push registrado. Registre um token no app mobile primeiro.")
            print(f"   Use o hook usePushNotifications.ts para registrar automaticamente.")


if __name__ == "__main__":
    asyncio.run(main())
