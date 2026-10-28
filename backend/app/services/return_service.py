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
from app.services.stock_lock import lock_stock


# Prazo padrão para devolução em dias; cada loja pode mudar (stores.return_window_days)
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
    
    async def _return_window(self, tenant_id: int) -> int:
        """Prazo de devolução da loja, em dias (padrão 7)."""
        from app.models.store import Store
        days = (await self.db.execute(select(Store.return_window_days).where(Store.id == tenant_id))).scalar()
        return int(days) if days is not None else MAX_RETURN_DAYS

    async def _allow_money_refund(self, tenant_id: int) -> bool:
        """A loja devolve dinheiro? (False: só troca de peça)."""
        from app.models.store import Store
        v = (await self.db.execute(select(Store.allow_money_refund).where(Store.id == tenant_id))).scalar()
        return True if v is None else bool(v)

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
        max_days = await self._return_window(tenant_id)

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
                max_return_days=max_days,
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
                max_return_days=max_days,
                items=[],
            )
        
        # Verificar prazo de 7 dias
        if days_since_sale > max_days:
            return ReturnEligibilityResponse(
                sale_id=sale.id,
                sale_number=sale.sale_number,
                sale_date=sale.created_at,
                days_since_sale=days_since_sale,
                is_eligible=False,
                reason=f"Prazo de devolução expirado. O prazo da loja é de {max_days} dias e esta venda tem {days_since_sale} dias.",
                max_return_days=max_days,
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
        
        # Construir lista de itens elegíveis (apenas itens ativos)
        # Cor/tamanho de cada item (para a pessoa saber qual peça está devolvendo)
        from app.models.product_variant import ProductVariant
        v_ids = [i.variant_id for i in sale.items if i.variant_id]
        variant_labels: Dict[int, str] = {}
        if v_ids:
            for v in (await self.db.execute(select(ProductVariant).where(ProductVariant.id.in_(v_ids)))).scalars().all():
                variant_labels[v.id] = " / ".join(x for x in (v.color, v.size) if x)
        returnable_items = []
        for item in sale.items:
            if not item.is_active:
                continue
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
                    variant_id=item.variant_id,
                    variant_label=variant_labels.get(item.variant_id),
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
                max_return_days=max_days,
                items=[],
            )
        
        return ReturnEligibilityResponse(
            sale_id=sale.id,
            sale_number=sale.sale_number,
            sale_date=sale.created_at,
            days_since_sale=days_since_sale,
            is_eligible=True,
            reason=None,
            max_return_days=max_days,
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
            # Trava a venda, as variações dela e as peças novas da troca ANTES de ler "quanto já voltou" e o saldo:
            # duas devoluções (ou devolução e cancelamento) da mesma venda se enfileiram em vez de passar juntas.
            await lock_stock(self.db, sale_ids=[sale_id])
            _rows = (await self.db.execute(
                select(SaleItem.variant_id, SaleItem.product_id).where(SaleItem.sale_id == sale_id, SaleItem.tenant_id == tenant_id)
            )).all()
            await lock_stock(
                self.db,
                variant_ids=[r[0] for r in _rows] + [i.replacement_variant_id for i in return_data.items],
                product_ids=[r[1] for r in _rows if not r[0]],
            )
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
            exchange_lines: list = []
            allow_refund = await self._allow_money_refund(tenant_id)
            
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

                # Troca: confere a peça nova (existe, é outra variação e tem estoque) ANTES de mexer em qualquer coisa
                if not item_request.replacement_variant_id and not allow_refund:
                    raise ValueError("Esta loja não devolve dinheiro: escolha a peça que o cliente leva no lugar.")
                if item_request.replacement_variant_id:
                    from app.models.product_variant import ProductVariant
                    rv = (await self.db.execute(select(ProductVariant).where(
                        ProductVariant.id == item_request.replacement_variant_id,
                        ProductVariant.tenant_id == tenant_id,
                        ProductVariant.is_active == True,  # noqa: E712
                    ))).scalar_one_or_none()
                    if not rv:
                        raise ValueError("A peça escolhida para a troca não foi encontrada")
                    if rv.id == sale_item.variant_id:
                        raise ValueError("Para trocar, escolha uma cor ou tamanho diferente da peça devolvida")
                    avail = await self.fifo_service.check_availability(
                        product_id=rv.product_id, quantity=item_request.quantity,
                        variant_id=rv.id, tenant_id=tenant_id,
                    )
                    if not avail["available"]:
                        raise ValueError(
                            f"Sem estoque da peça escolhida para a troca (disponível: {avail['total_available']}, "
                            f"necessário: {item_request.quantity})"
                        )
                    unit_price = Decimal(str(item_request.replacement_unit_price or rv.price))
                    exchange_lines.append({'variant': rv, 'unit_price': unit_price, 'quantity': item_request.quantity})
                
                # Preparar dados para devolução ao estoque
                if item_request.restock:  # peça com defeito não volta ao estoque
                    items_to_return_to_stock.append({
                        'sale_item': sale_item,
                        'quantity': item_request.quantity,
                    })
                
                return_items_data.append({
                    'sale_item_id': sale_item.id,
                    'product_id': sale_item.product_id,
                    'variant_id': sale_item.variant_id,
                    'quantity_returned': item_request.quantity,
                    'unit_price': sale_item.unit_price,
                    'unit_cost': sale_item.unit_cost,
                    'refund_amount': refund_amount,
                    'restock': item_request.restock,
                    'replacement_variant_id': item_request.replacement_variant_id,
                })
            
            # 4. Devolver ao estoque via FIFO
            for item_data in items_to_return_to_stock:
                sale_item = item_data['sale_item']
                quantity = item_data['quantity']
                
                # Volta para as camadas FIFO de onde a peça saiu, da ÚLTIMA fonte para a primeira: depois da devolução o
                # estoque fica como se a venda tivesse sido menor (vender 30 e devolver 5 = vender 25). Cada fonte guarda
                # quanto já voltou (`quantity_returned`), senão a 2ª devolução da mesma venda reaproveitava a 1ª fonte.
                if sale_item.sale_sources and 'sources' in sale_item.sale_sources:
                    sources = [dict(src) for src in sale_item.sale_sources['sources']]
                    remaining_to_return = quantity
                    for source in reversed(sources):
                        if remaining_to_return <= 0:
                            break
                        livre = int(source['quantity_taken']) - int(source.get('quantity_returned', 0))
                        if livre <= 0:
                            continue
                        voltar = min(livre, remaining_to_return)
                        await self.fifo_service.item_repo.increase_quantity(self.db, source['entry_item_id'], voltar)
                        source['quantity_returned'] = int(source.get('quantity_returned', 0)) + voltar
                        remaining_to_return -= voltar
                    if remaining_to_return > 0:
                        raise ValueError("A venda não tem mais peças para devolver ao estoque (fontes esgotadas)")
                    sale_item.sale_sources = {**sale_item.sale_sources, 'sources': sources}  # reatribui: o JSON só grava se mudar de objeto
                else:
                    # Venda antiga sem fontes FIFO: não pode devolver e deixar o estoque perder a peça sem avisar
                    raise ValueError("Esta venda não tem a origem das peças (FIFO) registrada; devolva pelo ajuste de estoque")

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
            # 6.1 Troca: cria a venda com as peças novas na mesma transação
            exchange_sale = None
            net_amount = None
            if exchange_lines:
                exchange_sale, net_amount = await self._create_exchange_sale(
                    sale, exchange_lines, total_refund, return_data.settlement_method, processed_by_id, tenant_id,
                    allow_refund=allow_refund,
                )

            sale_return = SaleReturn(
                return_number=return_number,
                sale_id=sale.id,
                status="completed",
                reason=return_data.reason,
                total_refund=float(total_refund),
                refund_method=return_data.refund_method or "original",
                exchange_sale_id=exchange_sale.id if exchange_sale else None,
                net_amount=float(net_amount) if net_amount is not None else None,
                settlement_method=return_data.settlement_method if exchange_sale else None,
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
                    variant_id=item_data.get('variant_id'),
                    quantity_returned=item_data['quantity_returned'],
                    unit_price=float(item_data['unit_price']),
                    unit_cost=float(item_data['unit_cost']),
                    refund_amount=float(item_data['refund_amount']),
                    restock=item_data.get('restock', True),
                    replacement_variant_id=item_data.get('replacement_variant_id'),
                    tenant_id=tenant_id,
                    is_active=True,
                )
                self.db.add(return_item)
            
            # 9. Verificar se é devolução total ou parcial e atualizar status
            # Filtrar apenas itens ativos para evitar que soft-deleted inflacionem total_items
            active_items = [item for item in sale.items if item.is_active]
            total_items = sum(item.quantity for item in active_items)
            total_returned = sum(
                returned_quantities.get(item.id, 0) +
                next(
                    (r['quantity_returned'] for r in return_items_data if r['sale_item_id'] == item.id),
                    0
                )
                for item in active_items
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
            affected_products |= {l['variant'].product_id for l in exchange_lines}
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
    
    async def _create_exchange_sale(self, original, lines, total_refund, settlement_method, user_id, tenant_id, *, allow_refund=True):
        """
        Venda das peças novas de uma troca. Sem commit (faz parte da transação da devolução).

        Dinheiro: a diferença (peças novas - valor devolvido) é paga NA HORA, como pagamento confirmado desta venda
        (dinheiro, PIX ou cartão, o que o cliente usar), então entra no caixa e nos relatórios por forma de pagamento.
        Receita: a venda nova soma o valor das peças novas e a devolução subtrai o que foi devolvido, então o
        resultado do dia já sai líquido. Diferença negativa só é aceita se a loja devolve dinheiro.
        Devolve (venda, saldo): saldo > 0 o cliente pagou; saldo < 0 a loja devolveu.
        """
        import secrets
        from app.models.sale import Payment, PaymentMethod

        total_new = sum((l['unit_price'] * l['quantity'] for l in lines), Decimal('0'))
        net = total_new - Decimal(str(total_refund))
        if net < 0 and not allow_refund:
            raise ValueError(
                f"A peça nova vale R$ {(-net):.2f} a menos que a devolvida e esta loja não devolve dinheiro. "
                "Escolha uma peça de valor igual ou maior."
            )
        stamp = now_brazil().strftime('%Y%m%d%H%M%S%f')[:17]
        sale = Sale(
            sale_number=f"VENDA-{stamp}-{secrets.token_hex(2)[:3].upper()}",
            customer_id=original.customer_id,
            seller_id=user_id,
            status=SaleStatus.COMPLETED.value,
            subtotal=float(total_new),
            discount_amount=0,
            tax_amount=0,
            total_amount=float(total_new),
            payment_method=settlement_method,
            notes=f"Troca da venda {original.sale_number}",
            loyalty_points_earned=0,
            tenant_id=tenant_id,
            is_active=True,
        )
        self.db.add(sale)
        await self.db.flush()

        for l in lines:
            rv = l['variant']
            sources = await self.fifo_service.process_sale(
                product_id=rv.product_id, quantity=l['quantity'], variant_id=rv.id, tenant_id=tenant_id,
            )
            cost = sum((Decimal(str(s['quantity_taken'])) * Decimal(str(s['unit_cost'])) for s in sources), Decimal('0'))
            self.db.add(SaleItem(
                sale_id=sale.id, product_id=rv.product_id, variant_id=rv.id, quantity=l['quantity'],
                unit_price=float(l['unit_price']), unit_cost=float(cost / l['quantity']),
                subtotal=float(l['unit_price'] * l['quantity']), discount_amount=0,
                sale_sources={"sources": sources}, tenant_id=tenant_id, is_active=True,
            ))
        if net > 0:
            self.db.add(Payment(
                sale_id=sale.id, amount=float(net), payment_method=PaymentMethod(settlement_method),
                installments=1, status='confirmed', tenant_id=tenant_id, is_active=True,
            ))
        if original.customer_id:
            customer = (await self.db.execute(select(Customer).where(Customer.id == original.customer_id))).scalar_one_or_none()
            if customer:
                points = total_new / Decimal('10')
                sale.loyalty_points_earned = float(points)
                customer.loyalty_points = float(Decimal(str(customer.loyalty_points)) + points)
        await self.db.flush()
        return sale, net

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
        if sale_return.exchange_sale_id:
            sale_return.exchange_sale_number = (await self.db.execute(
                select(Sale.sale_number).where(Sale.id == sale_return.exchange_sale_id)
            )).scalar()
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
