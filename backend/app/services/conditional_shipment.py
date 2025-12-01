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
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.customer_repository import CustomerRepository
from app.models.conditional_shipment import ConditionalShipment
from app.models.sale import Sale, SaleItem, SaleStatus, PaymentMethod
from app.schemas.conditional_shipment import (
    ConditionalShipmentCreate,
    ConditionalShipmentUpdate,
    ProcessReturnRequest,
    ConditionalShipmentItemUpdate,
)


class ConditionalShipmentService:
    """Service com regras de negócio para envios condicionais"""
    
    def __init__(self):
        self.shipment_repo = ConditionalShipmentRepository()
        self.item_repo = ConditionalShipmentItemRepository()
        self.inventory_repo = InventoryRepository()
        self.product_repo = ProductRepository()
        self.customer_repo = CustomerRepository()
    
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
        # 1. Validar estoque disponível para todos os itens
        for item in shipment_data.items:
            inventory = await self.inventory_repo.get_by_product(
                db, item.product_id, tenant_id
            )
            
            if not inventory:
                product = await self.product_repo.get(db, item.product_id, tenant_id=tenant_id)
                raise ValueError(f"Produto {product.name if product else item.product_id} sem registro de estoque")
            
            if inventory.quantity < item.quantity_sent:
                product = await self.product_repo.get(db, item.product_id, tenant_id=tenant_id)
                raise ValueError(
                    f"Estoque insuficiente para {product.name if product else item.product_id}. "
                    f"Disponível: {inventory.quantity}, Solicitado: {item.quantity_sent}"
                )
        
        # 2. Criar shipment
        shipment = await self.shipment_repo.create_with_items(
            db, tenant_id, shipment_data
        )
        
        # 3. Reservar estoque (decrementa quantidade)
        for item in shipment.items:
            await self.inventory_repo.adjust_quantity(
                db,
                product_id=item.product_id,
                tenant_id=tenant_id,
                quantity_change=-item.quantity_sent,
                reason=f"Envio condicional #{shipment.id}",
                user_id=user_id,
            )
        
        # 4. Marcar como SENT e definir deadline
        shipment = await self.shipment_repo.mark_as_sent(
            db, shipment.id, tenant_id, shipment_data.deadline_days
        )
        
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
        
        if shipment.status not in ["SENT", "PARTIAL_RETURN"]:
            raise ValueError(f"Envio está com status {shipment.status}, não pode processar devolução")
        
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
            
            # Devolver ao estoque os itens retornados
            if item_update.quantity_returned > 0:
                await self.inventory_repo.adjust_quantity(
                    db,
                    product_id=db_item.product_id,
                    tenant_id=tenant_id,
                    quantity_change=item_update.quantity_returned,
                    reason=f"Devolução condicional #{shipment.id}",
                    user_id=user_id,
                )
            
            total_kept += item_update.quantity_kept
            total_returned += item_update.quantity_returned
            
            # Preparar itens para venda
            if item_update.quantity_kept > 0:
                items_for_sale.append({
                    "product_id": db_item.product_id,
                    "quantity": item_update.quantity_kept,
                    "unit_price": db_item.unit_price,
                })
        
        # 3. Atualizar status do shipment
        if total_returned > 0 and total_kept > 0:
            new_status = "PARTIAL_RETURN"
        elif total_returned > 0 and total_kept == 0:
            new_status = "CANCELLED"  # Cliente devolveu tudo
        elif total_kept > 0:
            new_status = "COMPLETED"
        else:
            new_status = "PARTIAL_RETURN"
        
        shipment = await self.shipment_repo.update_status(
            db, shipment_id, tenant_id, new_status
        )
        shipment.returned_at = datetime.utcnow()
        
        if return_data.notes:
            shipment.notes = (shipment.notes or "") + f"\n[Devolução] {return_data.notes}"
        
        await db.commit()
        
        # 4. Criar venda se solicitado e houver itens mantidos
        if return_data.create_sale and items_for_sale:
            await self._create_sale_from_shipment(
                db, shipment, tenant_id, user_id, items_for_sale
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
        
        # Criar venda
        sale = Sale(
            tenant_id=tenant_id,
            customer_id=shipment.customer_id,
            user_id=user_id,
            status=SaleStatus.COMPLETED,
            payment_method=PaymentMethod.PENDING,  # Será definido depois
            subtotal=Decimal(total_amount),
            discount=Decimal(0),
            total=Decimal(total_amount),
            notes=f"Venda automática - Envio Condicional #{shipment.id}",
        )
        
        db.add(sale)
        await db.flush()
        
        # Criar items da venda
        for item_data in items:
            sale_item = SaleItem(
                sale_id=sale.id,
                product_id=item_data["product_id"],
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
                subtotal=Decimal(item_data["quantity"] * float(item_data["unit_price"])),
            )
            db.add(sale_item)
        
        await db.commit()
        return sale
    
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
            raise ValueError(f"Não é possível cancelar envio com status {shipment.status}")
        
        # Devolver estoque de todos os itens não processados
        for item in shipment.items:
            quantity_to_return = item.quantity_sent - item.quantity_kept - item.quantity_returned
            
            if quantity_to_return > 0:
                await self.inventory_repo.adjust_quantity(
                    db,
                    product_id=item.product_id,
                    tenant_id=tenant_id,
                    quantity_change=quantity_to_return,
                    reason=f"Cancelamento envio #{shipment.id}: {reason}",
                    user_id=user_id,
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
        
        # Buscar customer
        customer = await self.customer_repo.get(db, shipment.customer_id, tenant_id=tenant_id)
        
        # Buscar produtos
        items_with_products = []
        for item in shipment.items:
            product = await self.product_repo.get(db, item.product_id, tenant_id=tenant_id)
            items_with_products.append({
                "item": item,
                "product": product,
            })
        
        return {
            "shipment": shipment,
            "customer": customer,
            "items": items_with_products,
        }
