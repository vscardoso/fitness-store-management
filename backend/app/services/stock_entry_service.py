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
            
            # Validar produtos e atualizar is_catalog (items é opcional)
            for item in items or []:
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
                        product.base_price = selling_price
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
        
        # Receita real: quantity_sold × sell_price (ou product price)
        real_revenue = Decimal('0.00')
        for item in entry.entry_items:
            if not item.is_active:
                continue
            qty_sold = item.quantity_sold
            if qty_sold > 0:
                price = item.sell_price or (item.product.base_price if item.product else Decimal('0'))
                real_revenue += Decimal(str(qty_sold)) * (price or Decimal('0'))

        # Despesas de viagem proporcionais (se entry for de viagem)
        trip_cost_share = Decimal('0.00')
        trip_travel_cost = Decimal('0.00')
        if entry.trip_id and entry.trip:
            trip = entry.trip
            trip_travel_cost = trip.travel_cost_total or Decimal('0')
            if trip_travel_cost > 0:
                # Somar custo total de todas entradas da viagem
                trip_entries_cost = sum(
                    (e.total_cost or Decimal('0'))
                    for e in trip.stock_entries
                    if e.is_active
                )
                if trip_entries_cost > 0 and total_cost > 0:
                    trip_cost_share = (total_cost / trip_entries_cost) * trip_travel_cost

        total_investment = total_cost + trip_cost_share
        roi = 0.0
        if total_investment > 0 and real_revenue > 0:
            cost_of_sold = sum(
                Decimal(str(i.quantity_sold)) * i.unit_cost
                for i in entry.entry_items
                if i.is_active and i.quantity_sold > 0
            )
            sold_investment = cost_of_sold + trip_cost_share
            roi = float((real_revenue - sold_investment) / sold_investment * 100) if sold_investment > 0 else 0.0

        return {
            "entry_id": entry.id,
            "entry_code": entry.entry_code,
            "entry_type": entry.entry_type,
            "supplier_name": entry.supplier_name,

            "total_items": len(entry.entry_items),
            "items_depleted": items_depleted,
            "total_quantity_received": total_received,
            "total_quantity_remaining": total_remaining,
            "total_quantity_sold": total_sold,

            "total_cost": float(total_cost),
            "real_revenue": float(real_revenue),
            "trip_travel_cost": float(trip_travel_cost),
            "trip_cost_share": float(trip_cost_share),
            "total_investment": float(total_investment),

            "sell_through_rate": round(sell_through_rate, 2),
            "roi": round(roi, 2),
            "depletion_rate": round(
                (items_depleted / len(entry.entry_items) * 100) if entry.entry_items else 0, 2
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
            from app.models.product_variant import ProductVariant
            from app.models.inventory import Inventory

            orphan_products = []
            total_stock_removed = 0

            # Coletar product_ids afetados — suporta tanto product_id (legado)
            # quanto variant_id (novo sistema)
            affected_product_ids: set[int] = set()

            for item in entry.entry_items:
                if item.is_active:
                    total_stock_removed += item.quantity_remaining
                    # Resolver product_id via produto direto ou via variante
                    pid = item.product_id
                    if not pid and item.variant:
                        pid = item.variant.product_id
                    if pid:
                        affected_product_ids.add(pid)

            # Para cada produto afetado, verificar se é órfão
            # (sem outras entry_items ativas em outras entradas)
            products_to_delete: set[int] = set()

            for product_id in affected_product_ids:
                # Verificar via product_id (legado)
                count_via_product = (await self.db.execute(
                    select(func.count(EntryItem.id)).where(
                        EntryItem.product_id == product_id,
                        EntryItem.entry_id != entry_id,
                        EntryItem.is_active == True,
                        EntryItem.tenant_id == tenant_id,
                    )
                )).scalar() or 0

                # Verificar via variant_id (novo sistema)
                count_via_variant = (await self.db.execute(
                    select(func.count(EntryItem.id))
                    .join(ProductVariant, EntryItem.variant_id == ProductVariant.id)
                    .where(
                        ProductVariant.product_id == product_id,
                        EntryItem.entry_id != entry_id,
                        EntryItem.is_active == True,
                        EntryItem.tenant_id == tenant_id,
                    )
                )).scalar() or 0

                if count_via_product == 0 and count_via_variant == 0:
                    products_to_delete.add(product_id)

            # Liberar entry_code para reutilização e suprimir vínculo com tenant.
            # O commit interno do entry_repo.delete persiste essas mudanças junto.
            original_entry_code = entry.entry_code
            entry.entry_code = f"{entry.entry_code}_del_{entry_id}"
            entry.tenant_id = None

            # Soft delete da entrada (cascata para itens via is_active=False)
            success = await self.entry_repo.delete(self.db, entry_id, tenant_id=tenant_id)

            # Flush para que o soft delete seja visível antes do rebuild
            await self.db.flush()

            # Suprimir tenant_id dos entry_items (vínculo com tenant)
            from sqlalchemy import update as sa_update
            await self.db.execute(
                sa_update(EntryItem)
                .where(EntryItem.entry_id == entry_id)
                .values(tenant_id=None)
            )

            # Excluir produtos órfãos varia conforme a origem:
            # - is_catalog=True  → ainda era template no catálogo: retornar ao pool global
            # - is_catalog=False → produto estava ativo: desativar + limpar SKU completamente
            for product_id in products_to_delete:
                product_result = await self.db.execute(
                    select(Product).where(
                        Product.id == product_id,
                        Product.tenant_id == tenant_id,
                    )
                )
                product = product_result.scalar_one_or_none()
                if not product:
                    continue

                # Buscar todas as variantes (ativas e inativas)
                variants_result = await self.db.execute(
                    select(ProductVariant).where(
                        ProductVariant.product_id == product_id,
                    )
                )
                product_variants = variants_result.scalars().all()

                # Zerar inventário e suprimir vínculo com tenant.
                # Busca por product_id (legado) E por variant_id (novo sistema).
                inv_via_product = (await self.db.execute(
                    select(Inventory).where(
                        Inventory.product_id == product_id,
                        Inventory.tenant_id == tenant_id,
                    )
                )).scalars().all()

                inv_via_variant = (await self.db.execute(
                    select(Inventory)
                    .join(ProductVariant, Inventory.variant_id == ProductVariant.id)
                    .where(
                        ProductVariant.product_id == product_id,
                        Inventory.tenant_id == tenant_id,
                    )
                )).scalars().all()

                for inv in list(inv_via_product) + list(inv_via_variant):
                    inv.quantity = 0
                    inv.tenant_id = None

                if product.is_catalog:
                    # Produto ainda no estado de catálogo (entrada foi deletada antes de ativá-lo):
                    # retornar ao pool global — remover vínculo com tenant.
                    # SKU preservado (NOT NULL) mas renomeado com sufixo para liberar o valor original.
                    product.tenant_id = None
                    for variant in product_variants:
                        # Renomear SKU com sufixo _del_{id} para liberar o valor original sem violar NOT NULL
                        if variant.sku and not variant.sku.endswith(f'_del_{variant.id}'):
                            variant.sku = f'{variant.sku}_del_{variant.id}'
                        variant.tenant_id = None
                    orphan_products.append({
                        'id': product.id,
                        'name': product.name,
                        'action': 'returned_to_catalog',
                    })
                else:
                    # Produto ativo (is_catalog=False): desativar completamente.
                    # SKU renomeado com sufixo _del_{id} para liberar o valor original sem violar NOT NULL.
                    product.is_active = False
                    product.tenant_id = None
                    for variant in product_variants:
                        variant.is_active = False
                        if variant.sku and not variant.sku.endswith(f'_del_{variant.id}'):
                            variant.sku = f'{variant.sku}_del_{variant.id}'
                        variant.tenant_id = None
                    orphan_products.append({
                        'id': product.id,
                        'name': product.name,
                        'action': 'deactivated',
                    })

            # Rebuild FIFO para produtos não-órfãos (têm outras entradas ativas)
            non_orphan_ids = affected_product_ids - products_to_delete
            inv_sync = InventoryService(self.db)
            for pid in non_orphan_ids:
                try:
                    delta = await inv_sync.rebuild_product_from_fifo(pid, tenant_id=tenant_id)
                    print(
                        f"  [Inventory Sync DELETE_ENTRY] Produto {pid}: "
                        f"fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} "
                        f"updated={delta['updated']}"
                    )
                except Exception as sync_err:
                    print(f"  [Inventory Sync DELETE_ENTRY] Falha sync produto {pid}: {sync_err}")

            await self.db.commit()

            return {
                'success': success,
                'orphan_products_deleted': len(orphan_products),
                'orphan_products': orphan_products,
                'total_stock_removed': total_stock_removed,
                'entry_code': original_entry_code,
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

            # Atualizar cost_price da variante usando ORM (suporta variant_id e product_id)
            from sqlalchemy import select as _select
            from app.models.product_variant import ProductVariant
            if item.variant_id:
                _stmt = _select(ProductVariant).where(
                    ProductVariant.id == item.variant_id,
                    ProductVariant.is_active == True,
                )
            elif item.product_id:
                _stmt = _select(ProductVariant).where(
                    ProductVariant.product_id == item.product_id,
                    ProductVariant.is_active == True,
                ).order_by(ProductVariant.id).limit(1)
            else:
                _stmt = None
            if _stmt is not None:
                _result = await self.db.execute(_stmt)
                _variant = _result.scalar_one_or_none()
                if _variant:
                    _variant.cost_price = Decimal(str(new_unit_cost))
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

            # Atualizar price da variante e base_price do produto usando ORM puro
            from sqlalchemy import select as _select
            from app.models.product_variant import ProductVariant
            _sell_variant = None
            if item.variant_id:
                _vstmt = _select(ProductVariant).where(
                    ProductVariant.id == item.variant_id,
                    ProductVariant.is_active == True,
                )
                _vr = await self.db.execute(_vstmt)
                _sell_variant = _vr.scalar_one_or_none()
            elif item.product_id:
                _vstmt = _select(ProductVariant).where(
                    ProductVariant.product_id == item.product_id,
                    ProductVariant.is_active == True,
                ).order_by(ProductVariant.id).limit(1)
                _vr = await self.db.execute(_vstmt)
                _sell_variant = _vr.scalar_one_or_none()
            if _sell_variant:
                _sell_variant.price = Decimal(str(new_sell_price))
                sell_price_updated = True
                await self.db.flush()
            # Atualizar base_price do produto pai também (campo de referência)
            if item.product_id:
                _product = await self.product_repo.get(self.db, item.product_id, tenant_id=tenant_id)
                if _product:
                    _product.base_price = Decimal(str(new_sell_price))
                    sell_price_updated = True
                    await self.db.flush()

        # Se não há nada para atualizar, commit se sell_price mudou e retornar
        if not update_data:
            if sell_price_updated:
                await self.db.commit()
            from sqlalchemy import select as _sel
            from sqlalchemy.orm import selectinload as _sil
            from app.models.product_variant import ProductVariant as _PV
            _stmt = (
                _sel(EntryItem)
                .where(EntryItem.id == item.id)
                .options(
                    _sil(EntryItem.product),
                    _sil(EntryItem.variant).selectinload(_PV.product),
                )
            )
            _result = await self.db.execute(_stmt)
            _refreshed = _result.scalar_one_or_none()
            return _refreshed if _refreshed is not None else item

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

        # Re-buscar item com todas as relações carregadas (variant + product)
        # necessário para serialização do EntryItemResponse pelo FastAPI
        from sqlalchemy import select as _sel
        from sqlalchemy.orm import selectinload as _sil
        from app.models.product_variant import ProductVariant as _PV
        _stmt = (
            _sel(EntryItem)
            .where(EntryItem.id == item.id)
            .options(
                _sil(EntryItem.product),
                _sil(EntryItem.variant).selectinload(_PV.product),
            )
        )
        _result = await self.db.execute(_stmt)
        _refreshed = _result.scalar_one_or_none()
        return _refreshed if _refreshed is not None else item

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

        # Buscar variante padrão do produto para vincular no EntryItem
        # (necessário para que a query de total_stock em products_grouped funcione corretamente)
        from app.models.product_variant import ProductVariant
        from sqlalchemy import select as _select
        default_variant_result = await self.db.execute(
            _select(ProductVariant).where(
                ProductVariant.product_id == product_id,
                ProductVariant.is_active == True,
            ).limit(1)
        )
        default_variant = default_variant_result.scalar_one_or_none()

        # Criar item da entrada
        new_item = EntryItem(
            entry_id=entry_id,
            product_id=product_id,
            variant_id=default_variant.id if default_variant else None,
            quantity_received=quantity_received,
            quantity_remaining=quantity_received,  # Novo, então todo estoque está disponível
            unit_cost=Decimal(str(unit_cost)),
            notes=item_data.get('notes', ''),
            tenant_id=tenant_id,
            is_active=True,
        )

        self.db.add(new_item)
        await self.db.flush()

        # Atualizar produto com preço se fornecido
        selling_price = item_data.get('selling_price')
        if selling_price is not None and selling_price > 0:
            product.base_price = selling_price

        # Atualizar total_cost da entrada
        item_total_cost = Decimal(str(quantity_received)) * Decimal(str(unit_cost))
        entry.total_cost = (entry.total_cost or Decimal('0')) + item_total_cost

        # Rebuild inventário via FIFO (fonte da verdade = entry_items)
        # Garante que Inventory.quantity == soma de quantity_remaining dos EntryItems ativos
        inv_sync = InventoryService(self.db)
        try:
            delta = await inv_sync.rebuild_product_from_fifo(product_id, tenant_id=tenant_id)
            print(
                f"  [Inventory Sync ADD_ITEM] Produto {product_id}: "
                f"fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} "
                f"created={delta['created']} updated={delta['updated']}"
            )
        except Exception as sync_err:
            print(f"  [Inventory Sync ADD_ITEM] Falha sync produto {product_id}: {sync_err}")

        # Commit
        await self.db.commit()
        await self.db.refresh(new_item)

        return new_item
    
    async def create_entry_with_new_product(
        self,
        product_data: Dict[str, Any],
        entry_data: Dict[str, Any],
        quantity: int,
        user_id: int,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Cria um NOVO produto (com 1 variante padrão) e uma entrada de estoque em transação atômica.
        
        Garante atomicidade: se qualquer operação falhar, nada é criado.
        
        Args:
            product_data: Dados do novo produto (name, sku, price, etc.)
            entry_data: Dados da entrada (entry_code, supplier_name, etc.)
            quantity: Quantidade do produto na entrada
            user_id: ID do usuário criando
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada criada com o novo produto vinculado
            
        Raises:
            ValueError: Se dados inválidos, SKU duplicado, etc.
        """
        from decimal import Decimal
        from app.schemas.stock_entry import StockEntryCreate
        from app.models.product_variant import ProductVariant
        
        try:
            # 1. Criar o novo produto (pai)
            from app.repositories.product_repository import ProductRepository
            
            product_repo = ProductRepository(self.db)
            
            # Validar dados do produto
            if not product_data.get('name') or not product_data.get('sku'):
                raise ValueError("Nome e SKU do produto são obrigatórios")
            
            # Criar produto pai com is_catalog=False (produto com estoque)
            # Nota: sku, barcode, price, cost_price foram movidos para ProductVariant
            product_dict = {
                'name': product_data['name'].strip(),
                'description': product_data.get('description'),
                'brand': product_data.get('brand'),
                'category_id': product_data.get('category_id'),
                'base_price': Decimal(str(product_data['price'])),
                'is_catalog': False,  # Produto já tem entrada, não é catálogo
                'is_active': True,
            }
            
            # Criar produto pai
            product = await product_repo.create(product_dict, tenant_id=tenant_id)
            await self.db.flush()
            
            # 2. Criar variante padrão (produto simples = 1 variante)
            variant = ProductVariant(
                product_id=product.id,
                sku=product_data['sku'].strip().upper(),
                color=product_data.get('color'),
                size=product_data.get('size'),
                price=Decimal(str(product_data['price'])),
                cost_price=Decimal(str(product_data.get('cost_price', product_data['price']))),
                is_active=True,
                tenant_id=tenant_id,
            )
            self.db.add(variant)
            await self.db.flush()
            
            # 3. Criar entrada de estoque
            unique_code = await self._generate_unique_entry_code(entry_data['entry_code'], tenant_id=tenant_id)
            entry_dict = StockEntryCreate(
                entry_code=unique_code,
                entry_date=entry_data.get('entry_date'),
                entry_type=entry_data.get('entry_type'),
                trip_id=entry_data.get('trip_id'),
                supplier_name=entry_data.get('supplier_name'),
                supplier_cnpj=entry_data.get('supplier_cnpj'),
                supplier_contact=entry_data.get('supplier_contact'),
                invoice_number=entry_data.get('invoice_number'),
                payment_method=entry_data.get('payment_method'),
                notes=entry_data.get('notes'),
            )
            
            entry_dict_dict = entry_dict.model_dump(exclude_unset=True)
            entry_dict_dict['total_cost'] = Decimal('0.00')
            
            entry = await self.entry_repo.create(self.db, entry_dict_dict, tenant_id=tenant_id)
            await self.db.flush()
            
            # 4. Criar item da entrada (vinculado à variante)
            unit_cost = Decimal(str(product_data.get('cost_price', product_data['price'])))
            item = EntryItem(
                entry_id=entry.id,
                product_id=product.id,
                variant_id=variant.id,  # Vincular à variante
                quantity_received=quantity,
                quantity_remaining=quantity,  # Todo estoque disponível
                unit_cost=unit_cost,
                notes=entry_data.get('notes', ''),
                tenant_id=tenant_id,
                is_active=True,
            )
            
            self.db.add(item)
            await self.db.flush()
            
            # 5. Calcular e atualizar total_cost da entrada
            item_total_cost = Decimal(str(quantity)) * unit_cost
            entry.total_cost = item_total_cost
            
            # 6. Atualizar estoque do produto via rebuild FIFO
            inv_sync = InventoryService(self.db)
            try:
                delta = await inv_sync.rebuild_product_from_fifo(product.id, tenant_id=tenant_id)
                print(f"  [Inventory Sync NEW_PRODUCT] Produto {product.id}: fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} created={delta['created']} updated={delta['updated']}")
            except Exception as sync_err:
                print(f"  [Inventory Sync NEW_PRODUCT] Falha sync produto {product.id}: {sync_err}")
            
            # 7. Commit de tudo (transação atômica)
            await self.db.commit()
            await self.db.refresh(entry)
            
            # Recarregar com itens
            entry = await self.entry_repo.get_by_id(self.db, entry.id, include_items=True, tenant_id=tenant_id)
            
            return entry
            
        except Exception as e:
            await self.db.rollback()
            raise e

    async def create_entry_with_new_product_variants(
        self,
        product_data: Dict[str, Any],
        variants_data: List[Dict[str, Any]],
        entry_data: Dict[str, Any],
        user_id: int,
        *,
        tenant_id: int,
    ) -> StockEntry:
        """
        Cria um NOVO produto com variantes e uma entrada de estoque em transação atômica.
        
        Garante atomicidade: se qualquer operação falhar, nada é criado.
        
        Args:
            product_data: Dados do novo produto (name, description, brand, category_id, base_price)
            variants_data: Lista de variantes com sku, color, size, price, cost_price, quantity
            entry_data: Dados da entrada (entry_code, supplier_name, etc.)
            user_id: ID do usuário criando
            tenant_id: ID do tenant
            
        Returns:
            StockEntry: Entrada criada com as variantes do novo produto vinculadas
            
        Raises:
            ValueError: Se dados inválidos, etc.
        """
        from decimal import Decimal
        from app.schemas.stock_entry import StockEntryCreate
        from app.models.product_variant import ProductVariant
        
        try:
            # 1. Criar o novo produto (pai)
            from app.repositories.product_repository import ProductRepository
            
            product_repo = ProductRepository(self.db)
            
            # Validar dados do produto
            if not product_data.get('name') or not product_data.get('category_id'):
                raise ValueError("Nome e categoria do produto são obrigatórios")
            
            # Criar produto pai com is_catalog=False (produto com estoque)
            product_dict = {
                'name': product_data['name'].strip(),
                'description': product_data.get('description'),
                'brand': product_data.get('brand'),
                'category_id': product_data.get('category_id'),
                'base_price': Decimal(str(product_data['base_price'])),
                'is_catalog': False,  # Produto já tem entrada, não é catálogo
                'is_active': True,
            }
            
            # Criar produto pai
            product = await product_repo.create(product_dict, tenant_id=tenant_id)
            await self.db.flush()
            
            # 2. Criar variantes
            created_variants = []
            for variant_dict in variants_data:
                variant = ProductVariant(
                    product_id=product.id,
                    sku=variant_dict.get('sku'),
                    color=variant_dict.get('color'),
                    size=variant_dict.get('size'),
                    price=Decimal(str(variant_dict.get('price', product_data['base_price']))),
                    cost_price=Decimal(str(variant_dict['cost_price'])) if variant_dict.get('cost_price') else None,
                    is_active=True,
                    tenant_id=tenant_id,
                )
                self.db.add(variant)
                await self.db.flush()
                created_variants.append(variant)
            
            # 3. Criar entrada de estoque
            unique_code = await self._generate_unique_entry_code(entry_data['entry_code'], tenant_id=tenant_id)
            entry_dict = StockEntryCreate(
                entry_code=unique_code,
                entry_date=entry_data.get('entry_date'),
                entry_type=entry_data.get('entry_type'),
                trip_id=entry_data.get('trip_id'),
                supplier_name=entry_data.get('supplier_name'),
                supplier_cnpj=entry_data.get('supplier_cnpj'),
                supplier_contact=entry_data.get('supplier_contact'),
                invoice_number=entry_data.get('invoice_number'),
                payment_method=entry_data.get('payment_method'),
                notes=entry_data.get('notes'),
            )
            
            entry_dict_dict = entry_dict.model_dump(exclude_unset=True)
            entry_dict_dict['total_cost'] = Decimal('0.00')
            
            entry = await self.entry_repo.create(self.db, entry_dict_dict, tenant_id=tenant_id)
            await self.db.flush()
            
            # 4. Criar itens da entrada para cada variante
            total_cost = Decimal('0.00')
            for i, variant in enumerate(created_variants):
                # Obter quantidade da variante (está em variants_data, não em variant_quantities)
                variant_dict = variants_data[i]
                quantity = variant_dict.get('quantity', 0)
                if quantity <= 0:
                    continue  # Pular variantes sem quantidade
                
                unit_cost = Decimal(str(variant.cost_price)) if variant.cost_price else Decimal(str(variant.price * Decimal('0.5')))
                
                item = EntryItem(
                    entry_id=entry.id,
                    product_id=product.id,
                    variant_id=variant.id,
                    quantity_received=quantity,
                    quantity_remaining=quantity,
                    unit_cost=unit_cost,
                    tenant_id=tenant_id,
                    is_active=True,
                )
                self.db.add(item)
                await self.db.flush()
                
                total_cost += Decimal(str(quantity)) * unit_cost
            
            entry.total_cost = total_cost
            
            # 5. Atualizar estoque do produto via rebuild FIFO
            inv_sync = InventoryService(self.db)
            try:
                delta = await inv_sync.rebuild_product_from_fifo(product.id, tenant_id=tenant_id)
                print(f"  [Inventory Sync NEW_PRODUCT_VARIANTS] Produto {product.id}: fifo={delta['fifo_sum']} inv={delta['inventory_quantity']} created={delta['created']} updated={delta['updated']}")
            except Exception as sync_err:
                print(f"  [Inventory Sync NEW_PRODUCT_VARIANTS] Falha sync produto {product.id}: {sync_err}")
            
            # 6. Commit de tudo (transação atômica)
            await self.db.commit()
            await self.db.refresh(entry)
            
            # Recarregar com itens
            entry = await self.entry_repo.get_by_id(self.db, entry.id, include_items=True, tenant_id=tenant_id)
            
            return entry
            
        except Exception as e:
            await self.db.rollback()
            raise e

    async def correct_entry_item(
        self,
        item_id: int,
        quantity_diff: int,
        reason: str,
        tenant_id: int,
        user_id: int,
    ) -> dict:
        """
        Corrige um item de entrada com auditoria, mesmo após vendas.

        diff > 0: adiciona unidades (cria EntryItem corretivo na mesma entrada)
        diff < 0: remove unidades (reduz quantity_remaining se houver saldo)

        Preserva FIFO e histórico de vendas intactos.
        """
        from app.core.timezone import now_brazil

        item = await self.item_repo.get_by_id(self.db, item_id, include_relations=True)
        if not item:
            raise ValueError(f"EntryItem {item_id} não encontrado")
        if item.tenant_id != tenant_id:
            raise ValueError("EntryItem não pertence a este tenant")
        if quantity_diff == 0:
            raise ValueError("quantity_diff não pode ser zero")

        now_str = now_brazil().strftime("%d/%m/%Y %H:%M")
        audit_note = f"[CORREÇÃO {now_str} user#{user_id}]: {reason}"

        corrective_item_id = None

        if quantity_diff > 0:
            # Adicionar unidades: novo EntryItem corretivo na mesma entrada
            from app.models.entry_item import EntryItem
            corrective = EntryItem(
                stock_entry_id=item.stock_entry_id,
                product_id=item.product_id,
                variant_id=item.variant_id,
                quantity_received=quantity_diff,
                quantity_remaining=quantity_diff,
                quantity_sold=0,
                unit_cost=item.unit_cost,
                tenant_id=tenant_id,
                notes=audit_note,
            )
            self.db.add(corrective)
            await self.db.flush()
            corrective_item_id = corrective.id

            # Atualizar inventário: +quantity_diff
            inventory = await self.inventory_repo.get_by_product(self.db, item.product_id, tenant_id=tenant_id)
            if inventory:
                await self.inventory_repo.update(
                    self.db,
                    id=inventory.id,
                    obj_in={"quantity": inventory.quantity + quantity_diff},
                    tenant_id=tenant_id,
                )
            new_remaining = item.quantity_remaining + quantity_diff

        else:
            # Remover unidades: reduzir quantity_remaining do item original
            remove = abs(quantity_diff)
            if remove > item.quantity_remaining:
                raise ValueError(
                    f"Não é possível remover {remove} unidade(s): apenas {item.quantity_remaining} disponível(is) "
                    f"(já foram vendidas {item.quantity_sold})."
                )
            new_remaining = item.quantity_remaining - remove
            existing_notes = item.notes or ""
            await self.item_repo.update(
                self.db,
                id=item_id,
                obj_in={
                    "quantity_remaining": new_remaining,
                    "notes": f"{existing_notes}\n{audit_note}".strip(),
                },
                tenant_id=tenant_id,
            )
            # Atualizar inventário: -remove
            inventory = await self.inventory_repo.get_by_product(self.db, item.product_id, tenant_id=tenant_id)
            if inventory:
                await self.inventory_repo.update(
                    self.db,
                    id=inventory.id,
                    obj_in={"quantity": max(0, inventory.quantity - remove)},
                    tenant_id=tenant_id,
                )

        # Append nota de auditoria no item original (para rastreio)
        if quantity_diff > 0:
            existing_notes = item.notes or ""
            await self.item_repo.update(
                self.db,
                id=item_id,
                obj_in={"notes": f"{existing_notes}\n{audit_note}".strip()},
                tenant_id=tenant_id,
            )

        await self.db.commit()

        return {
            "message": f"Correção aplicada: {'+' if quantity_diff > 0 else ''}{quantity_diff} unidade(s)",
            "original_item_id": item_id,
            "quantity_diff": quantity_diff,
            "new_quantity_remaining": new_remaining,
            "reason": reason,
            "corrective_item_id": corrective_item_id,
        }
