"""
Repositório para operações de vendas (Sale).
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Optional, Sequence
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.sale import Sale, SaleItem
from app.models.product import Product
from app.repositories.base import BaseRepository


class SaleRepository(BaseRepository[Sale, Any, Any]):
    """Repositório para operações específicas de vendas."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(Sale)
        self.db = db
    
    async def create(self, obj_in: dict) -> Sale:
        """Wrapper para criar venda."""
        return await super().create(self.db, obj_in)
    
    async def get_multi(
        self,
        *,
        skip: int = 0,
        limit: int = 100
    ) -> List[Sale]:
        """
        Wrapper para get_multi usando self.db.
        
        Args:
            skip: Número de registros para pular
            limit: Limite de registros
            
        Returns:
            Lista de vendas
        """
        return await super().get_multi(self.db, skip=skip, limit=limit)
    
    async def get_by_date_range(
        self, 
        start_date: date, 
        end_date: date,
        include_relationships: bool = True
    ) -> Sequence[Sale]:
        """
        Busca vendas em um intervalo de datas.
        
        Args:
            start_date: Data inicial
            end_date: Data final
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de vendas no período
        """
        query = select(Sale).where(
            and_(
                func.date(Sale.created_at) >= start_date,
                func.date(Sale.created_at) <= end_date
            )
        ).order_by(desc(Sale.created_at))
        
        if include_relationships:
            query = query.options(
                selectinload(Sale.items).selectinload(SaleItem.product),
                selectinload(Sale.payments),
                selectinload(Sale.customer)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_by_customer(
        self, 
        customer_id: int,
        include_relationships: bool = True
    ) -> Sequence[Sale]:
        """
        Busca vendas de um cliente específico.
        
        Args:
            customer_id: ID do cliente
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de vendas do cliente
        """
        query = select(Sale).where(
            Sale.customer_id == customer_id
        ).order_by(desc(Sale.created_at))
        
        if include_relationships:
            query = query.options(
                selectinload(Sale.items).selectinload(SaleItem.product),
                selectinload(Sale.payments),
                selectinload(Sale.customer)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_daily_total(self, target_date: date) -> Decimal:
        """
        Calcula o total de vendas de um dia específico.
        
        Args:
            target_date: Data para calcular o total
            
        Returns:
            Total de vendas do dia
        """
        query = select(func.sum(Sale.total_amount)).where(
            func.date(Sale.created_at) == target_date
        )
        
        result = await self.db.execute(query)
        total = result.scalar()
        return Decimal(str(total)) if total is not None else Decimal('0.00')
    
    async def get_top_products(self, limit: int = 10) -> List[dict]:
        """
        Busca os produtos mais vendidos.
        
        Args:
            limit: Número máximo de produtos a retornar
            
        Returns:
            Lista com produtos e quantidades vendidas
        """
        query = (
            select(
                Product.id,
                Product.name,
                Product.brand,
                func.sum(SaleItem.quantity).label('total_quantity'),
                func.sum(SaleItem.subtotal).label('total_revenue')
            )
            .select_from(SaleItem)
            .join(Product, SaleItem.product_id == Product.id)
            .group_by(Product.id, Product.name, Product.brand)
            .order_by(desc('total_quantity'))
            .limit(limit)
        )
        
        result = await self.db.execute(query)
        rows = result.all()
        
        return [
            {
                'product_id': row.id,
                'product_name': row.name,
                'brand': row.brand,
                'total_quantity': int(row.total_quantity),
                'total_revenue': Decimal(str(row.total_revenue))
            }
            for row in rows
        ]
    
    async def get_by_seller(
        self, 
        seller_id: int,
        include_relationships: bool = True
    ) -> Sequence[Sale]:
        """
        Busca vendas de um vendedor específico.
        
        Args:
            seller_id: ID do vendedor
            include_relationships: Se deve incluir relacionamentos
            
        Returns:
            Lista de vendas do vendedor
        """
        query = select(Sale).where(
            Sale.seller_id == seller_id
        ).order_by(desc(Sale.created_at))
        
        if include_relationships:
            query = query.options(
                selectinload(Sale.items).selectinload(SaleItem.product),
                selectinload(Sale.payments),
                selectinload(Sale.customer)
            )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_with_relationships(self, sale_id: int) -> Optional[Sale]:
        """
        Busca uma venda específica com todos os relacionamentos carregados.
        
        Args:
            sale_id: ID da venda
            
        Returns:
            Venda com relacionamentos ou None se não encontrada
        """
        query = select(Sale).where(Sale.id == sale_id).options(
            selectinload(Sale.items).selectinload(SaleItem.product),
            selectinload(Sale.payments),
            selectinload(Sale.customer)
        )
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_sales_summary(
        self, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> dict:
        """
        Gera um resumo das vendas para um período.
        
        Args:
            start_date: Data inicial (opcional)
            end_date: Data final (opcional)
            
        Returns:
            Dicionário com resumo das vendas
        """
        conditions = []
        if start_date:
            conditions.append(func.date(Sale.created_at) >= start_date)
        if end_date:
            conditions.append(func.date(Sale.created_at) <= end_date)
        
        where_clause = and_(*conditions) if conditions else True
        
        # Query para estatísticas gerais
        stats_query = select(
            func.count(Sale.id).label('total_sales'),
            func.sum(Sale.total_amount).label('total_revenue'),
            func.avg(Sale.total_amount).label('average_sale'),
            func.min(Sale.total_amount).label('min_sale'),
            func.max(Sale.total_amount).label('max_sale')
        ).where(where_clause)
        
        result = await self.db.execute(stats_query)
        stats = result.first()
        
        return {
            'total_sales': int(stats.total_sales) if stats.total_sales else 0,
            'total_revenue': Decimal(str(stats.total_revenue)) if stats.total_revenue else Decimal('0.00'),
            'average_sale': Decimal(str(stats.average_sale)) if stats.average_sale else Decimal('0.00'),
            'min_sale': Decimal(str(stats.min_sale)) if stats.min_sale else Decimal('0.00'),
            'max_sale': Decimal(str(stats.max_sale)) if stats.max_sale else Decimal('0.00'),
            'period': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None
            }
        }
    
    async def get_monthly_sales(self, year: int) -> List[dict]:
        """
        Busca vendas agrupadas por mês para um ano específico.
        
        Args:
            year: Ano para buscar as vendas
            
        Returns:
            Lista com vendas por mês
        """
        query = (
            select(
                func.extract('month', Sale.created_at).label('month'),
                func.count(Sale.id).label('total_sales'),
                func.sum(Sale.total_amount).label('total_revenue')
            )
            .where(func.extract('year', Sale.created_at) == year)
            .group_by(func.extract('month', Sale.created_at))
            .order_by('month')
        )
        
        result = await self.db.execute(query)
        rows = result.all()
        
        # Criar lista com todos os meses (1-12)
        monthly_data = []
        for month in range(1, 13):
            month_data = next(
                (row for row in rows if int(row.month) == month), 
                None
            )
            
            if month_data:
                monthly_data.append({
                    'month': month,
                    'total_sales': int(month_data.total_sales),
                    'total_revenue': Decimal(str(month_data.total_revenue))
                })
            else:
                monthly_data.append({
                    'month': month,
                    'total_sales': 0,
                    'total_revenue': Decimal('0.00')
                })
        
        return monthly_data
