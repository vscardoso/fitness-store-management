"""
Serviço de gerenciamento de clientes.
"""
from typing import Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.repositories.customer_repository import CustomerRepository
from app.repositories.sale_repository import SaleRepository
from app.schemas.customer import CustomerCreate, CustomerUpdate


class CustomerService:
    """Serviço para operações de negócio com clientes."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de clientes.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.customer_repo = CustomerRepository(db)
        self.sale_repo = SaleRepository(db)
    
    async def create_customer(self, customer_data: CustomerCreate) -> Customer:
        """
        Cria um novo cliente.
        
        Args:
            customer_data: Dados do cliente
            
        Returns:
            Customer: Cliente criado
            
        Raises:
            ValueError: Se email ou CPF já cadastrados
        """
        try:
            # Validar email único
            if customer_data.email:
                existing = await self.customer_repo.get_by_email(self.db, customer_data.email)
                if existing:
                    raise ValueError(f"Email {customer_data.email} já cadastrado")
            
            # Validar CPF/documento único
            if customer_data.document_number:
                existing = await self.customer_repo.get_by_cpf(self.db, customer_data.document_number)
                if existing:
                    raise ValueError(f"CPF/Documento {customer_data.document_number} já cadastrado")
            
            # Criar cliente
            customer_dict = customer_data.model_dump(exclude_unset=True)
            
            # Inicializar campos de fidelidade se não fornecidos
            if 'loyalty_points' not in customer_dict:
                customer_dict['loyalty_points'] = 0.0
            if 'total_spent' not in customer_dict:
                customer_dict['total_spent'] = 0.0
            if 'total_purchases' not in customer_dict:
                customer_dict['total_purchases'] = 0
            if 'is_active' not in customer_dict:
                customer_dict['is_active'] = True
            
            customer = await self.customer_repo.create(self.db, customer_dict)
            
            await self.db.commit()
            await self.db.refresh(customer)
            
            return customer
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def update_customer(
        self, 
        customer_id: int, 
        customer_data: CustomerUpdate
    ) -> Customer:
        """
        Atualiza um cliente existente.
        
        Args:
            customer_id: ID do cliente
            customer_data: Dados para atualização
            
        Returns:
            Customer: Cliente atualizado
            
        Raises:
            ValueError: Se cliente não encontrado ou email/CPF duplicados
        """
        try:
            customer = await self.customer_repo.get(self.db, customer_id)
            if not customer:
                raise ValueError("Cliente não encontrado")
            
            update_dict = customer_data.model_dump(exclude_unset=True)
            
            # Validar email único se alterado
            if 'email' in update_dict and update_dict['email']:
                if update_dict['email'] != customer.email:
                    existing = await self.customer_repo.get_by_email(self.db, update_dict['email'])
                    if existing and existing.id != customer_id:
                        raise ValueError(f"Email {update_dict['email']} já cadastrado")
            
            # Validar CPF único se alterado
            if 'document_number' in update_dict and update_dict['document_number']:
                if update_dict['document_number'] != customer.document_number:
                    existing = await self.customer_repo.get_by_cpf(self.db, update_dict['document_number'])
                    if existing and existing.id != customer_id:
                        raise ValueError(f"CPF/Documento {update_dict['document_number']} já cadastrado")
            
            # Atualizar atributos
            for key, value in update_dict.items():
                setattr(customer, key, value)
            
            await self.db.commit()
            await self.db.refresh(customer)
            return customer
            
            return updated
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def delete_customer(self, customer_id: int) -> bool:
        """
        Deleta um cliente (soft delete).
        
        Args:
            customer_id: ID do cliente
            
        Returns:
            bool: True se deletado com sucesso
            
        Raises:
            ValueError: Se cliente não encontrado ou possui vendas
        """
        try:
            customer = await self.customer_repo.get(self.db, customer_id)
            if not customer:
                raise ValueError("Cliente não encontrado")
            
            # Verificar se tem vendas
            sales = await self.sale_repo.get_by_customer(customer_id)
            if sales:
                raise ValueError(
                    f"Cliente possui {len(sales)} venda(s) registrada(s). "
                    "Não é possível deletar."
                )
            
            # Soft delete
            customer.is_active = False
            
            await self.db.commit()
            return True
            return True
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def get_customer(self, customer_id: int) -> Optional[Customer]:
        """
        Busca um cliente por ID.
        
        Args:
            customer_id: ID do cliente
            
        Returns:
            Optional[Customer]: Cliente encontrado ou None
        """
        return await self.customer_repo.get(self.db, customer_id)
    
    async def get_customer_by_email(self, email: str) -> Optional[Customer]:
        """
        Busca um cliente por email.
        
        Args:
            email: Email do cliente
            
        Returns:
            Optional[Customer]: Cliente encontrado ou None
        """
        return await self.customer_repo.get_by_email(self.db, email)
    
    async def get_customer_by_cpf(self, document_number: str) -> Optional[Customer]:
        """
        Busca um cliente por CPF/documento.
        
        Args:
            document_number: CPF ou documento do cliente
            
        Returns:
            Optional[Customer]: Cliente encontrado ou None
        """
        return await self.customer_repo.get_by_cpf(self.db, document_number)
    
    async def search_customers(
        self, 
        query: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[Customer]:
        """
        Busca clientes por termo de pesquisa.
        
        Busca em: nome, email e telefone.
        
        Args:
            query: Termo de pesquisa
            skip: Número de registros para pular
            limit: Número máximo de registros
            
        Returns:
            List[Customer]: Lista de clientes encontrados
        """
        return await self.customer_repo.search(self.db, query)
    
    async def list_customers(
        self,
        skip: int = 0,
        limit: int = 100,
        active_only: bool = True
    ) -> List[Customer]:
        """
        Lista clientes com paginação.
        
        Args:
            skip: Número de registros para pular
            limit: Número máximo de registros
            active_only: Se deve retornar apenas clientes ativos
            
        Returns:
            List[Customer]: Lista de clientes
        """
        customers = await self.customer_repo.get_multi(self.db, skip=skip, limit=limit)
        
        if active_only:
            customers = [c for c in customers if c.is_active]
        
        return customers
    
    async def get_customer_with_history(
        self, 
        customer_id: int
    ) -> Dict:
        """
        Busca cliente com histórico de compras.
        
        Args:
            customer_id: ID do cliente
            
        Returns:
            Dict: Cliente com histórico completo
            
        Raises:
            ValueError: Se cliente não encontrado
        """
        customer = await self.customer_repo.get(self.db, customer_id)
        if not customer:
            raise ValueError("Cliente não encontrado")
        
        # Buscar histórico de vendas
        sales = await self.sale_repo.get_by_customer(customer_id)
        
        # Calcular estatísticas
        total_sales = len(sales)
        completed_sales = [s for s in sales if s.status == 'COMPLETED']
        
        return {
            'customer': customer,
            'statistics': {
                'total_purchases': customer.total_purchases,
                'total_spent': float(customer.total_spent),
                'loyalty_points': float(customer.loyalty_points),
                'average_ticket': (
                    float(customer.total_spent / customer.total_purchases)
                    if customer.total_purchases > 0
                    else 0
                ),
                'total_sales_history': total_sales,
                'completed_sales': len(completed_sales)
            },
            'recent_sales': sales[:10] if sales else []  # Últimas 10 vendas
        }
    
    async def add_loyalty_points(
        self,
        customer_id: int,
        points: float,
        reason: str = None
    ) -> Customer:
        """
        Adiciona pontos de fidelidade manualmente.
        
        Args:
            customer_id: ID do cliente
            points: Pontos a adicionar
            reason: Motivo da adição
            
        Returns:
            Customer: Cliente atualizado
            
        Raises:
            ValueError: Se cliente não encontrado ou pontos inválidos
        """
        if points <= 0:
            raise ValueError("Pontos devem ser maiores que zero")
        
        try:
            customer = await self.customer_repo.get(self.db, customer_id)
            if not customer:
                raise ValueError("Cliente não encontrado")
            
            new_points = float(customer.loyalty_points) + points
            customer.loyalty_points = new_points
            
            await self.db.commit()
            await self.db.refresh(customer)
            
            return customer
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def redeem_loyalty_points(
        self,
        customer_id: int,
        points: float
    ) -> Customer:
        """
        Resgata pontos de fidelidade.
        
        Args:
            customer_id: ID do cliente
            points: Pontos a resgatar
            
        Returns:
            Customer: Cliente atualizado
            
        Raises:
            ValueError: Se cliente não encontrado ou pontos insuficientes
        """
        if points <= 0:
            raise ValueError("Pontos devem ser maiores que zero")
        
        try:
            customer = await self.customer_repo.get(self.db, customer_id)
            if not customer:
                raise ValueError("Cliente não encontrado")
            
            if customer.loyalty_points < points:
                raise ValueError(
                    f"Pontos insuficientes. "
                    f"Disponível: {customer.loyalty_points}, Solicitado: {points}"
                )
            
            new_points = float(customer.loyalty_points) - points
            customer.loyalty_points = new_points
            
            await self.db.commit()
            await self.db.refresh(customer)
            
            return customer
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def get_top_customers(
        self,
        limit: int = 10,
        by: str = 'total_spent'
    ) -> List[Customer]:
        """
        Lista melhores clientes.
        
        Args:
            limit: Número de clientes
            by: Critério de ordenação ('total_spent' ou 'loyalty_points')
            
        Returns:
            List[Customer]: Lista de melhores clientes
        """
        return await self.customer_repo.get_top_customers(self.db, limit)
    
    async def get_customer_stats(self) -> Dict:
        """
        Obtém estatísticas gerais de clientes.
        
        Returns:
            Dict: Estatísticas de clientes
        """
        all_customers = await self.customer_repo.get_multi(self.db, skip=0, limit=10000)
        active_customers = [c for c in all_customers if c.is_active]
        
        vip_customers = [
            c for c in active_customers 
            if c.customer_type == 'VIP'
        ]
        
        total_loyalty_points = sum(c.loyalty_points for c in active_customers)
        total_spent = sum(c.total_spent for c in active_customers)
        
        return {
            'total_customers': len(all_customers),
            'active_customers': len(active_customers),
            'inactive_customers': len(all_customers) - len(active_customers),
            'vip_customers': len(vip_customers),
            'total_loyalty_points': float(total_loyalty_points),
            'total_spent_all_customers': float(total_spent),
            'average_spent_per_customer': (
                float(total_spent / len(active_customers))
                if active_customers
                else 0
            )
        }
    
    async def activate_customer(self, customer_id: int) -> bool:
        """
        Ativa um cliente desativado.
        
        Args:
            customer_id: ID do cliente
            
        Returns:
            bool: True se ativado com sucesso
            
        Raises:
            ValueError: Se cliente não encontrado
        """
        try:
            customer = await self.customer_repo.get(self.db, customer_id)
            if not customer:
                raise ValueError("Cliente não encontrado")
            
            customer.is_active = True
            
            await self.db.commit()
            return True
            return True
            
        except Exception as e:
            await self.db.rollback()
            raise e
