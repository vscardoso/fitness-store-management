"""
Serviço de notificações agendadas para envios condicionais
"""
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.conditional_shipment import ConditionalShipment
from app.models.enums import ShipmentStatus
from app.services.notification_service import NotificationService
from app.repositories.conditional_shipment import ConditionalShipmentRepository


class ConditionalNotificationService:
    """Gerencia notificações automáticas de SLA"""

    def __init__(self):
        self.notification_service = NotificationService()
        self.shipment_repo = ConditionalShipmentRepository()

    async def check_and_send_sla_notifications(self, db: AsyncSession) -> dict:
        """
        Verifica SLAs e envia notificações se necessário.
        Rodar a cada 1 minuto via cron/scheduler.

        IMPORTANTE: Este método usa departure_datetime e return_datetime (ou deadline)
        para determinar quando enviar notificações.
        """
        now = datetime.utcnow()
        sent_departure = 0
        sent_return = 0

        # Buscar todos envios ativos PENDING (para SLA de envio)
        result = await db.execute(
            select(ConditionalShipment).where(
                ConditionalShipment.status == 'PENDING',
                ConditionalShipment.is_active == True,
                ConditionalShipment.departure_datetime.isnot(None)
            )
        )
        pending_shipments = result.scalars().all()

        for shipment in pending_shipments:
            # Verificar se falta 5 minutos para SLA de envio
            time_until_departure = shipment.departure_datetime - now
            if timedelta(minutes=4) <= time_until_departure <= timedelta(minutes=6):
                await self._send_departure_notification(db, shipment)
                sent_departure += 1

        # Buscar todos envios SENT (para SLA de retorno)
        # Só envia para SENT (não para status finalizados)
        result = await db.execute(
            select(ConditionalShipment).where(
                ConditionalShipment.status == ShipmentStatus.SENT.value,
                ConditionalShipment.is_active == True,
                ConditionalShipment.deadline.isnot(None)
            )
        )
        sent_shipments = result.scalars().all()

        for shipment in sent_shipments:
            # CORRIGIDO: Usar deadline (que agora é baseado em return_datetime)
            # Prioridade: return_datetime > deadline (para compatibilidade com dados antigos)
            target_datetime = shipment.return_datetime if shipment.return_datetime else shipment.deadline

            if target_datetime:
                # Verificar se falta 15 minutos para SLA de retorno
                time_until_return = target_datetime - now
                if timedelta(minutes=14) <= time_until_return <= timedelta(minutes=16):
                    await self._send_return_notification(db, shipment)
                    sent_return += 1

        return {
            'departure_notifications': sent_departure,
            'return_notifications': sent_return,
            'checked_at': now.isoformat()
        }

    async def _send_departure_notification(self, db: AsyncSession, shipment: ConditionalShipment):
        """Notificação: 5 min antes do envio"""
        # Buscar user do tenant (admin/vendedor)
        from app.models.user import User
        from app.repositories.customer_repository import CustomerRepository

        result = await db.execute(
            select(User).where(
                User.tenant_id == shipment.tenant_id,
                User.role.in_(['ADMIN', 'SELLER']),
                User.is_active == True
            ).limit(1)
        )
        user = result.scalars().first()

        if not user:
            return

        # Buscar nome do cliente
        customer_repo = CustomerRepository(db)
        customer = await customer_repo.get(db, shipment.customer_id, tenant_id=shipment.tenant_id)
        customer_name = customer.full_name if customer else f"Cliente #{shipment.customer_id}"

        await self.notification_service.send_notification(
            db=db,
            tenant_id=shipment.tenant_id,
            user_ids=[user.id],
            title=f"⏰ Hora de Enviar - Envio #{shipment.id}",
            body=f"Envio para {customer_name} deve sair em 5 minutos!",
            data={
                'type': 'sla_departure',
                'shipment_id': shipment.id,
                'route': f'/conditional/{shipment.id}',
                'actions': ['mark_sent', 'postpone']
            }
        )

    async def _send_return_notification(self, db: AsyncSession, shipment: ConditionalShipment):
        """Notificação: 15 min antes do retorno"""
        from app.models.user import User
        from app.repositories.customer_repository import CustomerRepository

        result = await db.execute(
            select(User).where(
                User.tenant_id == shipment.tenant_id,
                User.role.in_(['ADMIN', 'SELLER']),
                User.is_active == True
            ).limit(1)
        )
        user = result.scalars().first()

        if not user:
            return

        # Buscar nome do cliente
        customer_repo = CustomerRepository(db)
        customer = await customer_repo.get(db, shipment.customer_id, tenant_id=shipment.tenant_id)
        customer_name = customer.full_name if customer else f"Cliente #{shipment.customer_id}"

        await self.notification_service.send_notification(
            db=db,
            tenant_id=shipment.tenant_id,
            user_ids=[user.id],
            title=f"🔔 Prazo de Retorno - Envio #{shipment.id}",
            body=f"Retorno de {customer_name} vence em 15 minutos! Confirme devolução.",
            data={
                'type': 'sla_return',
                'shipment_id': shipment.id,
                'route': f'/conditional/{shipment.id}',
                'actions': ['process_return', 'postpone']
            }
        )

    async def postpone_departure(
        self, db: AsyncSession, shipment_id: int, tenant_id: int, minutes: int = 30
    ) -> ConditionalShipment:
        """Protelar SLA de envio"""
        shipment = await self.shipment_repo.get(db, shipment_id, tenant_id=tenant_id)
        if not shipment or not shipment.departure_datetime:
            raise ValueError("Envio não encontrado ou sem SLA de envio")

        shipment.departure_datetime = shipment.departure_datetime + timedelta(minutes=minutes)
        await db.commit()
        await db.refresh(shipment)
        return shipment

    async def postpone_return(
        self, db: AsyncSession, shipment_id: int, tenant_id: int, minutes: int = 30
    ) -> ConditionalShipment:
        """Protelar SLA de retorno"""
        shipment = await self.shipment_repo.get(db, shipment_id, tenant_id=tenant_id)
        if not shipment or not shipment.return_datetime:
            raise ValueError("Envio não encontrado ou sem SLA de retorno")

        shipment.return_datetime = shipment.return_datetime + timedelta(minutes=minutes)
        await db.commit()
        await db.refresh(shipment)
        return shipment

    async def send_pending_shipments_reminder(self, db: AsyncSession) -> dict:
        """
        Envia notificação de lembrete para todos envios pendentes.
        Agrupa por tenant e envia um resumo consolidado.

        Returns:
            Estatísticas de envio: total_tenants, total_shipments, sent_count, failed_count
        """
        from collections import defaultdict

        # Buscar todos envios PENDING de todos os tenants
        result = await db.execute(
            select(ConditionalShipment).where(
                ConditionalShipment.status == 'PENDING',
                ConditionalShipment.is_active == True
            )
        )
        pending_shipments = result.scalars().all()

        if not pending_shipments:
            return {
                'total_tenants': 0,
                'total_shipments': 0,
                'sent_count': 0,
                'failed_count': 0,
                'errors': []
            }

        # Agrupar por tenant
        shipments_by_tenant = defaultdict(list)
        for shipment in pending_shipments:
            shipments_by_tenant[shipment.tenant_id].append(shipment)

        sent_count = 0
        failed_count = 0
        errors = []

        # Enviar notificação para cada tenant
        for tenant_id, shipments in shipments_by_tenant.items():
            try:
                # Buscar usuários do tenant (admin/vendedor)
                from app.models.user import User
                user_result = await db.execute(
                    select(User).where(
                        User.tenant_id == tenant_id,
                        User.role.in_(['ADMIN', 'SELLER']),
                        User.is_active == True
                    )
                )
                users = user_result.scalars().all()

                if not users:
                    failed_count += 1
                    errors.append(f"Tenant {tenant_id}: Nenhum usuário encontrado")
                    continue

                user_ids = [user.id for user in users]
                total = len(shipments)

                # Preparar lista de clientes para o body
                customer_names = []
                for shipment in shipments[:3]:  # Mostrar até 3 clientes
                    if hasattr(shipment, 'customer') and shipment.customer:
                        customer_names.append(shipment.customer.full_name)

                body_text = f"Total: {total} envio(s) aguardando processamento"
                if customer_names:
                    body_text += f"\n• {', '.join(customer_names)}"
                    if total > 3:
                        body_text += f" e mais {total - 3}"

                # Enviar notificação
                notification_result = await self.notification_service.send_notification(
                    db=db,
                    tenant_id=tenant_id,
                    user_ids=user_ids,
                    title=f"📦 {total} Envio(s) Pendente(s)",
                    body=body_text,
                    data={
                        'type': 'pending_shipments_reminder',
                        'total_shipments': total,
                        'route': '/conditional',
                        'priority': 'normal'
                    }
                )

                if notification_result.get('success'):
                    sent_count += 1
                else:
                    failed_count += 1
                    errors.extend(notification_result.get('errors', []))

            except Exception as e:
                failed_count += 1
                errors.append(f"Tenant {tenant_id}: {str(e)}")

        return {
            'total_tenants': len(shipments_by_tenant),
            'total_shipments': len(pending_shipments),
            'sent_count': sent_count,
            'failed_count': failed_count,
            'errors': errors
        }

    async def send_overdue_shipments_alert(self, db: AsyncSession) -> dict:
        """
        Envia notificação CRÍTICA para todos envios atrasados.
        Agrupa por tenant e inclui lista de clientes afetados.

        IMPORTANTE: Usa deadline (que agora é calculado com base em return_datetime)

        Returns:
            Estatísticas de envio: total_tenants, total_shipments, sent_count, failed_count
        """
        from collections import defaultdict

        now = datetime.utcnow()

        # Buscar envios SENT com deadline vencido
        # Só considera SENT porque status finais já foram processados
        result = await db.execute(
            select(ConditionalShipment).where(
                ConditionalShipment.is_active == True,
                ConditionalShipment.deadline < now,
                ConditionalShipment.status == ShipmentStatus.SENT.value
            )
        )
        overdue_shipments = result.scalars().all()

        if not overdue_shipments:
            return {
                'total_tenants': 0,
                'total_shipments': 0,
                'sent_count': 0,
                'failed_count': 0,
                'errors': []
            }

        # Agrupar por tenant
        shipments_by_tenant = defaultdict(list)
        for shipment in overdue_shipments:
            shipments_by_tenant[shipment.tenant_id].append(shipment)

        sent_count = 0
        failed_count = 0
        errors = []

        # Enviar notificação para cada tenant
        for tenant_id, shipments in shipments_by_tenant.items():
            try:
                # Buscar usuários do tenant (admin/vendedor)
                from app.models.user import User
                user_result = await db.execute(
                    select(User).where(
                        User.tenant_id == tenant_id,
                        User.role.in_(['ADMIN', 'SELLER']),
                        User.is_active == True
                    )
                )
                users = user_result.scalars().all()

                if not users:
                    failed_count += 1
                    errors.append(f"Tenant {tenant_id}: Nenhum usuário encontrado")
                    continue

                user_ids = [user.id for user in users]
                total = len(shipments)

                # Preparar lista de clientes afetados
                customer_list = []
                from app.repositories.customer_repository import CustomerRepository
                customer_repo = CustomerRepository(db)

                for shipment in shipments[:5]:  # Mostrar até 5 clientes
                    customer = await customer_repo.get(db, shipment.customer_id, tenant_id=tenant_id)
                    if customer:
                        days_overdue = (now - shipment.deadline).days
                        customer_list.append(f"{customer.full_name} ({days_overdue}d atrasado)")

                body_text = f"⚠️ URGENTE: {total} envio(s) com prazo vencido!"
                if customer_list:
                    body_text += f"\n\nClientes:\n• " + "\n• ".join(customer_list)
                    if total > 5:
                        body_text += f"\n• ... e mais {total - 5}"

                # Enviar notificação CRÍTICA
                notification_result = await self.notification_service.send_notification(
                    db=db,
                    tenant_id=tenant_id,
                    user_ids=user_ids,
                    title=f"🚨 {total} Envio(s) Atrasado(s)!",
                    body=body_text,
                    data={
                        'type': 'overdue_shipments_alert',
                        'total_shipments': total,
                        'customers': [s.customer_id for s in shipments],
                        'route': '/conditional?filter=overdue',
                        'priority': 'critical'
                    }
                )

                if notification_result.get('success'):
                    sent_count += 1
                else:
                    failed_count += 1
                    errors.extend(notification_result.get('errors', []))

            except Exception as e:
                failed_count += 1
                errors.append(f"Tenant {tenant_id}: {str(e)}")

        return {
            'total_tenants': len(shipments_by_tenant),
            'total_shipments': len(overdue_shipments),
            'sent_count': sent_count,
            'failed_count': failed_count,
            'errors': errors
        }

    async def send_missed_departure_alert(self, db: AsyncSession) -> dict:
        """
        Envia notificação CRÍTICA para envios PENDENTES que perderam o SLA de envio.

        Um envio pendente "perdeu o SLA" quando:
        - Status é PENDING
        - departure_datetime foi definido
        - departure_datetime já passou (está no passado)

        Returns:
            Estatísticas de envio: total_tenants, total_shipments, sent_count, failed_count
        """
        from collections import defaultdict

        now = datetime.utcnow()

        # Buscar envios PENDING com SLA de envio vencido
        result = await db.execute(
            select(ConditionalShipment).where(
                ConditionalShipment.is_active == True,
                ConditionalShipment.status == 'PENDING',
                ConditionalShipment.departure_datetime.isnot(None),
                ConditionalShipment.departure_datetime < now
            )
        )
        missed_shipments = result.scalars().all()

        if not missed_shipments:
            return {
                'total_tenants': 0,
                'total_shipments': 0,
                'sent_count': 0,
                'failed_count': 0,
                'errors': []
            }

        # Agrupar por tenant
        shipments_by_tenant = defaultdict(list)
        for shipment in missed_shipments:
            shipments_by_tenant[shipment.tenant_id].append(shipment)

        sent_count = 0
        failed_count = 0
        errors = []

        # Enviar notificação para cada tenant
        for tenant_id, shipments in shipments_by_tenant.items():
            try:
                # Buscar usuários do tenant (admin/vendedor)
                from app.models.user import User
                user_result = await db.execute(
                    select(User).where(
                        User.tenant_id == tenant_id,
                        User.role.in_(['ADMIN', 'SELLER']),
                        User.is_active == True
                    )
                )
                users = user_result.scalars().all()

                if not users:
                    failed_count += 1
                    errors.append(f"Tenant {tenant_id}: Nenhum usuário encontrado")
                    continue

                user_ids = [user.id for user in users]
                total = len(shipments)

                # Preparar lista de envios atrasados
                shipment_list = []
                from app.repositories.customer_repository import CustomerRepository
                customer_repo = CustomerRepository(db)

                for shipment in shipments[:5]:  # Mostrar até 5 envios
                    customer = await customer_repo.get(db, shipment.customer_id, tenant_id=tenant_id)
                    if customer:
                        hours_late = int((now - shipment.departure_datetime).total_seconds() / 3600)
                        if hours_late < 1:
                            time_late = f"{int((now - shipment.departure_datetime).total_seconds() / 60)}min"
                        else:
                            time_late = f"{hours_late}h"
                        shipment_list.append(f"#{shipment.id} {customer.full_name} ({time_late} atrasado)")

                body_text = f"ATENCAO: {total} envio(s) pendente(s) passou(ram) do horario programado!"
                if shipment_list:
                    body_text += f"\n\nEnvios atrasados:\n• " + "\n• ".join(shipment_list)
                    if total > 5:
                        body_text += f"\n• ... e mais {total - 5}"

                # Enviar notificação CRÍTICA
                notification_result = await self.notification_service.send_notification(
                    db=db,
                    tenant_id=tenant_id,
                    user_ids=user_ids,
                    title=f"ALERTA: {total} Envio(s) Nao Enviado(s)!",
                    body=body_text,
                    data={
                        'type': 'missed_departure_alert',
                        'total_shipments': total,
                        'shipment_ids': [s.id for s in shipments],
                        'route': '/conditional?filter=pending',
                        'priority': 'critical'
                    }
                )

                if notification_result.get('success'):
                    sent_count += 1
                else:
                    failed_count += 1
                    errors.extend(notification_result.get('errors', []))

            except Exception as e:
                failed_count += 1
                errors.append(f"Tenant {tenant_id}: {str(e)}")

        return {
            'total_tenants': len(shipments_by_tenant),
            'total_shipments': len(missed_shipments),
            'sent_count': sent_count,
            'failed_count': failed_count,
            'errors': errors
        }
