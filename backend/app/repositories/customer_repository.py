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

    async def get(self, customer_id: int) -> Optional[Customer]:
        """Wrapper para buscar cliente por ID."""
        return await super().get(self.db, customer_id)

    async def get_multi(
        self,
        skip: int = 0,
        limit: int = 100,
        filters: Optional[dict] = None
    ) -> Sequence[Customer]:
        """Wrapper para buscar múltiplos clientes."""
        return await super().get_multi(self.db, skip=skip, limit=limit, filters=filters)

    async def update(self, customer_id: int, obj_in: dict) -> Optional[Customer]:
        """Wrapper para atualizar cliente."""
        return await super().update(self.db, id=customer_id, obj_in=obj_in)

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
        query = select(Customer).where(
            Customer.email == email,
            Customer.is_active == True
        )
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
        query = select(Customer).where(
            Customer.phone == phone,
            Customer.is_active == True
        )
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
        query = select(Customer).where(
            Customer.document_number == cpf,
            Customer.is_active == True
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def search(
        self,
        query: str,
        skip: int = 0,
        limit: int = 100
    ) -> Sequence[Customer]:
        """
        Busca clientes por nome, email ou telefone.

        Args:
            query: Termo de busca
            skip: Número de registros a pular
            limit: Número máximo de registros

        Returns:
            Lista de clientes encontrados
        """
        search_term = f"%{query.lower()}%"

        sql_query = (
            select(Customer)
            .where(
                Customer.is_active == True,
                or_(
                    Customer.full_name.ilike(search_term),
                    Customer.email.ilike(search_term),
                    Customer.phone.ilike(search_term)
                )
            )
            .order_by(Customer.full_name)
            .offset(skip)
            .limit(limit)
        )

        result = await self.db.execute(sql_query)
        return result.scalars().all()
    
    async def get_with_sales(self, customer_id: int) -> Optional[Customer]:
        """
        Busca um cliente específico com histórico de vendas carregado.

        Args:
            customer_id: ID do cliente

        Returns:
            Cliente com vendas ou None se não encontrado
        """
        query = select(Customer).where(Customer.id == customer_id).options(
            selectinload(Customer.sales)
        )

        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_active_customers(self) -> Sequence[Customer]:
        """
        Busca todos os clientes ativos.

        Returns:
            Lista de clientes ativos
        """
        query = select(Customer).where(Customer.is_active == True).order_by(Customer.full_name)

        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_customers_by_city(self, city: str) -> Sequence[Customer]:
        """
        Busca clientes por cidade.

        Args:
            city: Nome da cidade

        Returns:
            Lista de clientes da cidade
        """
        query = (
            select(Customer)
            .where(
                Customer.is_active == True,
                Customer.city.ilike(f"%{city}%")
            )
            .order_by(Customer.full_name)
        )

        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_customers_by_state(self, state: str) -> Sequence[Customer]:
        """
        Busca clientes por estado.

        Args:
            state: Sigla ou nome do estado

        Returns:
            Lista de clientes do estado
        """
        query = (
            select(Customer)
            .where(
                Customer.is_active == True,
                Customer.state.ilike(f"%{state}%")
            )
            .order_by(Customer.full_name)
        )

        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def exists_by_email(self, email: str, exclude_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente ativo com o email especificado.

        Args:
            email: Email a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)

        Returns:
            True se o email já existe
        """
        conditions = [
            Customer.email == email,
            Customer.is_active == True
        ]

        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)

        query = select(Customer.id).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def exists_by_cpf(self, cpf: str, exclude_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente ativo com o CPF especificado.

        Args:
            cpf: CPF a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)

        Returns:
            True se o CPF já existe
        """
        conditions = [
            Customer.document_number == cpf,
            Customer.is_active == True
        ]

        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)

        query = select(Customer.id).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def exists_by_phone(self, phone: str, exclude_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente ativo com o telefone especificado.

        Args:
            phone: Telefone a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)

        Returns:
            True se o telefone já existe
        """
        conditions = [
            Customer.phone == phone,
            Customer.is_active == True
        ]

        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)

        query = select(Customer.id).where(*conditions)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def get_customers_with_sales(self) -> Sequence[Customer]:
        """
        Busca clientes que fizeram pelo menos uma compra.

        Returns:
            Lista de clientes com vendas
        """
        from app.models.sale import Sale

        query = (
            select(Customer)
            .join(Sale, Customer.id == Sale.customer_id)
            .where(Customer.is_active == True)
            .distinct()
            .order_by(Customer.full_name)
        )

        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_top_customers(self, limit: int = 10) -> Sequence[Customer]:
        """
        Busca os melhores clientes por valor total de compras.

        Args:
            limit: Número máximo de clientes a retornar

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
            .where(Sale.is_active == True)
            .group_by(Sale.customer_id)
            .subquery()
        )

        query = (
            select(Customer)
            .join(subquery, Customer.id == subquery.c.customer_id)
            .where(Customer.is_active == True)
            .order_by(desc(subquery.c.total_spent))
            .limit(limit)
        )

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