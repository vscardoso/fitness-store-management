"""
Repository para operações de EntryItem.
"""
from typing import Optional, Sequence
from decimal import Decimal
from sqlalchemy import select, and_, update as sql_update, case, Float
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import SQLAlchemyError

from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.stock_entry import StockEntry
from app.repositories.base import BaseRepository


class EntryItemRepository(BaseRepository[EntryItem, dict, dict]):
    """Repository para operações específicas de EntryItem."""
    
    def __init__(self):
        super().__init__(EntryItem)
    
    async def create(self, db: AsyncSession, data: dict) -> EntryItem:
        """
        Cria um novo item de entrada.
        
        Args:
            db: Database session
            data: Dados do item
            
        Returns:
            EntryItem criado
        """
        # Garantir que quantity_remaining seja igual a quantity_received na criação
        if 'quantity_remaining' not in data:
            data['quantity_remaining'] = data.get('quantity_received', 0)
        
        item = await super().create(db, data)
        await db.commit()
        await db.refresh(item)
        return item
    
    async def get_by_id(
        self, 
        db: AsyncSession, 
        item_id: int,
        include_relations: bool = False
    ) -> Optional[EntryItem]:
        """
        Busca um item por ID.
        
        Args:
            db: Database session
            item_id: ID do item
            include_relations: Se deve incluir product e stock_entry
            
        Returns:
            EntryItem encontrado ou None
        """
        query = select(EntryItem).where(
            and_(
                EntryItem.id == item_id,
                EntryItem.is_active == True
            )
        )
        
        if include_relations:
            query = query.options(
                selectinload(EntryItem.product),
                selectinload(EntryItem.stock_entry)
            )
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_entry(
        self, 
        db: AsyncSession, 
        entry_id: int,
        tenant_id: int
    ) -> Sequence[EntryItem]:
        """
        Busca todos os itens de uma entrada específica.
        
        Args:
            db: Database session
            entry_id: ID da entrada de estoque
            tenant_id: ID do tenant (multi-tenancy)
            
        Returns:
            Lista de itens da entrada
        """
        query = (
            select(EntryItem)
            .where(
                and_(
                    EntryItem.entry_id == entry_id,
                    EntryItem.tenant_id == tenant_id,
                    EntryItem.is_active == True
                )
            )
            .options(selectinload(EntryItem.product))
            .order_by(EntryItem.id)
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_by_product(
        self, 
        db: AsyncSession, 
        product_id: int
    ) -> Sequence[EntryItem]:
        """
        Busca todas as entradas de um produto específico.
        
        Args:
            db: Database session
            product_id: ID do produto
            
        Returns:
            Lista de itens do produto (todas as entradas)
        """
        query = (
            select(EntryItem)
            .where(
                and_(
                    EntryItem.product_id == product_id,
                    EntryItem.is_active == True
                )
            )
            .options(
                selectinload(EntryItem.stock_entry),
                selectinload(EntryItem.product)
            )
            .order_by(EntryItem.created_at.desc())
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_available_for_product(
        self, 
        db: AsyncSession, 
        product_id: int
    ) -> Sequence[EntryItem]:
        """
        Busca itens disponíveis de um produto (com estoque) ordenado por FIFO.
        
        Implementação do FIFO: retorna itens ordenados pela data de entrada
        (mais antigos primeiro) que ainda têm quantity_remaining > 0.
        
        Args:
            db: Database session
            product_id: ID do produto
            
        Returns:
            Lista de itens disponíveis ordenada por FIFO (mais antigos primeiro)
        """
        query = (
            select(EntryItem)
            .join(StockEntry, EntryItem.entry_id == StockEntry.id)
            .where(
                and_(
                    EntryItem.product_id == product_id,
                    EntryItem.quantity_remaining > 0,
                    EntryItem.is_active == True,
                    StockEntry.is_active == True
                )
            )
            .options(
                selectinload(EntryItem.stock_entry),
                selectinload(EntryItem.product)
            )
            .order_by(StockEntry.entry_date.asc(), EntryItem.created_at.asc())  # FIFO
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def decrease_quantity(
        self, 
        db: AsyncSession, 
        item_id: int, 
        quantity: int
    ) -> bool:
        """
        Diminui a quantidade restante de um item (usado em vendas - FIFO).
        
        IMPORTANTE: NÃO faz commit - a transação é gerenciada pelo service layer.
        Isso garante atomicidade: se houver erro na venda, o rollback reverte o estoque.
        
        Args:
            db: Database session
            item_id: ID do item
            quantity: Quantidade a diminuir
            
        Returns:
            True se sucesso, False se quantidade insuficiente
            
        Raises:
            ValueError: Se quantity for negativo ou zero
            SQLAlchemyError: Erro no banco de dados
        """
        if quantity <= 0:
            raise ValueError("Quantity must be positive")
        
        try:
            # Buscar item
            item = await self.get_by_id(db, item_id)
            if not item:
                return False
            
            # Verificar se há quantidade suficiente
            if item.quantity_remaining < quantity:
                return False
            
            # Atualizar quantidade (SEM COMMIT - deixar para o service layer)
            item.quantity_remaining -= quantity
            
            # Flush para refletir mudança na sessão sem commitar
            await db.flush()
            
            return True
            
        except SQLAlchemyError as e:
            # NÃO fazer rollback aqui - deixar para o service layer
            raise SQLAlchemyError(f"Error decreasing quantity for item {item_id}: {str(e)}")
    
    async def increase_quantity(
        self, 
        db: AsyncSession, 
        item_id: int, 
        quantity: int
    ) -> bool:
        """
        Aumenta a quantidade restante de um item (usado em devoluções).
        
        IMPORTANTE: NÃO faz commit - a transação é gerenciada pelo service layer.
        
        Args:
            db: Database session
            item_id: ID do item
            quantity: Quantidade a aumentar
            
        Returns:
            True se sucesso, False se item não encontrado
            
        Raises:
            ValueError: Se quantity for negativo ou exceder quantity_received
            SQLAlchemyError: Erro no banco de dados
        """
        if quantity <= 0:
            raise ValueError("Quantity must be positive")
        
        try:
            item = await self.get_by_id(db, item_id)
            if not item:
                return False
            
            # Não pode exceder a quantidade recebida
            new_quantity = item.quantity_remaining + quantity
            if new_quantity > item.quantity_received:
                raise ValueError(
                    f"Cannot increase quantity beyond received amount. "
                    f"Max allowed: {item.quantity_received - item.quantity_remaining}"
                )
            
            item.quantity_remaining = new_quantity
            
            # Flush para refletir mudança na sessão sem commitar
            await db.flush()
            
            return True
            
        except SQLAlchemyError as e:
            # NÃO fazer rollback aqui - deixar para o service layer
            raise SQLAlchemyError(f"Error increasing quantity for item {item_id}: {str(e)}")
    
    async def update(
        self, 
        db: AsyncSession, 
        item_id: int, 
        data: dict
    ) -> Optional[EntryItem]:
        """
        Atualiza um item.
        
        Args:
            db: Database session
            item_id: ID do item
            data: Dados para atualização
            
        Returns:
            EntryItem atualizado ou None
        """
        item = await self.get_by_id(db, item_id)
        if not item:
            return None
        
        # Atualizar campos
        for key, value in data.items():
            if hasattr(item, key) and value is not None:
                # Validação: quantity_remaining não pode exceder quantity_received
                if key == 'quantity_remaining' and value > item.quantity_received:
                    raise ValueError(
                        f"quantity_remaining ({value}) cannot exceed "
                        f"quantity_received ({item.quantity_received})"
                    )
                setattr(item, key, value)
        
        await db.commit()
        await db.refresh(item)
        return item
    
    async def delete(self, db: AsyncSession, item_id: int) -> bool:
        """
        Soft delete de um item.
        
        Args:
            db: Database session
            item_id: ID do item
            
        Returns:
            True se deletado, False se não encontrado
        """
        item = await self.get_by_id(db, item_id)
        if not item:
            return False
        
        item.is_active = False
        await db.commit()
        return True
    
    async def get_depleted_items(
        self, 
        db: AsyncSession,
        entry_id: Optional[int] = None
    ) -> Sequence[EntryItem]:
        """
        Busca itens esgotados (quantity_remaining = 0).
        
        Args:
            db: Database session
            entry_id: Filtrar por entrada específica (opcional)
            
        Returns:
            Lista de itens esgotados
        """
        query = select(EntryItem).where(
            and_(
                EntryItem.quantity_remaining == 0,
                EntryItem.is_active == True
            )
        )
        
        if entry_id:
            query = query.where(EntryItem.entry_id == entry_id)
        
        query = query.options(
            selectinload(EntryItem.product),
            selectinload(EntryItem.stock_entry)
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_low_stock_items(
        self, 
        db: AsyncSession,
        threshold_percentage: float = 20.0
    ) -> Sequence[EntryItem]:
        """
        Busca itens com estoque baixo (% restante abaixo do threshold).
        
        Args:
            db: Database session
            threshold_percentage: Porcentagem limite (padrão 20%)
            
        Returns:
            Lista de itens com estoque baixo
        """
        query = (
            select(EntryItem)
            .where(
                and_(
                    EntryItem.quantity_remaining > 0,
                    EntryItem.is_active == True,
                    # Calcula porcentagem: (remaining / received) * 100 < threshold
                    (EntryItem.quantity_remaining * 100.0 / EntryItem.quantity_received) < threshold_percentage
                )
            )
            .options(
                selectinload(EntryItem.product),
                selectinload(EntryItem.stock_entry)
            )
            .order_by(
                (EntryItem.quantity_remaining * 100.0 / EntryItem.quantity_received).asc()
            )
        )
        
        result = await db.execute(query)
        return result.scalars().all()
    
    async def get_total_available_for_product(
        self, 
        db: AsyncSession, 
        product_id: int
    ) -> int:
        """
        Calcula o total de quantidade disponível de um produto em todas as entradas.
        
        Args:
            db: Database session
            product_id: ID do produto
            
        Returns:
            Quantidade total disponível
        """
        from sqlalchemy import func
        
        query = (
            select(func.sum(EntryItem.quantity_remaining))
            .where(
                and_(
                    EntryItem.product_id == product_id,
                    EntryItem.is_active == True
                )
            )
        )
        
        result = await db.execute(query)
        total = result.scalar_one_or_none()
        return total if total is not None else 0

    async def count_by_product(
        self,
        db: AsyncSession,
        product_id: int,
        *,
        tenant_id: int | None = None,
    ) -> int:
        """Conta quantos EntryItems ativos existem para um produto.

        Útil para classificar produtos como "nunca estocados".
        """
        conditions = [
            EntryItem.product_id == product_id,
            EntryItem.is_active == True,
        ]
        if tenant_id is not None:
            conditions.append(EntryItem.tenant_id == tenant_id)

        query = select(func.count()).where(and_(*conditions))
        result = await db.execute(query)
        return int(result.scalar_one() or 0)
    
    async def bulk_decrease_quantity(
        self,
        db: AsyncSession,
        product_id: int,
        total_quantity: int
    ) -> bool:
        """
        Diminui quantidade de múltiplos itens seguindo FIFO.
        
        Útil para vendas: consome estoque dos itens mais antigos primeiro.
        
        Args:
            db: Database session
            product_id: ID do produto
            total_quantity: Quantidade total a diminuir
            
        Returns:
            True se sucesso, False se quantidade insuficiente
        """
        # Buscar itens disponíveis ordenados por FIFO
        items = await self.get_available_for_product(db, product_id)
        
        remaining_to_decrease = total_quantity
        
        for item in items:
            if remaining_to_decrease <= 0:
                break
            
            if item.quantity_remaining >= remaining_to_decrease:
                # Este item tem quantidade suficiente
                success = await self.decrease_quantity(db, item.id, remaining_to_decrease)
                if not success:
                    await db.rollback()
                    return False
                remaining_to_decrease = 0
            else:
                # Consome todo este item e continua para o próximo
                to_decrease = item.quantity_remaining
                success = await self.decrease_quantity(db, item.id, to_decrease)
                if not success:
                    await db.rollback()
                    return False
                remaining_to_decrease -= to_decrease
        
        # Se ainda sobrou quantidade, não há estoque suficiente
        if remaining_to_decrease > 0:
            await db.rollback()
            return False
        
        return True
    
    async def get_slow_moving(
        self,
        db: AsyncSession,
        threshold: float = 30.0,
        skip: int = 0,
        limit: int = 50,
        tenant_id: int | None = None
    ) -> Sequence[EntryItem]:
        """
        Busca itens com venda lenta (baixa taxa de depleção).
        
        Args:
            db: Database session
            threshold: Limite de depleção (%) para considerar lento
            skip: Registros para pular
            limit: Limite de registros
            tenant_id: ID do tenant para filtrar
            
        Returns:
            Lista de itens com venda lenta
        """
        from datetime import datetime, timedelta
        from sqlalchemy import case
        
        # Data limite: entradas com mais de 30 dias
        date_threshold = datetime.now().date() - timedelta(days=30)
        
        # Query com cálculo de taxa de depleção
        depletion_calc = case(
            (EntryItem.quantity_received > 0,
             ((EntryItem.quantity_received - EntryItem.quantity_remaining).cast(Float) / 
              EntryItem.quantity_received.cast(Float)) * 100),
            else_=0
        )
        
        # Condições base
        conditions = [
            EntryItem.is_active == True,
            EntryItem.quantity_remaining > 0,  # Tem estoque
            StockEntry.entry_date <= date_threshold,  # Entrada antiga
            depletion_calc < threshold  # Taxa de depleção baixa
        ]
        
        # Adicionar filtro de tenant se fornecido
        if tenant_id is not None:
            conditions.append(EntryItem.tenant_id == tenant_id)
        
        query = (
            select(EntryItem)
            .join(StockEntry, EntryItem.entry_id == StockEntry.id)
            .where(and_(*conditions))
            .options(
                selectinload(EntryItem.product),
                selectinload(EntryItem.stock_entry)
            )
            .order_by(depletion_calc.asc())  # Mais lentos primeiro
            .offset(skip)
            .limit(limit)
        )
        
        result = await db.execute(query)
        return result.scalars().all()
