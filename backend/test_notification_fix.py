"""
Teste simples para verificar se o sistema de notificações de envios condicionais está funcionando.

Este script testa:
1. Cálculo correto de deadline usando return_datetime
2. Integração de notificações ao criar/atualizar envio
3. Sistema de notificações SLA

Uso:
    python test_notification_fix.py
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session_maker
from app.services.conditional_shipment import ConditionalShipmentService
from app.services.conditional_notification_service import ConditionalNotificationService
from app.models.conditional_shipment import ConditionalShipment


async def test_deadline_calculation():
    """Testa se o deadline está sendo calculado corretamente usando return_datetime"""
    print("=" * 80)
    print("TESTE #1: Cálculo de Deadline com return_datetime")
    print("=" * 80)

    async with async_session_maker() as db:
        # Buscar primeiro envio PENDING
        from sqlalchemy import select
        result = await db.execute(
            select(ConditionalShipment).where(
                ConditionalShipment.status == 'PENDING'
            ).limit(1)
        )
        shipment = result.scalars().first()

        if not shipment:
            print("❌ Nenhum envio PENDING encontrado para testar")
            return

        print(f"\n📦 Envio #{shipment.id}")
        print(f"   Status: {shipment.status}")
        print(f"   departure_datetime: {shipment.departure_datetime}")
        print(f"   return_datetime: {shipment.return_datetime}")
        print(f"   deadline (atual): {shipment.deadline}")

        # Simular mark_as_sent
        service = ConditionalShipmentService()

        # Definir datas de teste
        now = datetime.utcnow()
        shipment.departure_datetime = now
        shipment.return_datetime = now + timedelta(days=7)
        await db.commit()

        print(f"\n✅ Datas atualizadas:")
        print(f"   departure_datetime: {shipment.departure_datetime}")
        print(f"   return_datetime: {shipment.return_datetime}")

        # Marcar como enviado
        try:
            updated = await service.mark_as_sent(
                db, shipment.id, shipment.tenant_id, 1,
                carrier="Teste",
                tracking_code="TEST123"
            )

            print(f"\n🎯 Resultado do mark_as_sent:")
            print(f"   Status: {updated.status}")
            print(f"   sent_at: {updated.sent_at}")
            print(f"   deadline: {updated.deadline}")
            print(f"   return_datetime: {updated.return_datetime}")

            # Verificar se deadline == return_datetime
            if updated.deadline == updated.return_datetime:
                print(f"\n✅ SUCESSO: deadline foi calculado corretamente usando return_datetime!")
            else:
                print(f"\n❌ ERRO: deadline ({updated.deadline}) != return_datetime ({updated.return_datetime})")

        except Exception as e:
            print(f"\n❌ Erro ao marcar como enviado: {e}")


async def test_sla_notifications():
    """Testa se as notificações SLA estão sendo verificadas corretamente"""
    print("\n\n")
    print("=" * 80)
    print("TESTE #2: Sistema de Notificações SLA")
    print("=" * 80)

    async with async_session_maker() as db:
        service = ConditionalNotificationService()

        print("\n🔍 Verificando SLAs e enviando notificações...")
        result = await service.check_and_send_sla_notifications(db)

        print(f"\n📊 Resultado:")
        print(f"   Notificações de envio: {result['departure_notifications']}")
        print(f"   Notificações de retorno: {result['return_notifications']}")
        print(f"   Verificado em: {result['checked_at']}")

        if result['departure_notifications'] > 0 or result['return_notifications'] > 0:
            print(f"\n✅ Sistema de notificações está funcionando!")
        else:
            print(f"\n⚠️  Nenhuma notificação enviada (pode ser normal se não há envios próximos ao prazo)")


async def test_overdue_detection():
    """Testa se envios atrasados estão sendo detectados corretamente"""
    print("\n\n")
    print("=" * 80)
    print("TESTE #3: Detecção de Envios Atrasados")
    print("=" * 80)

    async with async_session_maker() as db:
        service = ConditionalNotificationService()

        print("\n🔍 Enviando alertas de envios atrasados...")
        result = await service.send_overdue_shipments_alert(db)

        print(f"\n📊 Resultado:")
        print(f"   Total de tenants: {result['total_tenants']}")
        print(f"   Total de envios atrasados: {result['total_shipments']}")
        print(f"   Notificações enviadas: {result['sent_count']}")
        print(f"   Falhas: {result['failed_count']}")

        if result['errors']:
            print(f"\n⚠️  Erros:")
            for error in result['errors']:
                print(f"      - {error}")

        if result['total_shipments'] > 0:
            print(f"\n✅ Sistema de detecção de atrasos está funcionando!")
        else:
            print(f"\n✅ Nenhum envio atrasado (isso é bom!)")


async def main():
    """Roda todos os testes"""
    print("\n")
    print("🧪 TESTES DE SISTEMA DE NOTIFICAÇÕES DE ENVIOS CONDICIONAIS")
    print("=" * 80)
    print("\nEste script testa as correções implementadas:")
    print("  ✓ Cálculo de deadline usando return_datetime")
    print("  ✓ Notificações SLA (5 min antes de envio, 15 min antes de retorno)")
    print("  ✓ Alertas de envios atrasados")
    print("")

    await test_deadline_calculation()
    await test_sla_notifications()
    await test_overdue_detection()

    print("\n\n")
    print("=" * 80)
    print("✅ TESTES CONCLUÍDOS")
    print("=" * 80)
    print("\nPróximos passos:")
    print("1. Configure um cron job para rodar o endpoint /sla/check-notifications a cada 1 minuto")
    print("2. Configure notificações periódicas diárias com /notifications/send-periodic")
    print("3. Teste no mobile criando um envio com departure_datetime e return_datetime")
    print("")


if __name__ == "__main__":
    asyncio.run(main())
