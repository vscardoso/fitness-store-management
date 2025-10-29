"""
Serviço de gerenciamento de vendas.
"""
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import MovementType
from app.models.sale import Payment, Sale, SaleItem, SaleStatus
from app.repositories.customer_repository import CustomerRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.sale_repository import SaleRepository
from app.schemas.sale import SaleCreate


class SaleService:
    """Serviço para operações de negócio com vendas."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de vendas.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.sale_repo = SaleRepository(db)
        self.inventory_repo = InventoryRepository(db)
        self.customer_repo = CustomerRepository(db)
        self.product_repo = ProductRepository(db)
    
    async def create_sale(
        self,
        sale_data: SaleCreate,
        seller_id: int
    ) -> Sale:
        """
        Cria uma venda completa com validações e movimentação de estoque.
        
        Processo:
        1. Validar estoque disponível para TODOS os itens
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
            
        Returns:
            Sale: Venda criada e finalizada
            
        Raises:
            ValueError: Se validações falharem (estoque, pagamento, etc)
        """
        try:
            # 1. Validar estoque disponível para TODOS os itens
            print(f"🔍 Validando estoque para {len(sale_data.items)} itens...")
            for item in sale_data.items:
                inventory = await self.inventory_repo.get_by_product(item.product_id)
                
                if not inventory:
                    raise ValueError(
                        f"Produto ID {item.product_id} não possui registro de estoque"
                    )
                
                if inventory.quantity < item.quantity:
                    product = await self.product_repo.get(self.db, item.product_id)
                    product_name = product.name if product else f"ID {item.product_id}"
                    raise ValueError(
                        f"Estoque insuficiente para {product_name}. "
                        f"Disponível: {inventory.quantity}, Solicitado: {item.quantity}"
                    )
            
            # 2. Calcular valores
            print("💰 Calculando valores...")
            subtotal = Decimal('0')
            for item in sale_data.items:
                item_subtotal = (
                    Decimal(str(item.unit_price)) * item.quantity
                ) - Decimal(str(item.discount_amount))
                subtotal += item_subtotal
            
            discount_amount = Decimal(str(sale_data.discount_amount or 0))
            tax_amount = Decimal(str(sale_data.tax_amount or 0))
            total_amount = subtotal - discount_amount + tax_amount
            
            # 3. Validar pagamentos
            print("💳 Validando pagamentos...")
            payments_total = sum(
                Decimal(str(p.amount)) for p in sale_data.payments
            )
            
            if payments_total < total_amount:
                raise ValueError(
                    f"Pagamento insuficiente. "
                    f"Total: R$ {total_amount:.2f}, Pago: R$ {payments_total:.2f}, "
                    f"Faltam: R$ {(total_amount - payments_total):.2f}"
                )
            
            # 4. Gerar número da venda
            sale_number = f"VENDA-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
            
            # 5. Criar Sale
            print(f"📝 Criando venda {sale_number}...")
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
                'is_active': True
            }
            
            sale = Sale(**sale_dict)
            self.db.add(sale)
            await self.db.flush()  # Para obter o ID
            
            # 6. Criar SaleItems
            print(f"📦 Criando {len(sale_data.items)} itens da venda...")
            for item_data in sale_data.items:
                item_subtotal = (
                    Decimal(str(item_data.unit_price)) * item_data.quantity
                ) - Decimal(str(item_data.discount_amount))
                
                sale_item = SaleItem(
                    sale_id=sale.id,
                    product_id=item_data.product_id,
                    quantity=item_data.quantity,
                    unit_price=float(item_data.unit_price),
                    subtotal=float(item_subtotal),
                    discount_amount=float(item_data.discount_amount),
                    is_active=True
                )
                self.db.add(sale_item)
            
            await self.db.flush()
            
            # 7. Criar Payments
            print(f"💵 Criando {len(sale_data.payments)} pagamentos...")
            for payment_data in sale_data.payments:
                payment = Payment(
                    sale_id=sale.id,
                    amount=float(payment_data.amount),
                    payment_method=payment_data.payment_method.value,
                    payment_reference=payment_data.payment_reference,
                    status='confirmed',  # PaymentCreate não tem status, sempre confirmar
                    notes=None,  # PaymentCreate não tem notes
                    is_active=True
                )
                self.db.add(payment)
            
            await self.db.flush()
            
            # 8. Criar StockMovements e atualizar Inventory
            print("📉 Movimentando estoque...")
            for item_data in sale_data.items:
                inventory = await self.inventory_repo.get_by_product(item_data.product_id)
                
                # Remover estoque com movimento
                await self.inventory_repo.remove_stock(
                    inventory.id,
                    quantity=item_data.quantity,
                    movement_type=MovementType.SALE,
                    reference_id=sale_number,
                    notes=f'Venda {sale_number} - Item {item_data.product_id}'
                )
            
            # 9. Atualizar fidelidade do cliente
            loyalty_points_earned = Decimal('0')
            if sale_data.customer_id:
                print("⭐ Atualizando pontos de fidelidade...")
                customer = await self.customer_repo.get(self.db, sale_data.customer_id)
                if customer:
                    # Pontos: 1 ponto a cada R$ 10 gastos
                    loyalty_points_earned = total_amount / Decimal('10')
                    
                    # SaleCreate não tem loyalty_points_used, sempre 0 na criação
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
            print("✅ Finalizando venda...")
            sale.status = SaleStatus.COMPLETED.value
            sale.loyalty_points_earned = float(loyalty_points_earned)
            
            await self.db.commit()
            await self.db.refresh(sale)
            
            print(f"🎉 Venda {sale_number} criada com sucesso!")
            return sale
            
        except Exception as e:
            print(f"❌ Erro ao criar venda: {str(e)}")
            await self.db.rollback()
            raise e
    
    async def cancel_sale(
        self,
        sale_id: int,
        reason: str,
        user_id: int
    ) -> Sale:
        """
        Cancela uma venda e reverte estoque.
        
        Args:
            sale_id: ID da venda
            reason: Motivo do cancelamento
            user_id: ID do usuário que está cancelando
            
        Returns:
            Sale: Venda cancelada
            
        Raises:
            ValueError: Se venda não encontrada ou já cancelada
        """
        try:
            sale = await self.sale_repo.get(self.db, sale_id)
            if not sale:
                raise ValueError(f"Venda {sale_id} não encontrada")
            
            if sale.status == SaleStatus.CANCELLED.value:
                raise ValueError("Venda já está cancelada")
            
            print(f"🔄 Cancelando venda {sale.sale_number}...")
            
            # 1. Reverter estoque
            print("📈 Revertendo estoque...")
            # Buscar itens da venda através de refresh com relationships
            await self.db.refresh(sale, ['items'])
            
            for item in sale.items:
                inventory = await self.inventory_repo.get_by_product(item.product_id)
                if inventory:
                    # Devolver ao estoque
                    await self.inventory_repo.add_stock(
                        inventory.id,
                        quantity=item.quantity,
                        movement_type=MovementType.RETURN,
                        reference_id=f"CANCEL-{sale.sale_number}",
                        notes=f"Cancelamento da venda {sale.sale_number}. Motivo: {reason}"
                    )
            
            # 2. Reverter pontos de fidelidade
            if sale.customer_id:
                print("⭐ Revertendo pontos de fidelidade...")
                customer = await self.customer_repo.get(self.db, sale.customer_id)
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
                    
                    # Atualizar customer com atribuição direta
                    customer.loyalty_points = float(max(0, new_loyalty_points))
                    customer.total_spent = float(max(0, new_total_spent))
                    customer.total_purchases = new_total_purchases
            
            # 3. Atualizar status da venda
            sale.status = SaleStatus.CANCELLED.value
            sale.notes = f"{sale.notes or ''}\n[CANCELADA] {reason}".strip()
            
            await self.db.commit()
            await self.db.refresh(sale)
            
            print(f"✅ Venda {sale.sale_number} cancelada com sucesso!")
            return sale
            
        except Exception as e:
            print(f"❌ Erro ao cancelar venda: {str(e)}")
            await self.db.rollback()
            raise e
    
    async def get_sale(self, sale_id: int) -> Optional[Sale]:
        """
        Busca uma venda por ID com relacionamentos.
        
        Args:
            sale_id: ID da venda
            
        Returns:
            Optional[Sale]: Venda encontrada ou None
        """
        return await self.sale_repo.get(self.db, sale_id)
    
    async def get_sale_by_number(self, sale_number: str) -> Optional[Sale]:
        """
        Busca uma venda pelo número.
        
        Args:
            sale_number: Número da venda
            
        Returns:
            Optional[Sale]: Venda encontrada ou None
        """
        return await self.sale_repo.get_by_sale_number(sale_number)
    
    async def list_sales(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[SaleStatus] = None,
        customer_id: Optional[int] = None,
        seller_id: Optional[int] = None
    ) -> List[Sale]:
        """
        Lista vendas com filtros.
        
        Args:
            skip: Número de registros para pular
            limit: Número máximo de registros
            status: Filtrar por status
            customer_id: Filtrar por cliente
            seller_id: Filtrar por vendedor
            
        Returns:
            List[Sale]: Lista de vendas
        """
        if customer_id:
            return await self.sale_repo.get_by_customer(customer_id)
        
        if seller_id:
            return await self.sale_repo.get_by_seller(seller_id)
        
        return await self.sale_repo.get_multi(self.db, skip=skip, limit=limit)
    
    async def get_daily_report(self, date: datetime = None) -> Dict:
        """
        Gera relatório de vendas do dia.
        
        Args:
            date: Data do relatório (padrão: hoje)
            
        Returns:
            Dict: Relatório com totais e estatísticas
        """
        if date is None:
            date = datetime.utcnow().date()
        else:
            date = date.date() if isinstance(date, datetime) else date
        
        # Total do dia
        daily_total = await self.sale_repo.get_daily_total(date)
        
        # Vendas do período
        sales = await self.sale_repo.get_by_date_range(date, date)
        
        # Estatísticas
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
        end_date: datetime
    ) -> Dict:
        """
        Gera relatório de vendas por período.
        
        Args:
            start_date: Data inicial
            end_date: Data final
            
        Returns:
            Dict: Relatório com estatísticas completas
        """
        return await self.sale_repo.get_sales_report(
            start_date.date() if isinstance(start_date, datetime) else start_date,
            end_date.date() if isinstance(end_date, datetime) else end_date
        )
    
    async def get_top_products(self, limit: int = 10) -> List[Dict]:
        """
        Lista produtos mais vendidos.
        
        Args:
            limit: Número de produtos
            
        Returns:
            List[Dict]: Lista de produtos com quantidades
        """
        return await self.sale_repo.get_top_products(limit)
    
    async def get_daily_total(self, date: datetime = None) -> Decimal:
        """
        Total de vendas do dia.
        
        Args:
            date: Data para consulta (padrão: hoje)
            
        Returns:
            Decimal: Total de vendas
        """
        if date is None:
            date = datetime.utcnow().date()
        else:
            date = date.date() if isinstance(date, datetime) else date
        
        total = await self.sale_repo.get_daily_total(date)
        return Decimal(str(total)) if total else Decimal('0')
    
    async def get_sales_by_period(
        self,
        start_date: datetime,
        end_date: datetime,
        include_relationships: bool = True
    ) -> List[Sale]:
        """
        Vendas por período.
        
        Args:
            start_date: Data inicial
            end_date: Data final
            include_relationships: Se deve incluir items e payments
            
        Returns:
            List[Sale]: Lista de vendas do período
        """
        start = start_date.date() if isinstance(start_date, datetime) else start_date
        end = end_date.date() if isinstance(end_date, datetime) else end_date
        
        return await self.sale_repo.get_by_date_range(
            start,
            end,
            include_relationships=include_relationships
        )
