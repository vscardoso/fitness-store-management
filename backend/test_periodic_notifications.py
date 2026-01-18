"""
Script de teste para o sistema de notificações periódicas.
Testa os novos métodos sem precisar rodar cron ou scheduler.

Uso:
    python test_periodic_notifications.py
"""
import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Adicionar o diretório do backend ao path
sys.path.insert(0, '.')

from app.services.conditional_notification_service import ConditionalNotificationService
from app.core.config import settings


async def test_pending_shipments_reminder():
    """Testa envio de lembretes de envios pendentes"""
    print("\n" + "="*60)
    print("TESTE: send_pending_shipments_reminder()")
    print("="*60)

    # Criar engine e session
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_maker() as db:
        service = ConditionalNotificationService()
        result = await service.send_pending_shipments_reminder(db)

        print("\n📊 RESULTADOS:")
        print(f"  - Tenants com envios pendentes: {result['total_tenants']}")
        print(f"  - Total de envios pendentes: {result['total_shipments']}")
        print(f"  - Notificações enviadas: {result['sent_count']}")
        print(f"  - Notificações falhadas: {result['failed_count']}")

        if result['errors']:
            print(f"\n❌ ERROS ({len(result['errors'])}):")
            for error in result['errors']:
                print(f"  - {error}")
        else:
            print("\n✅ Nenhum erro!")

        if result['total_shipments'] == 0:
            print("\nℹ️  Não há envios pendentes para notificar.")
        elif result['sent_count'] > 0:
            print(f"\n✅ {result['sent_count']} notificação(ões) enviada(s) com sucesso!")

    await engine.dispose()
    return result


async def test_overdue_shipments_alert():
    """Testa envio de alertas de envios atrasados"""
    print("\n" + "="*60)
    print("TESTE: send_overdue_shipments_alert()")
    print("="*60)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_maker() as db:
        service = ConditionalNotificationService()
        result = await service.send_overdue_shipments_alert(db)

        print("\n📊 RESULTADOS:")
        print(f"  - Tenants com envios atrasados: {result['total_tenants']}")
        print(f"  - Total de envios atrasados: {result['total_shipments']}")
        print(f"  - Alertas enviados: {result['sent_count']}")
        print(f"  - Alertas falhados: {result['failed_count']}")

        if result['errors']:
            print(f"\n❌ ERROS ({len(result['errors'])}):")
            for error in result['errors']:
                print(f"  - {error}")
        else:
            print("\n✅ Nenhum erro!")

        if result['total_shipments'] == 0:
            print("\nℹ️  Não há envios atrasados para alertar.")
        elif result['sent_count'] > 0:
            print(f"\n🚨 {result['sent_count']} alerta(s) crítico(s) enviado(s)!")

    await engine.dispose()
    return result


async def test_full_periodic_flow():
    """Testa o fluxo completo (pendentes + atrasados)"""
    print("\n" + "="*60)
    print("TESTE: FLUXO COMPLETO DE NOTIFICAÇÕES PERIÓDICAS")
    print("="*60)

    pending_result = await test_pending_shipments_reminder()
    overdue_result = await test_overdue_shipments_alert()

    # Consolidar estatísticas
    total_sent = pending_result['sent_count'] + overdue_result['sent_count']
    total_failed = pending_result['failed_count'] + overdue_result['failed_count']
    all_errors = pending_result.get('errors', []) + overdue_result.get('errors', [])

    print("\n" + "="*60)
    print("RESUMO CONSOLIDADO")
    print("="*60)
    print(f"\n📧 Notificações enviadas: {total_sent}")
    print(f"❌ Notificações falhadas: {total_failed}")
    print(f"📋 Total de erros: {len(all_errors)}")

    success = total_sent > 0 and total_failed == 0
    print(f"\n{'✅ SUCESSO' if success else '⚠️  SUCESSO PARCIAL' if total_sent > 0 else '❌ FALHA'}")

    return {
        'pending_notifications': pending_result,
        'overdue_notifications': overdue_result,
        'summary': {
            'total_notifications_sent': total_sent,
            'total_notifications_failed': total_failed,
            'total_errors': len(all_errors),
            'success': success
        }
    }


async def check_database_state():
    """Verifica estado atual do banco de dados"""
    print("\n" + "="*60)
    print("VERIFICANDO ESTADO DO BANCO DE DADOS")
    print("="*60)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_maker() as db:
        from sqlalchemy import select, func
        from app.models.conditional_shipment import ConditionalShipment
        from app.models.user import User
        from app.models.notification import PushToken

        # Contar envios por status
        result = await db.execute(
            select(
                ConditionalShipment.status,
                func.count(ConditionalShipment.id)
            )
            .where(ConditionalShipment.is_active == True)
            .group_by(ConditionalShipment.status)
        )
        shipments_by_status = result.all()

        print("\n📦 ENVIOS CONDICIONAIS:")
        if shipments_by_status:
            for status, count in shipments_by_status:
                print(f"  - {status}: {count}")
        else:
            print("  - Nenhum envio encontrado")

        # Contar usuários por role
        result = await db.execute(
            select(User.role, func.count(User.id))
            .where(User.is_active == True)
            .group_by(User.role)
        )
        users_by_role = result.all()

        print("\n👥 USUÁRIOS ATIVOS:")
        if users_by_role:
            for role, count in users_by_role:
                print(f"  - {role}: {count}")
        else:
            print("  - Nenhum usuário encontrado")

        # Contar tokens de push
        result = await db.execute(
            select(func.count(PushToken.id))
        )
        token_count = result.scalar()

        print("\n📱 TOKENS DE PUSH REGISTRADOS:")
        print(f"  - Total: {token_count}")

        if token_count == 0:
            print("\n⚠️  AVISO: Nenhum token registrado! Notificações não serão entregues.")
            print("   Solução: Abra o app mobile e permita notificações.")

    await engine.dispose()


async def main():
    """Função principal"""
    print("\n" + "="*60)
    print("TESTE DO SISTEMA DE NOTIFICAÇÕES PERIÓDICAS")
    print("="*60)

    # Verificar estado do banco
    await check_database_state()

    # Menu interativo
    print("\n\nESCOLHA UM TESTE:")
    print("1. Testar lembretes de envios pendentes")
    print("2. Testar alertas de envios atrasados")
    print("3. Testar fluxo completo (pendentes + atrasados)")
    print("4. Sair")

    choice = input("\nOpção (1-4): ").strip()

    if choice == "1":
        await test_pending_shipments_reminder()
    elif choice == "2":
        await test_overdue_shipments_alert()
    elif choice == "3":
        await test_full_periodic_flow()
    elif choice == "4":
        print("\n👋 Até logo!")
        return
    else:
        print("\n❌ Opção inválida!")

    print("\n" + "="*60)
    print("TESTE CONCLUÍDO")
    print("="*60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Teste interrompido pelo usuário.")
    except Exception as e:
        print(f"\n\n❌ ERRO: {e}")
        import traceback
        traceback.print_exc()
