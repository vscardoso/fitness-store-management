"""
Service para envios condicionais com regras de negócio.
"""
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from decimal import Decimal

from app.repositories.conditional_shipment import (
    ConditionalShipmentRepository,
    ConditionalShipmentItemRepository,
)
from app.repositories.product_repository import ProductRepository
from app.repositories.customer_repository import CustomerRepository
from app.models.conditional_shipment import ConditionalShipment
from app.models.sale import Sale, SaleItem, SaleStatus, PaymentMethod
from app.services.fifo_service import FIFOService
from app.schemas.conditional_shipment import (
    ConditionalShipmentCreate,
    ConditionalShipmentUpdate,
    ProcessReturnRequest,
    ConditionalShipmentItemUpdate,
)
from app.services.notification_scheduler import NotificationScheduler


class ConditionalShipmentService:
    """Service com regras de negócio para envios condicionais"""
    
    def __init__(self):
        self.shipment_repo = ConditionalShipmentRepository()
        self.item_repo = ConditionalShipmentItemRepository()
    
    async def create_shipment(
        self,
        db: AsyncSession,
        tenant_id: int,
        user_id: int,
        shipment_data: ConditionalShipmentCreate,
    ) -> ConditionalShipment:
        """
        Cria envio condicional e reserva estoque.
        
        Args:
            db: Sessão do banco
            tenant_id: ID do tenant
            user_id: ID do usuário que está criando
            shipment_data: Dados do envio
            
        Returns:
            ConditionalShipment criado
            
        Raises:
            ValueError: Se não houver estoque suficiente
        """
        # Instanciar services
        fifo_service = FIFOService(db)
        product_repo = ProductRepository(db)

        # 1. Validar estoque disponível via FIFO (fonte de verdade)
        for item in shipment_data.items:
            availability = await fifo_service.check_availability(
                product_id=item.product_id,
                quantity=item.quantity_sent,
                variant_id=item.variant_id,
                tenant_id=tenant_id,
            )
            if not availability["available"]:
                product = await product_repo.get(db, item.product_id, tenant_id=tenant_id)
                product_name = product.name if product else str(item.product_id)
                raise ValueError(
                    f"Estoque insuficiente para {product_name}. "
                    f"Disponível: {availability['total_available']}, Solicitado: {item.quantity_sent}"
                )

        # 2. Criar shipment (status PENDING)
        shipment = await self.shipment_repo.create_with_items(
            db, tenant_id, shipment_data
        )

        # 3. Reservar estoque via FIFO — decrementa entry_items e armazena fontes para reverter
        for db_item in shipment.items:
            try:
                fifo_sources = await fifo_service.process_sale(
                    product_id=db_item.product_id,
                    quantity=db_item.quantity_sent,
                    variant_id=db_item.variant_id,
                    tenant_id=tenant_id,
                )
                # Armazenar fontes FIFO para permitir reversão exata ao devolver
                db_item.fifo_sources = {"sources": fifo_sources}
            except ValueError as e:
                await db.rollback()
                raise ValueError(f"Erro ao reservar estoque via FIFO: {str(e)}")

        await db.commit()
        await db.refresh(shipment)

        # 4. NOVO: Criar notificações automáticas se departure_datetime ou return_datetime foram fornecidos
        if shipment.departure_datetime or shipment.return_datetime:
            await self._schedule_notifications(db, shipment)

        return shipment
    
    async def process_return(
        self,
        db: AsyncSession,
        shipment_id: int,
        tenant_id: int,
        user_id: int,
        return_data: ProcessReturnRequest,
    ) -> ConditionalShipment:
        """
        Processa devolução de itens e opcionalmente cria venda.
        
        Args:
            db: Sessão do banco
            shipment_id: ID do envio
            tenant_id: ID do tenant
            user_id: ID do usuário processando
            return_data: Dados da devolução
            
        Returns:
            ConditionalShipment atualizado
            
        Raises:
            ValueError: Se dados inválidos ou shipment não encontrado
        """
        # 1. Buscar shipment
        shipment = await self.shipment_repo.get_with_items(db, shipment_id, tenant_id)
        if not shipment:
            raise ValueError(f"Envio {shipment_id} não encontrado")
        
        # Importar enum
        from app.models.enums import ShipmentStatus

        # Validar status
        if shipment.status != ShipmentStatus.SENT.value:
            # User-friendly error messages
            if shipment.status == ShipmentStatus.PENDING.value:
                raise ValueError(
                    "Este envio ainda não foi enviado ao cliente. "
                    "Use a ação 'Marcar como Enviado' antes de processar a devolução."
                )
            elif ShipmentStatus.is_final_status(shipment.status):
                raise ValueError("Este envio já foi finalizado e não pode ser modificado.")
            else:
                raise ValueError(f"Status atual '{shipment.status}' não permite processamento de devolução.")
        
        # Instanciar service FIFO
        fifo_service = FIFOService(db)

        # 2. Atualizar itens e devolver estoque
        total_kept = 0
        total_returned = 0
        items_for_sale = []

        for item_update in return_data.items:
            # Encontrar item correspondente
            db_item = next(
                (i for i in shipment.items if i.id == item_update.id),
                None
            )
            if not db_item:
                continue

            # Validar quantidades
            total_processed = item_update.quantity_kept + item_update.quantity_returned
            if total_processed > db_item.quantity_sent:
                raise ValueError(
                    f"Item {db_item.id}: total processado ({total_processed}) "
                    f"excede quantidade enviada ({db_item.quantity_sent})"
                )
            
            # Atualizar item
            await self.item_repo.update_item(
                db,
                item_id=db_item.id,
                quantity_kept=item_update.quantity_kept,
                quantity_returned=item_update.quantity_returned,
                status=item_update.status,
                notes=item_update.notes,
            )
            
            # Devolver ao estoque os itens retornados via FIFO (restaura entry_items)
            if item_update.quantity_returned > 0 and db_item.fifo_sources:
                # Reverter apenas a proporção devolvida das fontes FIFO originais
                all_sources = db_item.fifo_sources.get("sources", [])
                returned_qty_remaining = item_update.quantity_returned
                sources_to_reverse = []
                for src in all_sources:
                    if returned_qty_remaining <= 0:
                        break
                    qty_to_restore = min(src["quantity_taken"], returned_qty_remaining)
                    sources_to_reverse.append({**src, "quantity_taken": qty_to_restore})
                    returned_qty_remaining -= qty_to_restore
                if sources_to_reverse:
                    await fifo_service.reverse_sale(sources_to_reverse)
            
            total_kept += item_update.quantity_kept
            total_returned += item_update.quantity_returned
            
            # Preparar itens para venda
            if item_update.quantity_kept > 0:
                items_for_sale.append({
                    "product_id": db_item.product_id,
                    "variant_id": db_item.variant_id,
                    "quantity": item_update.quantity_kept,
                    "unit_price": db_item.unit_price,
                })
        
        # 3. Determinar novo status baseado no resultado
        total_sent = shipment.total_items_sent

        if total_kept == total_sent:
            # Cliente ficou com TUDO → Venda 100%
            new_status = ShipmentStatus.COMPLETED_FULL_SALE.value
        elif total_kept > 0 and total_returned > 0:
            # Cliente ficou com ALGUNS e devolveu OUTROS → Venda parcial
            new_status = ShipmentStatus.COMPLETED_PARTIAL_SALE.value
        elif total_returned == total_sent:
            # Cliente devolveu TUDO → Não vendeu nada
            new_status = ShipmentStatus.RETURNED_NO_SALE.value
        else:
            # Fallback (não deveria acontecer)
            new_status = ShipmentStatus.SENT.value
        
        shipment = await self.shipment_repo.update_status(
            db, shipment_id, tenant_id, new_status
        )
        
        # Atualizar timestamps baseado no status final
        current_time = datetime.utcnow()
        shipment.returned_at = current_time
        
        # Se foi finalizado (qualquer status COMPLETED ou RETURNED), marcar como concluído
        if ShipmentStatus.is_final_status(new_status):
            shipment.completed_at = current_time
        
        if return_data.notes:
            shipment.notes = (shipment.notes or "") + f"\n[Devolução] {return_data.notes}"
        
        await db.commit()

        # 4. Criar venda AUTOMATICAMENTE se houver itens mantidos (comprados)
        # MUDANÇA: Sempre cria venda quando houver produtos comprados, independente de create_sale
        # Isso garante que toda compra seja registrada como venda imediatamente
        sale_created = False
        if items_for_sale:
            payment_method = return_data.payment_method or PaymentMethod.PIX
            await self._create_sale_from_shipment(
                db, shipment, tenant_id, user_id, items_for_sale, payment_method
            )
            sale_created = True

        # Se o usuário pediu explicitamente para criar venda mas não há itens comprados, avisar
        if return_data.create_sale and not items_for_sale:
            raise ValueError(
                "Não é possível finalizar venda: nenhum produto foi marcado como comprado. "
                "Marque pelo menos um produto com 'Quantidade Comprada' > 0."
            )

        await db.refresh(shipment)
        return shipment
    
    async def _create_sale_from_shipment(
        self,
        db: AsyncSession,
        shipment: ConditionalShipment,
        tenant_id: int,
        user_id: int,
        items: List[dict],
        payment_method: PaymentMethod = PaymentMethod.PIX,
    ) -> Sale:
        """
        Cria venda automaticamente a partir dos itens mantidos.
        
        Args:
            db: Sessão do banco
            shipment: ConditionalShipment
            tenant_id: ID do tenant
            user_id: ID do usuário
            items: Lista de itens {product_id, quantity, unit_price}
            
        Returns:
            Sale criada
        """
        # Calcular total
        total_amount = sum(
            item["quantity"] * float(item["unit_price"])
            for item in items
        )
        
        # Criar venda (estoque já foi decrementado no create_shipment via FIFO)
        import secrets
        from app.core.timezone import now_brazil
        _ts = now_brazil().strftime('%Y%m%d%H%M%S%f')[:17]
        _sfx = secrets.token_hex(2)[:3].upper()
        sale_number = f"VENDA-CS-{_ts}-{_sfx}"

        sale = Sale(
            tenant_id=tenant_id,
            customer_id=shipment.customer_id,
            seller_id=user_id,
            sale_number=sale_number,
            status=SaleStatus.COMPLETED.value,
            payment_method=payment_method.value if hasattr(payment_method, 'value') else payment_method,
            subtotal=Decimal(str(total_amount)),
            discount_amount=Decimal(0),
            tax_amount=Decimal(0),
            total_amount=Decimal(str(total_amount)),
            loyalty_points_earned=0,
            notes=f"Venda automática - Envio Condicional #{shipment.id}",
            is_active=True,
        )

        db.add(sale)
        await db.flush()

        # Criar items da venda — FIFO já foi processado no create_shipment
        for item_data in items:
            item_subtotal = Decimal(str(item_data["quantity"])) * Decimal(str(float(item_data["unit_price"])))
            sale_item = SaleItem(
                sale_id=sale.id,
                product_id=item_data["product_id"],
                variant_id=item_data.get("variant_id"),
                quantity=item_data["quantity"],
                unit_price=float(item_data["unit_price"]),
                unit_cost=0.0,
                subtotal=float(item_subtotal),
                discount_amount=0.0,
                tenant_id=tenant_id,
                is_active=True,
            )
            db.add(sale_item)

        await db.commit()
        return sale
    
    async def mark_as_sent(
        self,
        db: AsyncSession,
        shipment_id: int,
        tenant_id: int,
        user_id: int,
        carrier: Optional[str] = None,
        tracking_code: Optional[str] = None,
        sent_notes: Optional[str] = None,
    ) -> ConditionalShipment:
        """
        Marca envio como SENT (saiu da loja).

        Args:
            db: Sessão do banco
            shipment_id: ID do envio
            tenant_id: ID do tenant
            user_id: ID do usuário
            carrier: Transportadora (opcional)
            tracking_code: Código de rastreio (opcional)
            sent_notes: Observações do envio (opcional)

        Returns:
            ConditionalShipment atualizado

        Raises:
            ValueError: Se envio não está PENDING
        """
        shipment = await self.shipment_repo.get_with_items(db, shipment_id, tenant_id)
        if not shipment:
            raise ValueError(f"Envio {shipment_id} não encontrado")

        if shipment.status != "PENDING":
            if shipment.status == "SENT":
                raise ValueError("Este envio já foi marcado como enviado anteriormente.")
            elif shipment.status == "COMPLETED":
                raise ValueError("Este envio já foi concluído.")
            elif shipment.status == "CANCELLED":
                raise ValueError("Este envio foi cancelado e não pode ser enviado.")
            else:
                raise ValueError(
                    f"Não é possível marcar como enviado. "
                    f"Status atual: {shipment.status}. Apenas envios PENDING podem ser enviados."
                )

        # CORRIGIDO: Calcular deadline usando return_datetime se disponível
        deadline_datetime = None

        # Prioridade 1: Usar return_datetime se foi fornecido (campo moderno)
        if shipment.return_datetime:
            deadline_datetime = shipment.return_datetime
        # Prioridade 2: Calcular com base em departure_datetime + deadline_value
        elif shipment.departure_datetime and shipment.deadline_value:
            if shipment.deadline_type == "days":
                deadline_datetime = shipment.departure_datetime + timedelta(days=shipment.deadline_value)
            elif shipment.deadline_type == "hours":
                deadline_datetime = shipment.departure_datetime + timedelta(hours=shipment.deadline_value)
        # Fallback: Usar método legacy (baseado em sent_at)
        else:
            if shipment.deadline_type == "days":
                deadline_datetime = datetime.utcnow() + timedelta(days=shipment.deadline_value)
            elif shipment.deadline_type == "hours":
                deadline_datetime = datetime.utcnow() + timedelta(hours=shipment.deadline_value)

        # Atualizar shipment
        shipment.status = "SENT"
        shipment.sent_at = datetime.utcnow()
        shipment.deadline = deadline_datetime

        # Se não tinha departure_datetime, definir como agora
        if not shipment.departure_datetime:
            shipment.departure_datetime = datetime.utcnow()

        # Adicionar informações de envio às notas
        notes_parts = []
        if carrier:
            notes_parts.append(f"Transportadora: {carrier}")
        if tracking_code:
            notes_parts.append(f"Rastreio: {tracking_code}")
        if sent_notes:
            notes_parts.append(sent_notes)

        if notes_parts:
            # Converter UTC para BRT (GMT-3)
            brt_time = datetime.utcnow() - timedelta(hours=3)
            shipment.notes = (shipment.notes or "") + f"\n[Enviado em {brt_time.strftime('%d/%m/%Y %H:%M')}]\n" + "\n".join(notes_parts)

        await db.commit()
        await db.refresh(shipment)

        # NOVO: Criar/atualizar notificações após marcar como enviado
        if shipment.departure_datetime or shipment.return_datetime:
            await self._schedule_notifications(db, shipment)

        return shipment

    async def _schedule_notifications(self, db: AsyncSession, shipment: ConditionalShipment):
        """
        Cria notificações automáticas baseadas em departure_datetime e return_datetime.

        Este método garante que o sistema notifique o usuário:
        - 5 minutos antes da saída (departure_datetime)
        - 15 minutos antes do retorno previsto (return_datetime)

        As notificações são enviadas pelo ConditionalNotificationService via endpoint de cron.
        """
        # Importar aqui para evitar import circular
        from app.services.conditional_notification_service import ConditionalNotificationService

        notification_service = ConditionalNotificationService()

        # As notificações são checadas pelo endpoint /sla/check-notifications
        # que roda a cada 1 minuto via cron
        # Não precisamos criar registros aqui, apenas garantir que as datas estão corretas
        # O check_and_send_sla_notifications() vai buscar os envios e enviar notificações

        # Log para debug
        import logging
        logger = logging.getLogger(__name__)
        logger.info(
            f"Notificações agendadas para envio #{shipment.id}: "
            f"departure={shipment.departure_datetime}, return={shipment.return_datetime}"
        )

    async def cancel_shipment(
        self,
        db: AsyncSession,
        shipment_id: int,
        tenant_id: int,
        user_id: int,
        reason: str,
    ) -> ConditionalShipment:
        """
        Cancela envio e devolve estoque.
        
        Args:
            db: Sessão do banco
            shipment_id: ID do envio
            tenant_id: ID do tenant
            user_id: ID do usuário
            reason: Motivo do cancelamento
            
        Returns:
            ConditionalShipment cancelado
        """
        shipment = await self.shipment_repo.get_with_items(db, shipment_id, tenant_id)
        if not shipment:
            raise ValueError(f"Envio {shipment_id} não encontrado")
        
        if shipment.status not in ["PENDING", "SENT"]:
            if shipment.status == "COMPLETED":
                raise ValueError(
                    "Este envio já foi concluído com venda gerada. "
                    "Não é possível cancelar. Entre em contato com o suporte se necessário."
                )
            elif shipment.status == "CANCELLED":
                raise ValueError("Este envio já foi cancelado anteriormente.")
            elif shipment.status == "PARTIAL_RETURN":
                raise ValueError(
                    "Este envio já teve devolução parcial processada. "
                    "Não é possível cancelar neste estágio. Finalize a devolução normalmente."
                )
            else:
                raise ValueError(f"Status '{shipment.status}' não permite cancelamento.")
        
        # Instanciar repository
        inventory_repo = InventoryRepository(db)
        
        # Devolver estoque de todos os itens não processados
        for item in shipment.items:
            quantity_to_return = item.quantity_sent - item.quantity_kept - item.quantity_returned

            if quantity_to_return > 0:
                await inventory_repo.add_stock(
                    product_id=item.product_id,
                    quantity=quantity_to_return,
                    movement_type=MovementType.RETURN,
                    notes=f"Cancelamento envio #{shipment.id}: {reason}" + (f" - variante #{item.variant_id}" if item.variant_id else ""),
                    reference_id=f"CS-{shipment.id}-CANCEL",
                    tenant_id=tenant_id,
                )
        
        # Atualizar status
        shipment = await self.shipment_repo.update_status(
            db, shipment_id, tenant_id, "CANCELLED"
        )
        shipment.notes = (shipment.notes or "") + f"\n[Cancelado] {reason}"
        await db.commit()
        
        return shipment
    
    async def check_overdue_shipments(
        self,
        db: AsyncSession,
        tenant_id: int,
    ) -> List[ConditionalShipment]:
        """
        Verifica e atualiza envios atrasados.
        
        Args:
            db: Sessão do banco
            tenant_id: ID do tenant
            
        Returns:
            Lista de envios atrasados
        """
        overdue = await self.shipment_repo.get_overdue_shipments(db, tenant_id)
        
        # Atualizar status para OVERDUE
        for shipment in overdue:
            if shipment.status != "OVERDUE":
                shipment.status = "OVERDUE"
        
        if overdue:
            await db.commit()
        
        return overdue
    
    async def get_shipment_with_details(
        self,
        db: AsyncSession,
        shipment_id: int,
        tenant_id: int,
    ) -> Optional[dict]:
        """
        Retorna envio com dados completos (customer, products).
        
        Args:
            db: Sessão do banco
            shipment_id: ID do envio
            tenant_id: ID do tenant
            
        Returns:
            Dict com shipment e dados relacionados
        """
        shipment = await self.shipment_repo.get_with_items(db, shipment_id, tenant_id)
        if not shipment:
            return None
        
        # Instanciar repositories
        customer_repo = CustomerRepository(db)
        product_repo = ProductRepository(db)
        
        # Buscar customer
        customer = await customer_repo.get(db, shipment.customer_id, tenant_id=tenant_id)
        
        # Buscar produtos e variantes
        items_with_products = []
        for item in shipment.items:
            product = await product_repo.get(db, item.product_id, tenant_id=tenant_id)
            # Carregar variante se existir
            variant = None
            if item.variant_id:
                from app.repositories.product_variant_repository import ProductVariantRepository
                variant_repo = ProductVariantRepository()
                variant = await variant_repo.get(db, item.variant_id)
            items_with_products.append({
                "item": item,
                "product": product,
                "variant": variant,
            })
        
        return {
            "shipment": shipment,
            "customer": customer,
            "items": items_with_products,
        }
