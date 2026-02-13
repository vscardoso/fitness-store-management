"""
Serviço de gerenciamento de entradas de estoque (StockEntry).
"""
from typing import List, Optional, Dict, Any
from decimal import Decimal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import now_brazil, today_brazil
from app.models.stock_entry import StockEntry, EntryType
from app.models.entry_item import EntryItem
from app.repositories.stock_entry_repository import StockEntryRepository
from app.repositories.entry_item_repository import EntryItemRepository
from app.repositories.trip_repository import TripRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.stock_entry import StockEntryCreate, StockEntryUpdate
from app.schemas.entry_item import EntryItemCreate
from app.services.inventory_service import InventoryService


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

    async def _generate_unique_entry_code(self, base_code: str, tenant_id: int) -> str:
        """
        Gera um código único para entrada, adicionando sufixo se necessário.

        Args:
            base_code: Código base fornecido
            tenant_id: ID do tenant

        Returns:
            str: Código único
        """
        # Verificar se código base já existe
        existing = await self.entry_repo.get_by_code(self.db, base_code, tenant_id=tenant_id)
        if not existing:
            return base_code

        # Adicionar sufixo numérico até encontrar código único
        counter = 1
        while True:
            new_code = f"{base_code}-{counter}"
            existing = await self.entry_repo.get_by_code(self.db, new_code, tenant_id=tenant_id)
            if not existing:
                return new_code
            counter += 1

            # Limite de segurança
            if counter > 1000:
                # Usar timestamp se falhar após 1000 tentativas
                timestamp = now_brazil().strftime("%Y%m%d%H%M%S")
                return f"{base_code}-{timestamp}"

    async def check_code_exists(self, entry_code: str, tenant_id: int) -> bool:
        """
        Verifica se um código de entrada já existe para o tenant.

        Args:
            entry_code: Código da entrada a verificar
            tenant_id: ID do tenant

        Returns:
            bool: True se código já existe, False caso contrário
        """
        existing = await self.entry_repo.get_by_code(self.db, entry_code, tenant_id=tenant_id)
        return existing is not None

    async def create_entry(
        self, 
        entry_data: StockEntryCreate,
        items: List[EntryItemCreate],
        user_id: int,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Cria uma nova entrada de estoque com seus itens em transação única.
        
        Args:
            entry_data: Dados da entrada
            items: Lista de itens da entrada
            user_id: ID do usuário que está criando
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada criada com itens
            
        Raises:
            ValueError: Se entry_code já existe ou dados inválidos
        """
        try:
            # Gerar código único se necessário
            unique_code = await self._generate_unique_entry_code(entry_data.entry_code, tenant_id=tenant_id)
            entry_data.entry_code = unique_code
            
            # Validar trip_id se fornecido
            if entry_data.trip_id:
                trip = await self.trip_repo.get_by_id(self.db, entry_data.trip_id, tenant_id=tenant_id)
                if not trip:
                    raise ValueError(f"Trip {entry_data.trip_id} não encontrada")
                
                # Garantir que entry_type seja 'trip' se trip_id fornecido
                if entry_data.entry_type != EntryType.TRIP:
                    raise ValueError("entry_type deve ser 'trip' quando trip_id é fornecido")
            
            # Validar que há itens
            if not items or len(items) == 0:
                raise ValueError("É necessário fornecer ao menos um item")
            
            # Validar produtos e atualizar is_catalog
            for item in items:
                product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
                if not product:
                    raise ValueError(f"Product {item.product_id} não encontrado")
                
                # Se produto é de catálogo, marcar como adicionado à loja
                if product.is_catalog:
                    product.is_catalog = False
                    # Commit será feito ao final da transação
            
            # Criar entrada
            entry_dict = entry_data.model_dump(exclude_unset=True)
            entry_dict['total_cost'] = Decimal('0.00')  # Será calculado depois
            
            entry = await self.entry_repo.create(self.db, entry_dict, tenant_id=tenant_id)
            
            # Criar itens
            total_cost = Decimal('0.00')
            created_items = []
            
            for item_data in items:
                item_dict = item_data.model_dump(exclude_unset=True)
                item_dict['entry_id'] = entry.id
                
                # Garantir que quantity_remaining = quantity_received
                if 'quantity_remaining' not in item_dict:
                    item_dict['quantity_remaining'] = item_dict['quantity_received']
                
                # Extrair selling_price se fornecido (não é campo do EntryItem, é do Product)
                selling_price = item_dict.pop('selling_price', None)
                
                # EntryItem não tem tenant_id próprio, herda da StockEntry
                item_dict['tenant_id'] = tenant_id
                item = await self.item_repo.create(self.db, item_dict)
                created_items.append(item)
                
                # Calcular custo total
                total_cost += item.quantity_received * item.unit_cost
                
                # Atualizar produto com selling_price e cost_price se fornecidos
                product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
                if product:
                    if selling_price is not None and selling_price > 0:
                        product.price = selling_price
                    # Sempre atualizar cost_price com o unit_cost mais recente
                    if item.unit_cost is not None and item.unit_cost > 0:
                        product.cost_price = item.unit_cost
                    # Commit será feito ao final
                
                # Atualizar estoque do produto
                await self._update_product_inventory(
                    item.product_id, 
                    item.quantity_received,
                    operation='add',
                    tenant_id=tenant_id,
                )
            
            # Atualizar total_cost da entrada
            entry.total_cost = total_cost
            await self.db.commit()
            await self.db.refresh(entry)
            
            # Recarregar com itens
            entry = await self.entry_repo.get_by_id(self.db, entry.id, include_items=True, tenant_id=tenant_id)

            # Rebuild incremental para cada produto inserido (garante inventário derivado do FIFO)
            inv_sync = InventoryService(self.db)
            product_ids = {it.product_id for it in created_items}
            for pid in product_ids:
                try:
                    delta = await inv_sync.rebuild_product_from_fifo(pid, tenant_id=tenant_id)
                    print(f"  [Inventory Sync ENTRY] Produto {pid}: fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} created={delta['created']} updated={delta['updated']}")
                except Exception as sync_err:
                    print(f"  [Inventory Sync ENTRY] Falha sync produto {pid}: {sync_err}")
            
            return entry
            
        except Exception as e:
            await self.db.rollback()
            raise e
    
    async def _update_product_inventory(
        self,
        product_id: int,
        quantity: int,
        operation: str = 'add',
        *,
        tenant_id: int | None = None,
    ):
        """
        Atualiza o inventário de um produto.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a adicionar/remover
            operation: 'add' ou 'remove'
            tenant_id: ID do tenant
        """
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        
        if not inventory:
            # Criar inventário se não existe
            inventory_data = {
                'product_id': product_id,
                'quantity': quantity if operation == 'add' else 0,
                'min_stock': 5,
                'is_active': True
            }
            await self.inventory_repo.create(self.db, inventory_data, tenant_id=tenant_id)
        else:
            # Atualizar quantidade
            if operation == 'add':
                inventory.quantity += quantity
            elif operation == 'remove':
                inventory.quantity = max(0, inventory.quantity - quantity)
            
            await self.db.commit()
    
    async def get_entry_details(
        self, 
        entry_id: int,
        *,
        tenant_id: int,
    ) -> Dict[str, Any]:
        """
        Obtém detalhes completos de uma entrada.
        
        Args:
            entry_id: ID da entrada
            tenant_id: ID do tenant
            
        Returns:
            Dict com detalhes da entrada
            
        Raises:
            ValueError: Se entrada não encontrada
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True, tenant_id=tenant_id)
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
                "product_price": float(item.product.price) if item.product else None,
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
        entry_id: int,
        *,
        tenant_id: int,
    ) -> Dict[str, Any]:
        """
        Obtém análises e métricas de uma entrada.
        
        Args:
            entry_id: ID da entrada
            tenant_id: ID do tenant
            
        Returns:
            Dict com análises da entrada
            
        Raises:
            ValueError: Se entrada não encontrada
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True, tenant_id=tenant_id)
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
        trip_id: int,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Vincula uma entrada a uma viagem.
        
        Args:
            entry_id: ID da entrada
            trip_id: ID da viagem
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada atualizada
            
        Raises:
            ValueError: Se entrada ou viagem não encontradas
        """
        # Verificar entrada
        entry = await self.entry_repo.get_by_id(self.db, entry_id, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Verificar viagem
        trip = await self.trip_repo.get_by_id(self.db, trip_id, tenant_id=tenant_id)
        if not trip:
            raise ValueError(f"Trip {trip_id} não encontrada")
        
        # Atualizar entrada
        updated = await self.entry_repo.update(
            self.db, 
            entry_id, 
            {
                "trip_id": trip_id,
                "entry_type": EntryType.TRIP
            },
            tenant_id=tenant_id,
        )
        
        return updated
    
    async def update_entry(
        self, 
        entry_id: int, 
        entry_data: StockEntryUpdate,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Atualiza uma entrada.
        
        Args:
            entry_id: ID da entrada
            entry_data: Dados para atualização
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada atualizada
            
        Raises:
            ValueError: Se entrada não encontrada ou entry_code duplicado
        """
        entry = await self.entry_repo.get_by_id(self.db, entry_id, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")
        
        # Verificar entry_code único se está sendo alterado
        if entry_data.entry_code and entry_data.entry_code != entry.entry_code:
            existing = await self.entry_repo.get_by_code(self.db, entry_data.entry_code, tenant_id=tenant_id)
            if existing:
                raise ValueError(f"Entry code {entry_data.entry_code} já existe")
        
        # Validar trip_id se fornecido
        if entry_data.trip_id:
            trip = await self.trip_repo.get_by_id(self.db, entry_data.trip_id, tenant_id=tenant_id)
            if not trip:
                raise ValueError(f"Trip {entry_data.trip_id} não encontrada")
        
        # Atualizar
        entry_dict = entry_data.model_dump(exclude_unset=True)
        updated = await self.entry_repo.update(self.db, entry_id, entry_dict, tenant_id=tenant_id)
        
        return updated
    
    async def delete_entry(
        self,
        entry_id: int,
        *,
        tenant_id: int,
    ) -> dict:
        """
        Soft delete de uma entrada.

        ATENÇÃO:
        - Remove as quantidades do inventário
        - Exclui produtos órfãos (produtos que só existem nesta entrada)
        - NÃO permite exclusão de entradas que já tiveram vendas (rastreabilidade)

        Args:
            entry_id: ID da entrada
            tenant_id: ID do tenant

        Returns:
            dict: Informações sobre a exclusão (produtos excluídos, estoque removido)

        Raises:
            ValueError: Se a entrada não existe ou já teve vendas
        """
        from sqlalchemy import select, func
        from app.models.entry_item import EntryItem
        from app.models.product import Product

        entry = await self.entry_repo.get_by_id(self.db, entry_id, include_items=True, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entry {entry_id} não encontrada")

        # VALIDAÇÃO CRÍTICA: Verificar se algum item teve vendas
        # Se quantity_sold > 0, a entrada é parte do histórico de vendas e não pode ser excluída
        items_with_sales = [
            item for item in entry.entry_items
            if item.is_active and item.quantity_sold > 0
        ]

        if items_with_sales:
            # Calcular total vendido para mensagem informativa
            total_sold = sum(item.quantity_sold for item in items_with_sales)
            products_sold = len(items_with_sales)

            raise ValueError(
                f"Não é possível excluir entrada com produtos já vendidos. "
                f"Esta entrada faz parte do histórico de vendas "
                f"({products_sold} produto(s) com {total_sold} unidade(s) vendida(s)). "
                f"A rastreabilidade e auditoria exigem que entradas com vendas sejam mantidas no sistema."
            )

        try:
            orphan_products = []
            total_stock_removed = 0

            # Remover quantidades do inventário e identificar produtos órfãos
            for item in entry.entry_items:
                if item.is_active:
                    total_stock_removed += item.quantity_remaining

                    await self._update_product_inventory(
                        item.product_id,
                        item.quantity_remaining,
                        operation='remove',
                        tenant_id=tenant_id,
                    )

                    # Verificar se este produto tem outras entradas ativas
                    other_entries_query = select(func.count(EntryItem.id)).where(
                        EntryItem.product_id == item.product_id,
                        EntryItem.entry_id != entry_id,  # ← Campo correto
                        EntryItem.is_active == True,
                        EntryItem.tenant_id == tenant_id
                    )
                    result = await self.db.execute(other_entries_query)
                    other_entries_count = result.scalar()

                    # Se não tem outras entradas, é órfão
                    if other_entries_count == 0:
                        product_query = select(Product).where(
                            Product.id == item.product_id,
                            Product.tenant_id == tenant_id
                        )
                        product_result = await self.db.execute(product_query)
                        product = product_result.scalar_one_or_none()

                        if product:
                            # Produto órfão volta para o catálogo (ativo)
                            product.is_active = True
                            product.is_catalog = True  # Volta para o catálogo
                            orphan_products.append({
                                'id': product.id,
                                'name': product.name,
                                'sku': product.sku
                            })

            # Soft delete da entrada (cascata para itens)
            success = await self.entry_repo.delete(self.db, entry_id, tenant_id=tenant_id)

            await self.db.commit()

            return {
                'success': success,
                'orphan_products_deleted': len(orphan_products),
                'orphan_products': orphan_products,
                'total_stock_removed': total_stock_removed,
                'entry_code': entry.entry_code
            }

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
        limit: int = 100,
        *,
        tenant_id: int | None = None,
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
            tenant_id: ID do tenant
            
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
            limit=limit,
            tenant_id=tenant_id,
        )
    
    async def get_slow_moving_products(
        self,
        threshold: float = 30.0,
        skip: int = 0,
        limit: int = 50,
        *,
        tenant_id: int | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Retorna produtos com venda lenta.
        
        Args:
            threshold: Limite de depleção (%) para considerar lento
            skip: Registros para pular
            limit: Limite de registros
            tenant_id: ID do tenant
            
        Returns:
            Lista de entry_items com venda lenta
        """
        items = await self.item_repo.get_slow_moving(
            self.db,
            threshold=threshold,
            skip=skip,
            limit=limit,
            tenant_id=tenant_id,
        )
        
        result = []
        for item in items:
            entry = await self.entry_repo.get_by_id(self.db, item.entry_id, tenant_id=tenant_id)  # ← Campo correto
            product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
            
            if entry and product:
                depletion_rate = ((item.quantity_received - item.quantity_remaining) / 
                                item.quantity_received * 100) if item.quantity_received > 0 else 0
                
                days_in_stock = (today_brazil() - entry.entry_date).days
                
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
        limit: int = 20,
        *,
        tenant_id: int | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Retorna entradas com melhor performance.

        Args:
            skip: Registros para pular
            limit: Limite de registros
            tenant_id: ID do tenant

        Returns:
            Lista de entradas ordenadas por performance
        """
        entries = await self.entry_repo.get_multi(self.db, skip=skip, limit=limit * 3, tenant_id=tenant_id)  # Buscar mais para filtrar

        performance_list = []

        for entry in entries:
            # Buscar itens da entrada
            items = await self.item_repo.get_by_entry(self.db, entry.id, tenant_id)

            if not items:
                continue

            total_received = sum(item.quantity_received for item in items)
            total_remaining = sum(item.quantity_remaining for item in items)
            total_sold = total_received - total_remaining

            sell_through_rate = (total_sold / total_received * 100) if total_received > 0 else 0

            # Calcular ROI simplificado (sell_through como proxy de performance)
            # ROI real requer dados de venda que não temos aqui
            roi = sell_through_rate - 100  # Se vendeu 100%, ROI = 0; se vendeu 150%, ROI = 50

            performance_list.append({
                "entry_id": entry.id,
                "entry_code": entry.entry_code,
                "entry_date": entry.entry_date.isoformat() if entry.entry_date else None,
                "entry_type": entry.entry_type.value if entry.entry_type else None,
                "supplier_name": entry.supplier_name,
                "total_cost": float(entry.total_cost),
                "total_items": len(items),
                "sell_through_rate": round(sell_through_rate, 2),
                "total_quantity_sold": total_sold,
                "roi": round(roi, 2),
                "performance_score": round(sell_through_rate, 2)
            })

        # Ordenar por performance_score (depletion_rate)
        performance_list.sort(key=lambda x: x["performance_score"], reverse=True)

        # Aplicar paginação
        return performance_list[skip:skip+limit]

    async def update_entry_item(
        self,
        item_id: int,
        item_data: Dict[str, Any],
        *,
        tenant_id: int,
    ) -> EntryItem:
        """
        Atualiza um item de entrada com recálculo automático de inventário.

        VALIDAÇÕES:
        - Bloqueia edição se o item já teve vendas (quantity_sold > 0)
        - Garante que quantity_remaining <= quantity_received
        - Recalcula inventário automaticamente quando quantidade muda
        - Recalcula total_cost da entrada quando custo/quantidade mudam

        Args:
            item_id: ID do item a atualizar
            item_data: Dados para atualização (quantity_received, unit_cost, etc.)
            tenant_id: ID do tenant

        Returns:
            EntryItem atualizado

        Raises:
            ValueError: Se item não encontrado, tem vendas, ou dados inválidos
        """
        from app.schemas.entry_item import EntryItemUpdate

        # Buscar item com relações
        item = await self.item_repo.get_by_id(self.db, item_id, include_relations=True)
        if not item:
            raise ValueError(f"EntryItem {item_id} não encontrado")

        # Validar tenant (segurança multi-tenancy)
        if item.tenant_id != tenant_id:
            raise ValueError(f"EntryItem {item_id} não pertence a este tenant")

        # VALIDAÇÃO CRÍTICA: Bloquear edição se item já teve vendas
        if item.quantity_sold > 0:
            raise ValueError(
                f"Não é possível editar item que já teve vendas. "
                f"Este item já vendeu {item.quantity_sold} unidade(s). "
                f"A rastreabilidade FIFO exige que itens com vendas não sejam modificados."
            )

        # Guardar valores antigos para calcular delta
        old_quantity_received = item.quantity_received
        old_quantity_remaining = item.quantity_remaining
        old_unit_cost = item.unit_cost

        # Preparar update data
        update_data = {}

        # Atualizar quantity_received se fornecido
        if 'quantity_received' in item_data and item_data['quantity_received'] is not None:
            new_qty_received = item_data['quantity_received']
            if new_qty_received <= 0:
                raise ValueError("quantity_received deve ser maior que zero")

            # Se quantity_received mudou, ajustar quantity_remaining proporcionalmente
            # Mas apenas se o item ainda não foi vendido (já validamos acima)
            if new_qty_received != old_quantity_received:
                # Como não teve vendas, quantity_remaining = quantity_received
                update_data['quantity_received'] = new_qty_received
                update_data['quantity_remaining'] = new_qty_received

        # Atualizar unit_cost se fornecido
        if 'unit_cost' in item_data and item_data['unit_cost'] is not None:
            new_unit_cost = item_data['unit_cost']
            if new_unit_cost < 0:
                raise ValueError("unit_cost não pode ser negativo")
            update_data['unit_cost'] = new_unit_cost

            # Atualizar cost_price do produto associado
            product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
            if product:
                product.cost_price = new_unit_cost
                await self.db.flush()

        # Atualizar notes se fornecido
        if 'notes' in item_data and item_data['notes'] is not None:
            update_data['notes'] = item_data['notes']

        # Atualizar sell_price do produto se fornecido
        sell_price_updated = False
        if 'sell_price' in item_data and item_data['sell_price'] is not None:
            new_sell_price = item_data['sell_price']
            if new_sell_price < 0:
                raise ValueError("sell_price não pode ser negativo")

            # Atualizar o preço do produto associado
            product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
            if product:
                product.price = new_sell_price
                sell_price_updated = True
                await self.db.flush()

        # Se não há nada para atualizar, commit se sell_price mudou e retornar
        if not update_data:
            if sell_price_updated:
                await self.db.commit()
                await self.db.refresh(item)
            return item

        # Atualizar o item (sem commit ainda)
        for key, value in update_data.items():
            setattr(item, key, value)

        await self.db.flush()  # Flush sem commit para refletir mudanças na sessão

        # Calcular delta de inventário
        new_quantity = update_data.get('quantity_remaining', old_quantity_remaining)
        inventory_delta = new_quantity - old_quantity_remaining

        # Se quantidade mudou, recalcular inventário do produto
        if inventory_delta != 0:
            # Usar InventoryService para garantir consistência FIFO
            inv_service = InventoryService(self.db)
            await inv_service.rebuild_product_from_fifo(item.product_id, tenant_id=tenant_id)

            if __DEV__ if '__DEV__' in dir() else True:
                print(
                    f"  [EntryItem Update] Produto {item.product_id}: "
                    f"delta inventário = {inventory_delta:+d} "
                    f"(de {old_quantity_remaining} para {new_quantity})"
                )

        # Se custo ou quantidade mudaram, recalcular total_cost da entrada
        if 'unit_cost' in update_data or 'quantity_received' in update_data:
            # Recalcular total_cost da entrada inteira
            entry = await self.entry_repo.get_by_id(self.db, item.entry_id, include_items=True, tenant_id=tenant_id)
            if entry:
                new_total_cost = Decimal('0.00')
                for entry_item in entry.entry_items:
                    if entry_item.is_active:
                        new_total_cost += entry_item.quantity_received * entry_item.unit_cost

                entry.total_cost = new_total_cost
                await self.db.flush()

                if __DEV__ if '__DEV__' in dir() else True:
                    print(
                        f"  [EntryItem Update] Entrada {entry.entry_code}: "
                        f"total_cost recalculado = R$ {new_total_cost:.2f}"
                    )

        # Commit final
        await self.db.commit()
        await self.db.refresh(item)

        return item

    async def add_item_to_entry(
        self,
        entry_id: int,
        item_data: Dict[str, Any],
        *,
        tenant_id: int,
    ) -> EntryItem:
        """
        Adiciona um novo item a uma entrada de estoque existente.

        Este método permite vincular um produto do catálogo a uma entrada existente,
        criando o rastreamento FIFO necessário e atualizando o inventário.

        Args:
            entry_id: ID da entrada existente
            item_data: Dados do item (product_id, quantity_received, unit_cost, selling_price, notes)
            tenant_id: ID do tenant

        Returns:
            EntryItem criado

        Raises:
            ValueError: Se entrada não encontrada, produto não encontrado, ou dados inválidos
        """
        from decimal import Decimal

        # Buscar entrada
        entry = await self.entry_repo.get_by_id(self.db, entry_id, tenant_id=tenant_id)
        if not entry:
            raise ValueError(f"Entrada {entry_id} não encontrada")

        # Validar produto
        product_id = item_data.get('product_id')
        if not product_id:
            raise ValueError("product_id é obrigatório")

        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")

        # Validar quantidade
        quantity_received = item_data.get('quantity_received', 1)
        if quantity_received <= 0:
            raise ValueError("quantity_received deve ser maior que zero")

        # Validar custo
        unit_cost = item_data.get('unit_cost', 0)
        if unit_cost < 0:
            raise ValueError("unit_cost não pode ser negativo")

        # Se produto é de catálogo, marcar como adicionado à loja
        if product.is_catalog:
            product.is_catalog = False

        # Criar item da entrada
        new_item = EntryItem(
            entry_id=entry_id,
            product_id=product_id,
            quantity_received=quantity_received,
            quantity_remaining=quantity_received,  # Novo, então todo estoque está disponível
            unit_cost=Decimal(str(unit_cost)),
            notes=item_data.get('notes', ''),
            tenant_id=tenant_id,
            is_active=True,
        )

        self.db.add(new_item)
        await self.db.flush()

        # Atualizar produto com custo e preço se fornecidos
        selling_price = item_data.get('selling_price')
        if selling_price is not None and selling_price > 0:
            product.price = selling_price
        if unit_cost > 0:
            product.cost_price = unit_cost

        # Atualizar total_cost da entrada
        item_total_cost = Decimal(str(quantity_received)) * Decimal(str(unit_cost))
        entry.total_cost = (entry.total_cost or Decimal('0')) + item_total_cost

        # Atualizar inventário do produto
        await self._update_product_inventory(
            product_id,
            quantity_received,
            operation='add',
            tenant_id=tenant_id,
        )

        # Commit
        await self.db.commit()
        await self.db.refresh(new_item)

        return new_item
