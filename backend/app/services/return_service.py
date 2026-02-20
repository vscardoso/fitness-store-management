"""
Serviço de devolução de vendas.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.timezone import now_brazil, to_brazil_tz, BRAZIL_TZ
from app.models.sale import Sale, SaleItem, SaleStatus
from app.models.sale_return import SaleReturn, ReturnItem
from app.models.product import Product
from app.models.customer import Customer
from app.schemas.return_schema import (
    SaleReturnCreate,
    SaleReturnResponse,
    ReturnEligibilityResponse,
    ReturnableItemResponse,
    ReturnItemResponse,
)
from app.services.fifo_service import FIFOService
from app.services.inventory_service import InventoryService


# Constante: prazo máximo para devolução em dias
MAX_RETURN_DAYS = 7


class ReturnService:
    """Serviço para operações de devolução de vendas."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de devolução.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.fifo_service = FIFOService(db)
    
    async def check_eligibility(
        self,
        sale_id: int,
        *,
        tenant_id: int,
    ) -> ReturnEligibilityResponse:
        """
        Verifica se uma venda é elegível para devolução.
        
        Regras:
        - Venda deve estar COMPLETED
        - Venda deve ter no máximo 7 dias
        - Venda não pode ter sido totalmente devolvida
        
        Args:
            sale_id: ID da venda
            tenant_id: ID do tenant
            
        Returns:
            ReturnEligibilityResponse com informações de elegibilidade
        """
        # Buscar venda com itens
        query = select(Sale).where(
            and_(
                Sale.id == sale_id,
                Sale.tenant_id == tenant_id,
                Sale.is_active == True,
            )
        ).options(
            selectinload(Sale.items).selectinload(SaleItem.product),
            selectinload(Sale.returns).selectinload(SaleReturn.items),
        )
        
        result = await self.db.execute(query)
        sale = result.scalar_one_or_none()
        
        if not sale:
            return ReturnEligibilityResponse(
                sale_id=sale_id,
                sale_number="",
                sale_date=datetime.now(),
                days_since_sale=0,
                is_eligible=False,
                reason="Venda não encontrada",
                max_return_days=MAX_RETURN_DAYS,
                items=[],
            )
        
        # Calcular dias desde a venda (nunca negativo)
        # A data no banco está salva em UTC, converter para horário do Brasil
        if sale.created_at:
            # Assumir que a data no banco está em UTC
            from zoneinfo import ZoneInfo
            sale_date_utc = sale.created_at.replace(tzinfo=ZoneInfo("UTC"))
            sale_date_brazil = sale_date_utc.astimezone(BRAZIL_TZ).replace(tzinfo=None)
        else:
            sale_date_brazil = datetime.now()
        
        now = now_brazil().replace(tzinfo=None)
        days_since_sale = max(0, (now - sale_date_brazil).days)
        
        # Verificar status - permitir devolução para vendas concluídas ou parcialmente devolvidas
        if sale.status not in [SaleStatus.COMPLETED.value, SaleStatus.PARTIALLY_REFUNDED.value]:
            return ReturnEligibilityResponse(
                sale_id=sale.id,
                sale_number=sale.sale_number,
                sale_date=sale.created_at,
                days_since_sale=days_since_sale,
                is_eligible=False,
                reason=f"Venda com status '{sale.status}' não pode ser devolvida. Apenas vendas concluídas ou parcialmente devolvidas podem ter novos itens devolvidos.",
                max_return_days=MAX_RETURN_DAYS,
                items=[],
            )
        
        # Verificar prazo de 7 dias
        if days_since_sale > MAX_RETURN_DAYS:
            return ReturnEligibilityResponse(
                sale_id=sale.id,
                sale_number=sale.sale_number,
                sale_date=sale.created_at,
                days_since_sale=days_since_sale,
                is_eligible=False,
                reason=f"Prazo de devolução expirado. O prazo é de {MAX_RETURN_DAYS} dias e esta venda tem {days_since_sale} dias.",
                max_return_days=MAX_RETURN_DAYS,
                items=[],
            )
        
        # Calcular quantidades já devolvidas por item
        returned_quantities: Dict[int, int] = {}
        for sale_return in sale.returns:
            if sale_return.status == "completed":
                for return_item in sale_return.items:
                    if return_item.sale_item_id not in returned_quantities:
                        returned_quantities[return_item.sale_item_id] = 0
                    returned_quantities[return_item.sale_item_id] += return_item.quantity_returned
        
        # Calcular percentual de desconto da venda para aplicar proporcionalmente
        sale_discount_percentage = Decimal('0')
        if sale.subtotal > 0 and sale.discount_amount > 0:
            sale_discount_percentage = (sale.discount_amount / sale.subtotal) * 100
        
        # Construir lista de itens elegíveis
        returnable_items = []
        for item in sale.items:
            already_returned = returned_quantities.get(item.id, 0)
            available_for_return = item.quantity - already_returned
            
            if available_for_return > 0:
                # Calcular valor máximo de reembolso com desconto proporcional
                gross_amount = Decimal(str(available_for_return)) * item.unit_price
                if sale_discount_percentage > 0:
                    discount_amount = (gross_amount * sale_discount_percentage / 100).quantize(Decimal('0.01'))
                    max_refund = gross_amount - discount_amount
                else:
                    max_refund = gross_amount
                
                returnable_items.append(ReturnableItemResponse(
                    sale_item_id=item.id,
                    product_id=item.product_id,
                    product_name=item.product.name if item.product else f"Produto {item.product_id}",
                    quantity_purchased=item.quantity,
                    quantity_already_returned=already_returned,
                    quantity_available_for_return=available_for_return,
                    unit_price=item.unit_price,
                    max_refund_amount=float(max_refund),
                ))
        
        # Verificar se há itens disponíveis para devolução
        if not returnable_items:
            return ReturnEligibilityResponse(
                sale_id=sale.id,
                sale_number=sale.sale_number,
                sale_date=sale.created_at,
                days_since_sale=days_since_sale,
                is_eligible=False,
                reason="Todos os itens desta venda já foram devolvidos.",
                max_return_days=MAX_RETURN_DAYS,
                items=[],
            )
        
        return ReturnEligibilityResponse(
            sale_id=sale.id,
            sale_number=sale.sale_number,
            sale_date=sale.created_at,
            days_since_sale=days_since_sale,
            is_eligible=True,
            reason=None,
            max_return_days=MAX_RETURN_DAYS,
            items=returnable_items,
        )
    
    async def process_return(
        self,
        sale_id: int,
        return_data: SaleReturnCreate,
        processed_by_id: int,
        *,
        tenant_id: int,
    ) -> SaleReturn:
        """
        Processa uma devolução parcial ou total.
        
        Processo:
        1. Validar elegibilidade
        2. Validar quantidades solicitadas
        3. Calcular valor do reembolso
        4. Devolver ao estoque via FIFO
        5. Estornar pontos de fidelidade (se aplicável)
        6. Criar registro de devolução
        7. Atualizar status da venda (se devolução total)
        
        Args:
            sale_id: ID da venda
            return_data: Dados da devolução
            processed_by_id: ID do usuário que está processando
            tenant_id: ID do tenant
            
        Returns:
            SaleReturn: Registro de devolução criado
            
        Raises:
            ValueError: Se validações falharem
        """
        try:
            # 1. Verificar elegibilidade
            eligibility = await self.check_eligibility(sale_id, tenant_id=tenant_id)
            
            if not eligibility.is_eligible:
                raise ValueError(eligibility.reason)
            
            # 2. Buscar venda completa
            query = select(Sale).where(
                and_(
                    Sale.id == sale_id,
                    Sale.tenant_id == tenant_id,
                )
            ).options(
                selectinload(Sale.items).selectinload(SaleItem.product),
                selectinload(Sale.customer),
            )
            
            result = await self.db.execute(query)
            sale = result.scalar_one()
            
            # 3. Validar e processar itens
            return_items_data = []
            total_refund = Decimal('0')
            items_to_return_to_stock = []
            
            # Calcular quantidades já devolvidas
            returned_quantities = await self._get_returned_quantities(sale_id)
            
            # Calcular percentual de desconto da venda para aplicar proporcionalmente na devolução
            # O desconto pode ser por forma de pagamento (payment_discount) ou manual
            sale_discount_percentage = Decimal('0')
            if sale.subtotal > 0 and sale.discount_amount > 0:
                sale_discount_percentage = (sale.discount_amount / sale.subtotal) * 100
            
            for item_request in return_data.items:
                # Encontrar item da venda
                sale_item = next(
                    (i for i in sale.items if i.id == item_request.sale_item_id),
                    None
                )
                
                if not sale_item:
                    raise ValueError(f"Item {item_request.sale_item_id} não encontrado na venda")
                
                # Verificar quantidade disponível
                already_returned = returned_quantities.get(sale_item.id, 0)
                available = sale_item.quantity - already_returned
                
                if item_request.quantity > available:
                    raise ValueError(
                        f"Quantidade solicitada ({item_request.quantity}) excede o disponível ({available}) "
                        f"para o item {sale_item.product.name if sale_item.product else sale_item.product_id}"
                    )
                
                # Calcular reembolso com desconto proporcional
                # O cliente pagou menos devido ao desconto, então deve receber menos na devolução
                item_gross_amount = Decimal(str(item_request.quantity)) * sale_item.unit_price
                
                # Aplicar desconto proporcional da venda
                if sale_discount_percentage > 0:
                    item_discount = (item_gross_amount * sale_discount_percentage / 100).quantize(Decimal('0.01'))
                    refund_amount = item_gross_amount - item_discount
                else:
                    refund_amount = item_gross_amount
                
                total_refund += refund_amount
                
                # Preparar dados para devolução ao estoque
                items_to_return_to_stock.append({
                    'sale_item': sale_item,
                    'quantity': item_request.quantity,
                })
                
                return_items_data.append({
                    'sale_item_id': sale_item.id,
                    'product_id': sale_item.product_id,
                    'quantity_returned': item_request.quantity,
                    'unit_price': sale_item.unit_price,
                    'unit_cost': sale_item.unit_cost,
                    'refund_amount': refund_amount,
                })
            
            # 4. Devolver ao estoque via FIFO
            for item_data in items_to_return_to_stock:
                sale_item = item_data['sale_item']
                quantity = item_data['quantity']
                
                # Usar as fontes FIFO originais para devolver ao estoque correto
                if sale_item.sale_sources and 'sources' in sale_item.sale_sources:
                    # Devolver para as entradas originais proporcionalmente
                    sources = sale_item.sale_sources['sources']
                    remaining_to_return = quantity
                    
                    for source in sources:
                        if remaining_to_return <= 0:
                            break
                        
                        # Quantidade que foi tirada desta entrada
                        quantity_taken = source['quantity_taken']
                        entry_item_id = source['entry_item_id']
                        
                        # Calcular quanto devolver proporcionalmente
                        quantity_to_return = min(quantity_taken, remaining_to_return)
                        
                        # Devolver ao entry_item
                        await self.fifo_service.item_repo.increase_quantity(
                            self.db,
                            entry_item_id,
                            quantity_to_return
                        )
                        
                        remaining_to_return -= quantity_to_return
            
            # 5. Estornar pontos de fidelidade (proporcional)
            if sale.customer_id and sale.loyalty_points_earned > 0:
                # Calcular pontos proporcionais ao reembolso
                points_ratio = total_refund / sale.total_amount if sale.total_amount > 0 else 0
                points_to_revoke = sale.loyalty_points_earned * points_ratio
                
                # Buscar cliente
                customer_query = select(Customer).where(Customer.id == sale.customer_id)
                customer_result = await self.db.execute(customer_query)
                customer = customer_result.scalar_one_or_none()
                
                if customer:
                    customer.loyalty_points = max(
                        0,
                        float(customer.loyalty_points) - float(points_to_revoke)
                    )
            
            # 6. Gerar número da devolução
            return_number = f"DEV-{now_brazil().strftime('%Y%m%d%H%M%S')}"
            
            # 7. Criar registro de devolução
            sale_return = SaleReturn(
                return_number=return_number,
                sale_id=sale.id,
                status="completed",
                reason=return_data.reason,
                total_refund=float(total_refund),
                refund_method=return_data.refund_method or "original",
                processed_by_id=processed_by_id,
                tenant_id=tenant_id,
                is_active=True,
            )
            self.db.add(sale_return)
            await self.db.flush()
            
            # 8. Criar itens da devolução
            for item_data in return_items_data:
                return_item = ReturnItem(
                    return_id=sale_return.id,
                    sale_item_id=item_data['sale_item_id'],
                    product_id=item_data['product_id'],
                    quantity_returned=item_data['quantity_returned'],
                    unit_price=float(item_data['unit_price']),
                    unit_cost=float(item_data['unit_cost']),
                    refund_amount=float(item_data['refund_amount']),
                    tenant_id=tenant_id,
                    is_active=True,
                )
                self.db.add(return_item)
            
            # 9. Verificar se é devolução total ou parcial e atualizar status
            total_items = sum(item.quantity for item in sale.items)
            total_returned = sum(
                returned_quantities.get(item.id, 0) + 
                next(
                    (r['quantity_returned'] for r in return_items_data if r['sale_item_id'] == item.id),
                    0
                )
                for item in sale.items
            )
            
            # Atualizar status baseado na quantidade devolvida
            if total_returned >= total_items:
                # Devolução total
                sale.status = SaleStatus.REFUNDED.value
            elif total_returned > 0:
                # Devolução parcial
                sale.status = SaleStatus.PARTIALLY_REFUNDED.value
            
            await self.db.commit()
            
            # 10. Sincronizar inventário
            inv_sync = InventoryService(self.db)
            affected_products = {item['product_id'] for item in return_items_data}
            for product_id in affected_products:
                try:
                    await inv_sync.rebuild_product_from_fifo(product_id, tenant_id=tenant_id)
                except Exception as sync_err:
                    print(f"[Inventory Sync] Falha ao sincronizar produto {product_id}: {sync_err}")
            
            # Recarregar com relacionamentos
            return await self._get_return_with_details(sale_return.id)
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def _get_returned_quantities(self, sale_id: int) -> Dict[int, int]:
        """
        Busca quantidades já devolvidas por item de uma venda.
        
        Args:
            sale_id: ID da venda
            
        Returns:
            Dict mapeando sale_item_id -> quantidade devolvida
        """
        query = select(ReturnItem).join(SaleReturn).where(
            and_(
                SaleReturn.sale_id == sale_id,
                SaleReturn.status == "completed",
            )
        )
        
        result = await self.db.execute(query)
        return_items = result.scalars().all()
        
        quantities = {}
        for item in return_items:
            if item.sale_item_id not in quantities:
                quantities[item.sale_item_id] = 0
            quantities[item.sale_item_id] += item.quantity_returned
        
        return quantities
    
    async def _get_return_with_details(self, return_id: int) -> SaleReturn:
        """
        Busca devolução com todos os relacionamentos.
        
        Args:
            return_id: ID da devolução
            
        Returns:
            SaleReturn com relacionamentos carregados
        """
        query = select(SaleReturn).where(SaleReturn.id == return_id).options(
            selectinload(SaleReturn.items).selectinload(ReturnItem.product),
            selectinload(SaleReturn.sale),
            selectinload(SaleReturn.processed_by),
        )
        
        result = await self.db.execute(query)
        sale_return = result.scalar_one()
        
        # Adicionar sale_number do relacionamento
        if sale_return.sale:
            sale_return.sale_number = sale_return.sale.sale_number
        
        # Adicionar nome do processador como atributo dinâmico
        if sale_return.processed_by:
            sale_return.processed_by_name = sale_return.processed_by.full_name
        
        # Adicionar product_name aos itens
        for item in sale_return.items:
            if item.product:
                item.product_name = item.product.name
        
        return sale_return
    
    async def get_return_history(
        self,
        sale_id: int,
        *,
        tenant_id: int,
    ) -> List[SaleReturn]:
        """
        Busca histórico de devoluções de uma venda.
        
        Args:
            sale_id: ID da venda
            tenant_id: ID do tenant
            
        Returns:
            Lista de devoluções da venda
        """
        query = select(SaleReturn).where(
            and_(
                SaleReturn.sale_id == sale_id,
                SaleReturn.tenant_id == tenant_id,
            )
        ).options(
            selectinload(SaleReturn.items).selectinload(ReturnItem.product),
            selectinload(SaleReturn.sale),
            selectinload(SaleReturn.processed_by),
        ).order_by(SaleReturn.created_at.desc())
        
        result = await self.db.execute(query)
        returns = result.scalars().all()
        
        # Adicionar nomes aos itens
        for sale_return in returns:
            # Adicionar sale_number do relacionamento
            if sale_return.sale:
                sale_return.sale_number = sale_return.sale.sale_number
            if sale_return.processed_by:
                sale_return.processed_by_name = sale_return.processed_by.full_name
            for item in sale_return.items:
                if item.product:
                    item.product_name = item.product.name
        
        return returns
