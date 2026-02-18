"""
Servio de gerenciamento de vendas.
"""
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import now_brazil

from app.models.inventory import MovementType
from app.models.sale import Payment, Sale, SaleItem, SaleStatus
from app.repositories.customer_repository import CustomerRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.sale_repository import SaleRepository
from app.schemas.sale import SaleCreate
from app.services.fifo_service import FIFOService
from app.services.inventory_service import InventoryService
from app.services.payment_discount_service import PaymentDiscountService


class SaleService:
    """Servio para operaes de negcio com vendas."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o servio de vendas.
        
        Args:
            db: Sesso assncrona do banco de dados
        """
        self.db = db
        self.sale_repo = SaleRepository(db)
        self.inventory_repo = InventoryRepository(db)
        self.customer_repo = CustomerRepository(db)
        self.product_repo = ProductRepository(db)
        self.fifo_service = FIFOService(db)
    
    async def create_sale(
        self,
        sale_data: SaleCreate,
        seller_id: int,
        *,
        tenant_id: int,
    ) -> Sale:
        """
        Cria uma venda completa com validaes e movimentao de estoque.
        
        Processo:
        1. Validar estoque disponvel para TODOS os itens
        2. Calcular valores (subtotal, descontos, total)
        3. Validar pagamentos
        4. Criar Sale
        5. Criar SaleItems
        6. Criar Payments
        7. Criar StockMovements e atualizar Inventory
        8. Atualizar fidelidade do cliente
        9. Finalizar venda
        
        Args:
            sale_data: Dados da venda
            seller_id: ID do vendedor
            tenant_id: ID do tenant
            
        Returns:
            Sale: Venda criada e finalizada
            
        Raises:
            ValueError: Se validaes falharem (estoque, pagamento, etc)
        """
        try:
            # 1. Validar estoque disponível via FIFO (entry_items) para TODOS os itens
            print(f" Validando estoque para {len(sale_data.items)} itens...")
            for item in sale_data.items:
                # Verificar disponibilidade via FIFOService (usa entry_items)
                availability = await self.fifo_service.check_availability(
                    product_id=item.product_id,
                    quantity=item.quantity,
                    tenant_id=tenant_id,
                )
                
                if not availability["available"]:
                    product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
                    product_name = product.name if product else f"ID {item.product_id}"
                    raise ValueError(
                        f"Estoque insuficiente para {product_name}. "
                        f"Disponível: {availability['total_available']}, Solicitado: {item.quantity}"
                    )
            
            # 2. Calcular valores
            print(" Calculando valores...")
            subtotal = Decimal('0')
            for item in sale_data.items:
                item_subtotal = (
                    Decimal(str(item.unit_price)) * item.quantity
                ) - Decimal(str(item.discount_amount))
                subtotal += item_subtotal
            
            # 2.1. Aplicar desconto por forma de pagamento (se configurado)
            payment_discount_amount = Decimal('0')
            if sale_data.payment_method:
                print(f" Verificando desconto para forma de pagamento: {sale_data.payment_method.value}")
                discount_service = PaymentDiscountService(self.db)
                try:
                    discount_calc = await discount_service.calculate_discount(
                        tenant_id=tenant_id,
                        payment_method=sale_data.payment_method.value,
                        amount=subtotal
                    )
                    payment_discount_amount = discount_calc.discount_amount
                    if payment_discount_amount > 0:
                        print(f"   Desconto aplicado: {discount_calc.discount_percentage}% = R$ {payment_discount_amount:.2f}")
                except Exception as e:
                    print(f"   Erro ao calcular desconto: {e}")
                    # Continua sem desconto se houver erro
            
            discount_amount = Decimal(str(sale_data.discount_amount or 0)) + payment_discount_amount
            tax_amount = Decimal(str(sale_data.tax_amount or 0))
            total_amount = subtotal - discount_amount + tax_amount
            
            # 3. Validar pagamentos
            print(" Validando pagamentos...")
            payments_total = sum(
                Decimal(str(p.amount)) for p in sale_data.payments
            )
            
            if payments_total < total_amount:
                raise ValueError(
                    f"Pagamento insuficiente. "
                    f"Total: R$ {total_amount:.2f}, Pago: R$ {payments_total:.2f}, "
                    f"Faltam: R$ {(total_amount - payments_total):.2f}"
                )
            
            # 4. Gerar nmero da venda
            sale_number = f"VENDA-{now_brazil().strftime('%Y%m%d%H%M%S')}"
            
            # 5. Criar Sale
            print(f" Criando venda {sale_number}...")
            sale_dict = {
                'sale_number': sale_number,
                'customer_id': sale_data.customer_id,
                'seller_id': seller_id,
                'status': SaleStatus.PENDING.value,
                'subtotal': float(subtotal),
                'discount_amount': float(discount_amount),
                'tax_amount': float(tax_amount),
                'total_amount': float(total_amount),
                'payment_method': sale_data.payment_method.value,
                'payment_reference': sale_data.payments[0].payment_reference if sale_data.payments else None,
                'loyalty_points_used': float(getattr(sale_data, 'loyalty_points_used', 0) or 0),
                'loyalty_points_earned': 0,  # Calculado depois
                'notes': sale_data.notes,
                'tenant_id': tenant_id,  # Multi-tenancy
                'is_active': True
            }
            
            sale = Sale(**sale_dict)
            self.db.add(sale)
            await self.db.flush()  # Para obter o ID
            
            # 6. Criar SaleItems
            print(f" Criando {len(sale_data.items)} itens da venda...")
            for item_data in sale_data.items:
                item_subtotal = (
                    Decimal(str(item_data.unit_price)) * item_data.quantity
                ) - Decimal(str(item_data.discount_amount))
                
                #  FIFO: Processar venda e obter fontes (de quais entradas saiu)
                print(f"    Processando FIFO para produto {item_data.product_id}...")
                try:
                    fifo_sources = await self.fifo_service.process_sale(
                        product_id=item_data.product_id,
                        quantity=item_data.quantity,
                        tenant_id=tenant_id,
                    )
                    print(f"    FIFO processado: {len(fifo_sources)} fonte(s)")
                except ValueError as fifo_error:
                    print(f"    Erro FIFO: {str(fifo_error)}")
                    raise ValueError(
                        f"Erro ao processar FIFO para produto {item_data.product_id}: {str(fifo_error)}"
                    )
                
                # Calcular custo unitário médio ponderado a partir das fontes FIFO
                # unit_cost = SUM(quantity_taken * unit_cost) / total_quantity
                total_cost = sum(
                    Decimal(str(source['quantity_taken'])) * Decimal(str(source['unit_cost']))
                    for source in fifo_sources
                )
                unit_cost = total_cost / item_data.quantity if item_data.quantity > 0 else Decimal('0')
                
                # Criar SaleItem com rastreabilidade FIFO
                sale_item = SaleItem(
                    sale_id=sale.id,
                    product_id=item_data.product_id,
                    quantity=item_data.quantity,
                    unit_price=float(item_data.unit_price),
                    unit_cost=float(unit_cost),  #  Custo unitário médio ponderado
                    subtotal=float(item_subtotal),
                    discount_amount=float(item_data.discount_amount),
                    sale_sources={"sources": fifo_sources},  #  Salvar fontes FIFO
                    tenant_id=tenant_id,
                    is_active=True
                )
                self.db.add(sale_item)
            
            await self.db.flush()
            
            # 7. Criar Payments
            print(f" Criando {len(sale_data.payments)} pagamentos...")
            for payment_data in sale_data.payments:
                payment = Payment(
                    sale_id=sale.id,
                    amount=float(payment_data.amount),
                    payment_method=payment_data.payment_method.value,
                    payment_reference=payment_data.payment_reference,
                    status='confirmed',  # PaymentCreate no tem status, sempre confirmar
                    notes=None,  # PaymentCreate no tem notes
                    tenant_id=tenant_id,
                    is_active=True
                )
                self.db.add(payment)
            
            await self.db.flush()
            
            # 8. Atualizar fidelidade do cliente
            # Nota: Movimentao de estoque agora  feita pelo FIFOService.process_sale()
            # no sendo mais necessrio chamar inventory_repo.remove_stock()
            loyalty_points_earned = Decimal('0')
            if sale_data.customer_id:
                print(" Atualizando pontos de fidelidade...")
                customer = await self.customer_repo.get(self.db, sale_data.customer_id, tenant_id=tenant_id)
                if customer:
                    # Pontos: 1 ponto a cada R$ 10 gastos
                    loyalty_points_earned = total_amount / Decimal('10')
                    
                    # SaleCreate no tem loyalty_points_used, sempre 0 na criao
                    new_loyalty_points = (
                        Decimal(str(customer.loyalty_points)) + 
                        loyalty_points_earned
                    )
                    
                    new_total_spent = (
                        Decimal(str(customer.total_spent)) + total_amount
                    )
                    
                    new_total_purchases = customer.total_purchases + 1
                    
                    # Atualizar diretamente os atributos do customer
                    customer.loyalty_points = float(new_loyalty_points)
                    customer.total_spent = float(new_total_spent)
                    customer.total_purchases = new_total_purchases
            
            # 10. Finalizar venda
            print(" Finalizando venda...")
            sale.status = SaleStatus.COMPLETED.value
            sale.loyalty_points_earned = float(loyalty_points_earned)
            
            await self.db.commit()

            # Recarregar venda com relacionamentos usando selectinload
            # Isso garante que os relacionamentos sejam carregados eagerly
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload
            
            result = await self.db.execute(
                select(Sale)
                .options(
                    selectinload(Sale.items).selectinload(SaleItem.product),
                    selectinload(Sale.payments),
                    selectinload(Sale.customer),
                    selectinload(Sale.seller)
                )
                .where(Sale.id == sale.id)
            )
            sale = result.scalar_one()

            # Rebuild incremental de inventário para produtos afetados (verdade = FIFO)
            inv_sync = InventoryService(self.db)
            affected_products = {item.product_id for item in sale.items}
            for pid in affected_products:
                try:
                    delta = await inv_sync.rebuild_product_from_fifo(pid, tenant_id=tenant_id)
                    print(f"  [Inventory Sync] Produto {pid}: fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} created={delta['created']} updated={delta['updated']}")
                except Exception as sync_err:
                    # Não bloquear venda por falha de sync – logar e continuar
                    print(f"  [Inventory Sync] Falha ao sincronizar produto {pid}: {sync_err}")
            
            print(f" Venda {sale_number} criada com sucesso!")
            return sale
            
        except Exception as e:
            print(f" Erro ao criar venda: {str(e)}")
            await self.db.rollback()
            raise e
    
    async def cancel_sale(
        self,
        sale_id: int,
        reason: str,
        user_id: int,
        *,
        tenant_id: int,
    ) -> Sale:
        """
        Cancela uma venda e reverte estoque.
        
        Args:
            sale_id: ID da venda
            reason: Motivo do cancelamento
            user_id: ID do usurio que est cancelando
            tenant_id: ID do tenant
            
        Returns:
            Sale: Venda cancelada
            
        Raises:
            ValueError: Se venda no encontrada ou j cancelada
        """
        try:
            sale = await self.sale_repo.get(self.db, sale_id, tenant_id=tenant_id)
            if not sale:
                raise ValueError(f"Venda {sale_id} no encontrada")
            
            if sale.status == SaleStatus.CANCELLED.value:
                raise ValueError("Venda j est cancelada")
            
            print(f" Cancelando venda {sale.sale_number}...")
            
            # 1. Reverter estoque usando FIFO
            print(" Revertendo estoque via FIFO...")
            # Buscar itens da venda atravs de refresh com relationships
            await self.db.refresh(sale, ['items'])
            
            for item in sale.items:
                #  FIFO: Reverter usando as fontes salvas no sale_sources
                if item.sale_sources and 'sources' in item.sale_sources:
                    print(f"    Revertendo FIFO para produto {item.product_id}...")
                    try:
                        await self.fifo_service.reverse_sale(
                            sources=item.sale_sources['sources']
                        )
                        print(f"    FIFO revertido com sucesso")
                    except ValueError as fifo_error:
                        print(f"    Erro ao reverter FIFO: {str(fifo_error)}")
                        raise ValueError(
                            f"Erro ao reverter FIFO para produto {item.product_id}: {str(fifo_error)}"
                        )
                else:
                    # Fallback: venda antiga sem FIFO tracking
                    print(f"    Item {item.id} sem sale_sources, usando mtodo legado")
                    inventory = await self.inventory_repo.get_by_product(item.product_id, tenant_id=tenant_id)
                    if inventory:
                        await self.inventory_repo.add_stock(
                            inventory.id,
                            quantity=item.quantity,
                            movement_type=MovementType.RETURN,
                            reference_id=f"CANCEL-{sale.sale_number}",
                            notes=f"Cancelamento da venda {sale.sale_number}. Motivo: {reason}"
                        )
            
            # 2. Reverter pontos de fidelidade
            if sale.customer_id:
                print(" Revertendo pontos de fidelidade...")
                customer = await self.customer_repo.get(self.db, sale.customer_id, tenant_id=tenant_id)
                if customer:
                    new_loyalty_points = (
                        Decimal(str(customer.loyalty_points)) - 
                        Decimal(str(sale.loyalty_points_earned)) +
                        Decimal(str(sale.loyalty_points_used))
                    )
                    
                    new_total_spent = (
                        Decimal(str(customer.total_spent)) - 
                        Decimal(str(sale.total_amount))
                    )
                    
                    new_total_purchases = max(0, customer.total_purchases - 1)
                    
                    # Atualizar customer com atribuio direta
                    customer.loyalty_points = float(max(0, new_loyalty_points))
                    customer.total_spent = float(max(0, new_total_spent))
                    customer.total_purchases = new_total_purchases
            
            # 3. Atualizar status da venda
            sale.status = SaleStatus.CANCELLED.value
            sale.notes = f"{sale.notes or ''}\n[CANCELADA] {reason}".strip()
            
            await self.db.commit()
            await self.db.refresh(sale)
            
            print(f" Venda {sale.sale_number} cancelada com sucesso!")
            return sale
            
        except Exception as e:
            print(f" Erro ao cancelar venda: {str(e)}")
            await self.db.rollback()
            raise e
    
    async def get_sale(self, sale_id: int, *, tenant_id: int) -> Optional[Sale]:
        """
        Busca uma venda por ID com relacionamentos.
        
        Args:
            sale_id: ID da venda
            tenant_id: ID do tenant
            
        Returns:
            Optional[Sale]: Venda encontrada ou None
        """
        return await self.sale_repo.get(self.db, sale_id, tenant_id=tenant_id)
    
    async def get_sale_by_number(self, sale_number: str, *, tenant_id: int | None = None) -> Optional[Sale]:
        """
        Busca uma venda pelo nmero.
        
        Args:
            sale_number: Nmero da venda
            tenant_id: ID do tenant
            
        Returns:
            Optional[Sale]: Venda encontrada ou None
        """
        return await self.sale_repo.get_by_sale_number(sale_number, tenant_id=tenant_id)
    
    async def list_sales(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[SaleStatus] = None,
        customer_id: Optional[int] = None,
        seller_id: Optional[int] = None,
        *,
        tenant_id: int | None = None,
    ) -> List[Sale]:
        """
        Lista vendas com filtros.
        
        Args:
            skip: Nmero de registros para pular
            limit: Nmero mximo de registros
            status: Filtrar por status
            customer_id: Filtrar por cliente
            seller_id: Filtrar por vendedor
            tenant_id: ID do tenant
            
        Returns:
            List[Sale]: Lista de vendas
        """
        if customer_id:
            return await self.sale_repo.get_by_customer(customer_id, tenant_id=tenant_id)
        
        if seller_id:
            return await self.sale_repo.get_by_seller(seller_id, tenant_id=tenant_id)
        
        return await self.sale_repo.get_multi(skip=skip, limit=limit, tenant_id=tenant_id)
    
    async def get_daily_report(self, date: datetime = None, *, tenant_id: int | None = None) -> Dict:
        """
        Gera relatrio de vendas do dia.
        
        Args:
            date: Data do relatrio (padro: hoje)
            tenant_id: ID do tenant
            
        Returns:
            Dict: Relatrio com totais e estatsticas
        """
        if date is None:
            date = datetime.utcnow().date()
        else:
            date = date.date() if isinstance(date, datetime) else date
        
        # Total do dia
        daily_total = await self.sale_repo.get_daily_total(date, tenant_id=tenant_id)
        
        # Vendas do perodo
        sales = await self.sale_repo.get_by_date_range(date, date, tenant_id=tenant_id)
        
        # Estatsticas
        completed_sales = [s for s in sales if s.status == SaleStatus.COMPLETED.value]
        cancelled_sales = [s for s in sales if s.status == SaleStatus.CANCELLED.value]
        
        return {
            'date': date.isoformat(),
            'total_sales': len(sales),
            'completed_sales': len(completed_sales),
            'cancelled_sales': len(cancelled_sales),
            'total_revenue': float(daily_total or 0),
            'average_ticket': (
                float(daily_total / len(completed_sales)) 
                if completed_sales and daily_total 
                else 0
            )
        }
    
    async def get_sales_report(
        self,
        start_date: datetime,
        end_date: datetime,
        *,
        tenant_id: int | None = None,
    ) -> Dict:
        """
        Gera relatrio de vendas por perodo.
        
        Args:
            start_date: Data inicial
            end_date: Data final
            tenant_id: ID do tenant
            
        Returns:
            Dict: Relatrio com estatsticas completas
        """
        return await self.sale_repo.get_sales_report(
            start_date.date() if isinstance(start_date, datetime) else start_date,
            end_date.date() if isinstance(end_date, datetime) else end_date,
            tenant_id=tenant_id,
        )
    
    async def get_top_products(self, limit: int = 10, *, tenant_id: int | None = None) -> List[Dict]:
        """
        Lista produtos mais vendidos.
        
        Args:
            limit: Nmero de produtos
            tenant_id: ID do tenant
            
        Returns:
            List[Dict]: Lista de produtos com quantidades
        """
        return await self.sale_repo.get_top_products(limit, tenant_id=tenant_id)
    
    async def get_daily_total(self, date: datetime = None, *, tenant_id: int | None = None) -> Decimal:
        """
        Total de vendas do dia.
        
        Args:
            date: Data para consulta (padro: hoje)
            tenant_id: ID do tenant
            
        Returns:
            Decimal: Total de vendas
        """
        if date is None:
            date = datetime.utcnow().date()
        else:
            date = date.date() if isinstance(date, datetime) else date
        
        total = await self.sale_repo.get_daily_total(date, tenant_id=tenant_id)
        return Decimal(str(total)) if total else Decimal('0')
    
    async def get_sales_by_period(
        self,
        start_date: datetime,
        end_date: datetime,
        include_relationships: bool = True,
        *,
        tenant_id: int | None = None,
    ) -> List[Sale]:
        """
        Vendas por perodo.
        
        Args:
            start_date: Data inicial
            end_date: Data final
            include_relationships: Se deve incluir items e payments
            tenant_id: ID do tenant
            
        Returns:
            List[Sale]: Lista de vendas do perodo
        """
        start = start_date.date() if isinstance(start_date, datetime) else start_date
        end = end_date.date() if isinstance(end_date, datetime) else end_date
        
        return await self.sale_repo.get_by_date_range(
            start, end, include_relationships, tenant_id=tenant_id
        )

