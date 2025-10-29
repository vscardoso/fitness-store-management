"""
Repositório para operações de clientes (Customer).
"""
from typing import Any, Optional, Sequence
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer import Customer
from app.repositories.base import BaseRepository


class CustomerRepository(BaseRepository[Customer, Any, Any]):
    """Repositório para operações específicas de clientes."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(Customer)
        self.db = db
    
    async def create(self, obj_in: dict) -> Customer:
        """Wrapper para criar cliente."""
        return await super().create(self.db, obj_in)
    
    async def get_by_email(self, email: str) -> Optional[Customer]:
        """
        Busca um cliente pelo email.
        
        Args:
            email: Email do cliente
            
        Returns:
            Cliente encontrado ou None
        """
        query = select(Customer).where(Customer.email == email)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_phone(self, phone: str) -> Optional[Customer]:
        """
        Busca um cliente pelo telefone.
        
        Args:
            phone: Telefone do cliente
            
        Returns:
            Cliente encontrado ou None
        """
        query = select(Customer).where(Customer.phone == phone)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_cpf(self, cpf: str) -> Optional[Customer]:
        """
        Busca um cliente pelo CPF.
        
        Args:
            cpf: CPF do cliente
            
        Returns:
            Cliente encontrado ou None
        """
        query = select(Customer).where(Customer.document_number == cpf)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def search(
        self, 
        query: str,
        include_addresses: bool = False
    ) -> Sequence[Customer]:
        """
        Busca clientes por nome, email ou telefone.
        
        Args:
            query: Termo de busca
            include_addresses: Se deve incluir endereços
            
        Returns:
            Lista de clientes encontrados
        """
        search_term = f"%{query.lower()}%"
        
        sql_query = select(Customer).where(
            or_(
                Customer.full_name.ilike(search_term),
                Customer.email.ilike(search_term),
                Customer.phone.ilike(search_term)
            )
        ).order_by(Customer.full_name)
        
        if include_addresses:
            sql_query = sql_query.options(selectinload(Customer.addresses))
        
        result = await self.db.execute(sql_query)
        return result.scalars().all()
    
    async def get_with_addresses(self, customer_id: int) -> Optional[Customer]:
        """
        Busca um cliente específico com todos os endereços carregados.
        
        Args:
            customer_id: ID do cliente
            
        Returns:
            Cliente com endereços ou None se não encontrado
        """
        query = select(Customer).where(Customer.id == customer_id).options(
            selectinload(Customer.addresses)
        )
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_active_customers(
        self, 
        include_addresses: bool = False
    ) -> Sequence[Customer]:
        """
        Busca todos os clientes ativos.
        
        Args:
            include_addresses: Se deve incluir endereços
            
        Returns:
            Lista de clientes ativos
        """
        query = select(Customer).where(Customer.is_active == True).order_by(Customer.name)
        
        if include_addresses:
            query = query.options(selectinload(Customer.addresses))
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_customers_by_city(
        self, 
        city: str,
        include_addresses: bool = True
    ) -> Sequence[Customer]:
        """
        Busca clientes por cidade através dos endereços.
        
        Args:
            city: Nome da cidade
            include_addresses: Se deve incluir endereços
            
        Returns:
            Lista de clientes da cidade
        """
        from app.models.customer import Address
        
        query = (
            select(Customer)
            .join(Address, Customer.id == Address.customer_id)
            .where(Address.city.ilike(f"%{city}%"))
            .distinct()
            .order_by(Customer.name)
        )
        
        if include_addresses:
            query = query.options(selectinload(Customer.addresses))
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_customers_by_state(
        self, 
        state: str,
        include_addresses: bool = True
    ) -> Sequence[Customer]:
        """
        Busca clientes por estado através dos endereços.
        
        Args:
            state: Sigla ou nome do estado
            include_addresses: Se deve incluir endereços
            
        Returns:
            Lista de clientes do estado
        """
        from app.models.customer import Address
        
        query = (
            select(Customer)
            .join(Address, Customer.id == Address.customer_id)
            .where(Address.state.ilike(f"%{state}%"))
            .distinct()
            .order_by(Customer.name)
        )
        
        if include_addresses:
            query = query.options(selectinload(Customer.addresses))
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def exists_by_email(self, email: str, exclude_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente com o email especificado.
        
        Args:
            email: Email a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)
            
        Returns:
            True se o email já existe
        """
        conditions = [Customer.email == email]
        
        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)
        
        query = select(Customer.id).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def exists_by_cpf(self, cpf: str, exclude_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente com o CPF especificado.
        
        Args:
            cpf: CPF a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)
            
        Returns:
            True se o CPF já existe
        """
        conditions = [Customer.document_number == cpf]
        
        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)
        
        query = select(Customer.id).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def exists_by_phone(self, phone: str, exclude_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente com o telefone especificado.
        
        Args:
            phone: Telefone a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)
            
        Returns:
            True se o telefone já existe
        """
        conditions = [Customer.phone == phone]
        
        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)
        
        query = select(Customer.id).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def get_customers_with_sales(
        self, 
        include_addresses: bool = False
    ) -> Sequence[Customer]:
        """
        Busca clientes que fizeram pelo menos uma compra.
        
        Args:
            include_addresses: Se deve incluir endereços
            
        Returns:
            Lista de clientes com vendas
        """
        from app.models.sale import Sale
        
        query = (
            select(Customer)
            .join(Sale, Customer.id == Sale.customer_id)
            .distinct()
            .order_by(Customer.name)
        )
        
        if include_addresses:
            query = query.options(selectinload(Customer.addresses))
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_top_customers(
        self, 
        limit: int = 10,
        include_addresses: bool = False
    ) -> Sequence[Customer]:
        """
        Busca os melhores clientes por valor total de compras.
        
        Args:
            limit: Número máximo de clientes a retornar
            include_addresses: Se deve incluir endereços
            
        Returns:
            Lista dos melhores clientes
        """
        from app.models.sale import Sale
        from sqlalchemy import func, desc
        
        subquery = (
            select(
                Sale.customer_id,
                func.sum(Sale.total_amount).label('total_spent')
            )
            .group_by(Sale.customer_id)
            .subquery()
        )
        
        query = (
            select(Customer)
            .join(subquery, Customer.id == subquery.c.customer_id)
            .order_by(desc(subquery.c.total_spent))
            .limit(limit)
        )
        
        if include_addresses:
            query = query.options(selectinload(Customer.addresses))
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def deactivate_customer(self, customer_id: int) -> bool:
        """
        Desativa um cliente (soft delete).
        
        Args:
            customer_id: ID do cliente
            
        Returns:
            True se o cliente foi desativado com sucesso
        """
        customer = await self.get(customer_id)
        if customer:
            customer.is_active = False
            await self.db.commit()
            return True
        return False
    
    async def activate_customer(self, customer_id: int) -> bool:
        """
        Ativa um cliente.
        
        Args:
            customer_id: ID do cliente
            
        Returns:
            True se o cliente foi ativado com sucesso
        """
        customer = await self.get(customer_id)
        if customer:
            customer.is_active = True
            await self.db.commit()
            return True
        return False