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
    
    async def get_by_email(self, db: AsyncSession, email: str, tenant_id: Optional[int] = None) -> Optional[Customer]:
        """
        Busca um cliente pelo email, opcionalmente filtrando por tenant.

        Args:
            db: Database session
            email: Email do cliente
            tenant_id: Tenant atual (opcional)

        Returns:
            Cliente encontrado ou None
        """
        conditions = [
            Customer.email == email,
            Customer.is_active == True
        ]
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)
        query = select(Customer).where(*conditions)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_phone(self, db: AsyncSession, phone: str, tenant_id: Optional[int] = None) -> Optional[Customer]:
        """
        Busca um cliente pelo telefone, opcionalmente filtrando por tenant.

        Args:
            db: Database session
            phone: Telefone do cliente
            tenant_id: Tenant atual (opcional)

        Returns:
            Cliente encontrado ou None
        """
        conditions = [
            Customer.phone == phone,
            Customer.is_active == True
        ]
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)
        query = select(Customer).where(*conditions)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_cpf(self, db: AsyncSession, cpf: str, tenant_id: Optional[int] = None) -> Optional[Customer]:
        """
        Busca um cliente pelo CPF.

        Args:
            db: Database session
            cpf: CPF do cliente
            tenant_id: Tenant atual (opcional)

        Returns:
            Cliente encontrado ou None
        """
        conditions = [
            Customer.document_number == cpf,
            Customer.is_active == True
        ]
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)
        query = select(Customer).where(*conditions)
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def search(
        self,
        db: AsyncSession,
        query: str,
        skip: int = 0,
        limit: int = 100,
        tenant_id: Optional[int] = None
    ) -> Sequence[Customer]:
        """
        Busca clientes por nome, email ou telefone.

        Args:
            db: Database session
            query: Termo de busca
            skip: Número de registros a pular
            limit: Número máximo de registros

        Returns:
            Lista de clientes encontrados
        """
        search_term = f"%{query.lower()}%"

        conditions = [
            Customer.is_active == True,
            or_(
                Customer.full_name.ilike(search_term),
                Customer.email.ilike(search_term),
                Customer.phone.ilike(search_term)
            )
        ]
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)

        sql_query = (
            select(Customer)
            .where(*conditions)
            .order_by(Customer.full_name)
            .offset(skip)
            .limit(limit)
        )

        result = await db.execute(sql_query)
        return result.scalars().all()
    
    async def get_with_sales(self, db: AsyncSession, customer_id: int, tenant_id: Optional[int] = None) -> Optional[Customer]:
        """
        Busca um cliente específico com histórico de vendas carregado.

        Args:
            db: Database session
            customer_id: ID do cliente
            tenant_id: Tenant atual (opcional)

        Returns:
            Cliente com vendas ou None se não encontrado
        """
        conditions = [Customer.id == customer_id]
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)
        query = select(Customer).where(*conditions).options(
            selectinload(Customer.sales)
        )

        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_active_customers(self, db: AsyncSession, tenant_id: Optional[int] = None) -> Sequence[Customer]:
        """
        Busca todos os clientes ativos.

        Args:
            db: Database session
            tenant_id: Tenant atual (opcional)

        Returns:
            Lista de clientes ativos
        """
        conditions = [Customer.is_active == True]
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)
        query = select(Customer).where(*conditions).order_by(Customer.full_name)

        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_customers_by_city(self, db: AsyncSession, city: str, tenant_id: Optional[int] = None) -> Sequence[Customer]:
        """
        Busca clientes por cidade.

        Args:
            db: Database session
            city: Nome da cidade
            tenant_id: Tenant atual (opcional)

        Returns:
            Lista de clientes da cidade
        """
        conditions = [
            Customer.is_active == True,
            Customer.city.ilike(f"%{city}%")
        ]
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)
        query = (
            select(Customer)
            .where(*conditions)
            .order_by(Customer.full_name)
        )

        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_customers_by_state(self, db: AsyncSession, state: str, tenant_id: Optional[int] = None) -> Sequence[Customer]:
        """
        Busca clientes por estado.

        Args:
            db: Database session
            state: Sigla ou nome do estado
            tenant_id: Tenant atual (opcional)

        Returns:
            Lista de clientes do estado
        """
        conditions = [
            Customer.is_active == True,
            Customer.state.ilike(f"%{state}%")
        ]
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)
        query = (
            select(Customer)
            .where(*conditions)
            .order_by(Customer.full_name)
        )

        result = await db.execute(query)
        return result.scalars().all()
    
    async def exists_by_email(self, db: AsyncSession, email: str, exclude_id: Optional[int] = None, tenant_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente ativo com o email especificado.

        Args:
            db: Database session
            email: Email a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)
            tenant_id: Tenant atual (opcional)

        Returns:
            True se o email já existe
        """
        conditions = [
            Customer.email == email,
            Customer.is_active == True
        ]

        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)

        query = select(Customer.id).where(*conditions)
        result = await db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def exists_by_cpf(self, db: AsyncSession, cpf: str, exclude_id: Optional[int] = None, tenant_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente ativo com o CPF especificado.

        Args:
            db: Database session
            cpf: CPF a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)
            tenant_id: Tenant atual (opcional)

        Returns:
            True se o CPF já existe
        """
        conditions = [
            Customer.document_number == cpf,
            Customer.is_active == True
        ]

        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)

        query = select(Customer.id).where(*conditions)
        result = await db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def exists_by_phone(self, db: AsyncSession, phone: str, exclude_id: Optional[int] = None, tenant_id: Optional[int] = None) -> bool:
        """
        Verifica se existe um cliente ativo com o telefone especificado.

        Args:
            db: Database session
            phone: Telefone a verificar
            exclude_id: ID do cliente a excluir da verificação (para updates)
            tenant_id: Tenant atual (opcional)

        Returns:
            True se o telefone já existe
        """
        conditions = [
            Customer.phone == phone,
            Customer.is_active == True
        ]

        if exclude_id is not None:
            conditions.append(Customer.id != exclude_id)
        if tenant_id is not None:
            conditions.append(Customer.tenant_id == tenant_id)

        query = select(Customer.id).where(*conditions)
        result = await db.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def get_customers_with_sales(self, db: AsyncSession, tenant_id: Optional[int] = None) -> Sequence[Customer]:
        """
        Busca clientes que fizeram pelo menos uma compra.

        Args:
            db: Database session
            tenant_id: Tenant atual (opcional)

        Returns:
            Lista de clientes com vendas
        """
        from app.models.sale import Sale

        conditions = [Customer.is_active == True]
        if tenant_id is not None:
            conditions.extend([Customer.tenant_id == tenant_id, Sale.tenant_id == tenant_id])

        query = (
            select(Customer)
            .join(Sale, Customer.id == Sale.customer_id)
            .where(*conditions)
            .distinct()
            .order_by(Customer.full_name)
        )

        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_top_customers(self, db: AsyncSession, limit: int = 10, tenant_id: Optional[int] = None) -> Sequence[Customer]:
        """
        Busca os melhores clientes por valor total de compras.

        Args:
            db: Database session
            limit: Número máximo de clientes a retornar
            tenant_id: Tenant atual (opcional)

        Returns:
            Lista dos melhores clientes
        """
        from app.models.sale import Sale
        from sqlalchemy import func, desc

        subquery_conditions = [Sale.is_active == True]
        if tenant_id is not None:
            subquery_conditions.append(Sale.tenant_id == tenant_id)

        subquery = (
            select(
                Sale.customer_id,
                func.sum(Sale.total_amount).label('total_spent')
            )
            .where(*subquery_conditions)
            .group_by(Sale.customer_id)
            .subquery()
        )

        query_conditions = [Customer.is_active == True]
        if tenant_id is not None:
            query_conditions.append(Customer.tenant_id == tenant_id)

        query = (
            select(Customer)
            .join(subquery, Customer.id == subquery.c.customer_id)
            .where(*query_conditions)
            .order_by(desc(subquery.c.total_spent))
            .limit(limit)
        )

        result = await db.execute(query)
        return result.scalars().all()
    
    async def deactivate_customer(self, db: AsyncSession, customer_id: int) -> bool:
        """
        Desativa um cliente (soft delete).
        
        Args:
            db: Database session
            customer_id: ID do cliente
            
        Returns:
            True se o cliente foi desativado com sucesso
        """
        customer = await self.get(db, customer_id)
        if customer:
            customer.is_active = False
            await db.commit()
            return True
        return False
    
    async def activate_customer(self, db: AsyncSession, customer_id: int) -> bool:
        """
        Ativa um cliente.
        
        Args:
            db: Database session
            customer_id: ID do cliente
            
        Returns:
            True se o cliente foi ativado com sucesso
        """
        customer = await self.get(db, customer_id)
        if customer:
            customer.is_active = True
            await db.commit()
            return True
        return False