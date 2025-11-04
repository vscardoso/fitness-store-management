"""
Serviço de gerenciamento de entradas de estoque (StockEntry).
"""
from typing import List, Optional, Dict, Any
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.stock_entry import StockEntry, EntryType
from app.models.entry_item import EntryItem
from app.repositories.stock_entry_repository import StockEntryRepository
from app.repositories.entry_item_repository import EntryItemRepository
from app.repositories.trip_repository import TripRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.stock_entry import StockEntryCreate, StockEntryUpdate
from app.schemas.entry_item import EntryItemCreate


class StockEntryService:
    """Serviço para operações de negócio com entradas de estoque."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de entradas.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.entry_repo = StockEntryRepository()
        self.item_repo = EntryItemRepository()
        self.trip_repo = TripRepository()
        self.product_repo = ProductRepository(db)
        self.inventory_repo = InventoryRepository(db)
    
    async def create_entry(
        self, 
        entry_data: StockEntryCreate,
        items: List[EntryItemCreate],
        user_id: int
    ) -> StockEntry:
        """
        Cria uma nova entrada de estoque com seus itens em transação única.
        
        Args:
            entry_data: Dados da entrada
            items: Lista de itens da entrada
            user_id: ID do usuário que está criando
            
        Returns:
            StockEntry: Entrada criada com itens
            
        Raises:
            ValueError: Se entry_code já existe ou dados inválidos
        """
        try:
            # Verificar entry_code único
            existing = await self.entry_repo.get_by_code(self.db, entry_data.entry_code)
            if existing:
                raise ValueError(f"Entry code {entry_data.entry_code} já existe")
            
            # Validar trip_id se fornecido
            if entry_data.trip_id:
                trip = await self.trip_repo.get_by_id(self.db, entry_data.trip_id)
                if not trip:
                    raise ValueError(f"Trip {entry_data.trip_id} não encontrada")
                
                # Garantir que entry_type seja 'trip' se trip_id fornecido
                if entry_data.entry_type != EntryType.TRIP:
                    raise ValueError("entry_type deve ser 'trip' quando trip_id é fornecido")
            
            # Validar que há itens
            if not items or len(items) == 0:
                raise ValueError("É necessário fornecer ao menos um item")
            
            # Validar produtos
            for item in items:
                product = await self.product_repo.get(self.db, item.product_id)
                if not product:
                    raise ValueError(f"Product {item.product_id} não encontrado")
            
            # Criar entrada
            entry_dict = entry_data.model_dump(exclude_unset=True)
            entry_dict['total_cost'] = Decimal('0.00')  # Será calculado depois
            
            entry = await self.entry_repo.create(self.db, entry_dict)
            
            # Criar itens
            total_cost = Decimal('0.00')
            created_items = []
            
            for item_data in items:
                item_dict = item_data.model_dump(exclude_unset=True)
                item_dict['entry_id'] = entry.id
                
                # Garantir que quantity_remaining = quantity_received
                if 'quantity_remaining' not in item_dict:
                    item_dict['quantity_remaining'] = item_dict['quantity_received']
                
                item = await self.item_repo.create(self.db, item_dict)
                created_items.append(item)
                
                # Calcular custo total
                total_cost += item.quantity_received * item.unit_cost
                
                # Atualizar estoque do produto
                await self._update_product_inventory(
                    item.product_id, 
                    item.quantity_received,
                    operation='add'
                )
            
            # Atualizar total_cost da entrada
            entry.total_cost = total_cost
            await self.db.commit()
            await self.db.refresh(entry)
            
            # Recarregar com itens
            entry = await self.entry_repo.get_by_id(self.db, entry.id, include_items=True)
            
            return entry
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def _update_product_inventory(
        self,
        product_id: int,
        quantity: int,
        operation: str = 'add'
    ):
        """
        Atualiza o inventário de um produto.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a adicionar/remover
            operation: 'add' ou 'remove'
        """
        inventory = await self.inventory_repo.get_by_product(self.db, product_id)
        
        if not inventory:
            # Criar inventário se não existe
            inventory_data = {
                'product_id': product_id,
                'quantity': quantity if operation == 'add' else 0,
                'min_stock': 5,
                'is_active': True
            }
            await self.inventory_repo.create(self.db, inventory_data)
        else:
            # Atualizar quantidade
            if operation == 'add':
                inventory.quantity += quantity
            elif operation == 'remove':
                inventory.quantity = max(0, inventory.quantity - quantity)
            
            await self.db.commit()
    
    async def get_entry_details(
        self, 
        entry_id: int
    ) -> Dict[str, Any]:
        """
        Obtém detalhes completos de uma entrada.
        
        Args:
            entry_id: ID da entrada
            
        Returns:
            Dict com detalhes da entrada
            
        Raises:
            ValueError: Se entrada não encontrada
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Informações da viagem (se houver)
        trip_info = None
        if entry.trip:
            trip_info = {
                "trip_id": entry.trip.id,
                "trip_code": entry.trip.trip_code,
                "destination": entry.trip.destination,
                "trip_date": entry.trip.trip_date,
                "status": entry.trip.status,
            }
        
        # Informações dos itens
        items = []
        for item in entry.entry_items:
            items.append({
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product.name if item.product else None,
                "product_sku": item.product.sku if item.product else None,
                "quantity_received": item.quantity_received,
                "quantity_remaining": item.quantity_remaining,
                "quantity_sold": item.quantity_sold,
                "unit_cost": float(item.unit_cost),
                "total_cost": float(item.total_cost),
                "depletion_percentage": item.depletion_percentage,
                "is_depleted": item.is_depleted,
                "notes": item.notes,
            })
        
        return {
            "id": entry.id,
            "entry_code": entry.entry_code,
            "entry_date": entry.entry_date,
            "entry_type": entry.entry_type,
            "supplier_name": entry.supplier_name,
            "supplier_cnpj": entry.supplier_cnpj,
            "supplier_contact": entry.supplier_contact,
            "invoice_number": entry.invoice_number,
            "payment_method": entry.payment_method,
            "total_cost": float(entry.total_cost),
            "notes": entry.notes,
            "is_active": entry.is_active,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at,
            "trip": trip_info,
            "items": items,
            "total_items": len(items),
            "total_quantity": entry.total_quantity,
        }
    
    async def get_entry_analytics(
        self, 
        entry_id: int
    ) -> Dict[str, Any]:
        """
        Obtém análises e métricas de uma entrada.
        
        Args:
            entry_id: ID da entrada
            
        Returns:
            Dict com análises da entrada
            
        Raises:
            ValueError: Se entrada não encontrada
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Calcular métricas
        total_received = 0
        total_remaining = 0
        total_sold = 0
        total_cost = Decimal('0.00')
        items_depleted = 0
        
        for item in entry.entry_items:
            if not item.is_active:
                continue
                
            total_received += item.quantity_received
            total_remaining += item.quantity_remaining
            total_sold += item.quantity_sold
            total_cost += item.total_cost
            
            if item.is_depleted:
                items_depleted += 1
        
        # Calcular sell-through rate
        sell_through_rate = 0.0
        if total_received > 0:
            sell_through_rate = (total_sold / total_received) * 100
        
        # Calcular ROI (simplificado)
        # Assumindo margem de lucro média
        estimated_revenue = total_cost * Decimal('1.3')  # 30% de margem
        roi = 0.0
        if total_cost > 0:
            roi = ((estimated_revenue - total_cost) / total_cost) * 100
        
        return {
            "entry_id": entry.id,
            "entry_code": entry.entry_code,
            "entry_type": entry.entry_type,
            "supplier_name": entry.supplier_name,
            
            # Métricas de quantidade
            "total_items": len(entry.entry_items),
            "items_depleted": items_depleted,
            "total_quantity_received": total_received,
            "total_quantity_remaining": total_remaining,
            "total_quantity_sold": total_sold,
            
            # Métricas financeiras
            "total_cost": float(total_cost),
            "estimated_revenue": float(estimated_revenue),
            
            # Performance
            "sell_through_rate": round(sell_through_rate, 2),
            "roi": round(float(roi), 2),
            "depletion_rate": round(
                (items_depleted / len(entry.entry_items) * 100) if entry.entry_items else 0,
                2
            ),
        }
    
    async def link_to_trip(
        self, 
        entry_id: int, 
        trip_id: int
    ) -> StockEntry:
        """
        Vincula uma entrada a uma viagem.
        
        Args:
            entry_id: ID da entrada
            trip_id: ID da viagem
            
        Returns:
            StockEntry: Entrada atualizada
            
        Raises:
            ValueError: Se entrada ou viagem não encontradas
        """
        # Verificar entrada
        entry = await self.entry_repo.get_by_id(self.db, entry_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Verificar viagem
        trip = await self.trip_repo.get_by_id(self.db, trip_id)
        if not trip:
            raise ValueError(f"Trip {trip_id} não encontrada")
        
        # Atualizar entrada
        updated = await self.entry_repo.update(
            self.db, 
            entry_id, 
            {
                "trip_id": trip_id,
                "entry_type": EntryType.TRIP
            }
        )
        
        return updated
    
    async def update_entry(
        self, 
        entry_id: int, 
        entry_data: StockEntryUpdate
    ) -> StockEntry:
        """
        Atualiza uma entrada.
        
        Args:
            entry_id: ID da entrada
            entry_data: Dados para atualização
            
        Returns:
            StockEntry: Entrada atualizada
            
        Raises:
            ValueError: Se entrada não encontrada ou entry_code duplicado
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Verificar entry_code único se está sendo alterado
        if entry_data.entry_code and entry_data.entry_code != entry.entry_code:
            existing = await self.entry_repo.get_by_code(self.db, entry_data.entry_code)
            if existing:
                raise ValueError(f"Entry code {entry_data.entry_code} já existe")
        
        # Validar trip_id se fornecido
        if entry_data.trip_id:
            trip = await self.trip_repo.get_by_id(self.db, entry_data.trip_id)
            if not trip:
                raise ValueError(f"Trip {entry_data.trip_id} não encontrada")
        
        # Atualizar
        entry_dict = entry_data.model_dump(exclude_unset=True)
        updated = await self.entry_repo.update(self.db, entry_id, entry_dict)
        
        return updated
    
    async def delete_entry(self, entry_id: int) -> bool:
        """
        Soft delete de uma entrada.
        
        ATENÇÃO: Também remove as quantidades do inventário.
        
        Args:
            entry_id: ID da entrada
            
        Returns:
            bool: True se deletada
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        try:
            # Remover quantidades do inventário
            for item in entry.entry_items:
                if item.is_active:
                    await self._update_product_inventory(
                        item.product_id,
                        item.quantity_remaining,
                        operation='remove'
                    )
            
            # Soft delete da entrada (cascata para itens)
            success = await self.entry_repo.delete(self.db, entry_id)
            
            await self.db.commit()
            return success
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def get_entries_filtered(
        self,
        entry_type: Optional[EntryType] = None,
        trip_id: Optional[int] = None,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[StockEntry]:
        """
        Lista entradas com filtros.
        
        Args:
            entry_type: Filtrar por tipo
            trip_id: Filtrar por viagem
            start_date: Data inicial
            end_date: Data final
            skip: Registros para pular
            limit: Limite de registros
            
        Returns:
            Lista de entradas filtradas
        """
        return await self.entry_repo.get_filtered(
            self.db,
            entry_type=entry_type,
            trip_id=trip_id,
            start_date=start_date,
            end_date=end_date,
            skip=skip,
            limit=limit
        )
    
    async def get_slow_moving_products(
        self,
        threshold: float = 30.0,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Retorna produtos com venda lenta.
        
        Args:
            threshold: Limite de depleção (%) para considerar lento
            skip: Registros para pular
            limit: Limite de registros
            
        Returns:
            Lista de entry_items com venda lenta
        """
        items = await self.item_repo.get_slow_moving(
            self.db,
            threshold=threshold,
            skip=skip,
            limit=limit
        )
        
        result = []
        for item in items:
            entry = await self.entry_repo.get_by_id(self.db, item.stock_entry_id)
            product = await self.product_repo.get(self.db, item.product_id)
            
            if entry and product:
                depletion_rate = ((item.quantity_received - item.quantity_remaining) / 
                                item.quantity_received * 100) if item.quantity_received > 0 else 0
                
                days_in_stock = (datetime.now().date() - entry.entry_date).days
                
                result.append({
                    "entry_item_id": item.id,
                    "entry_code": entry.entry_code,
                    "product_id": product.id,
                    "product_name": product.name,
                    "product_sku": product.sku,
                    "quantity_received": item.quantity_received,
                    "quantity_remaining": item.quantity_remaining,
                    "quantity_sold": item.quantity_received - item.quantity_remaining,
                    "depletion_rate": round(depletion_rate, 2),
                    "days_in_stock": days_in_stock,
                    "unit_cost": float(item.unit_cost)
                })
        
        return result
    
    async def get_best_performing_entries(
        self,
        skip: int = 0,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Retorna entradas com melhor performance.
        
        Args:
            skip: Registros para pular
            limit: Limite de registros
            
        Returns:
            Lista de entradas ordenadas por performance
        """
        entries = await self.entry_repo.get_multi(self.db, skip=skip, limit=limit * 3)  # Buscar mais para filtrar
        
        performance_list = []
        
        for entry in entries:
            # Buscar itens da entrada
            items = await self.item_repo.get_by_entry(self.db, entry.id)
            
            if not items:
                continue
            
            total_received = sum(item.quantity_received for item in items)
            total_remaining = sum(item.quantity_remaining for item in items)
            total_sold = total_received - total_remaining
            
            depletion_rate = (total_sold / total_received * 100) if total_received > 0 else 0
            
            performance_list.append({
                "entry_id": entry.id,
                "entry_code": entry.entry_code,
                "entry_date": entry.entry_date,
                "supplier_name": entry.supplier_name,
                "total_cost": float(entry.total_cost),
                "total_items": len(items),
                "average_depletion_rate": round(depletion_rate, 2),
                "total_quantity_sold": total_sold,
                "performance_score": round(depletion_rate, 2)
            })
        
        # Ordenar por performance_score (depletion_rate)
        performance_list.sort(key=lambda x: x["performance_score"], reverse=True)
        
        # Aplicar paginação
        return performance_list[skip:skip+limit]
