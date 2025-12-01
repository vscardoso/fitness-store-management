"""
Serviço de gerenciamento de estoque e inventário.
"""
from typing import Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory, MovementType
from app.models.entry_item import EntryItem
from app.models.sale import SaleItem
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository


class InventoryService:
    """Serviço para operações de negócio com estoque."""
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço de inventário.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.inventory_repo = InventoryRepository(db)
        self.product_repo = ProductRepository(db)
    
    async def rebuild_product_from_fifo(self, product_id: int, *, tenant_id: int | None = None) -> dict:
        """Recalcula o estoque derivado (inventory) para um produto a partir da soma FIFO (entry_items).

        Regras:
        - Soma apenas entry_items ativos.
        - Cria registro de inventory se não existir.
        - Atualiza quantidade diretamente (sem movimentos) se houver divergência.
        - Retorna metadados da operação.
        """
        from sqlalchemy import select, func

        # Soma FIFO
        stmt = select(func.coalesce(func.sum(EntryItem.quantity_remaining), 0)).where(EntryItem.product_id == product_id, EntryItem.is_active == True)
        if tenant_id is not None:
            stmt = stmt.where(EntryItem.tenant_id == tenant_id)
        result = await self.db.execute(stmt)
        fifo_sum = int(result.scalar_one() or 0)

        # Inventory atual
        current = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)

        created = False
        updated = False
        previous_qty = None

        if current is None:
            inv_data = {
                'product_id': product_id,
                'quantity': fifo_sum,
                'min_stock': 5,
                'is_active': True
            }
            current = await self.inventory_repo.create(self.db, inv_data, tenant_id=tenant_id)
            created = True
        else:
            previous_qty = current.quantity
            if current.quantity != fifo_sum:
                current.quantity = fifo_sum
                updated = True
        # Commit local apenas se houve criação/atualização
        if created or updated:
            await self.db.commit()
            await self.db.refresh(current)

        return {
            'product_id': product_id,
            'tenant_id': tenant_id,
            'fifo_sum': fifo_sum,
            'inventory_quantity': current.quantity if current else fifo_sum,
            'created': created,
            'updated': updated,
            'previous_quantity': previous_qty
        }

    async def rebuild_all_from_fifo(self, *, tenant_id: int) -> list[dict]:
        """Recalcula inventário de todos os produtos do tenant com base no FIFO.

        Retorna lista de deltas por produto.
        """
        from sqlalchemy import select, func, update

        # Coletar somas FIFO por produto
        stmt = (
            select(
                EntryItem.product_id,
                func.coalesce(func.sum(EntryItem.quantity_remaining), 0).label("fifo_sum")
            )
            .where(EntryItem.is_active == True)
            .where(EntryItem.tenant_id == tenant_id)
            .group_by(EntryItem.product_id)
        )
        rows = (await self.db.execute(stmt)).all()
        fifo_map = {r[0]: int(r[1]) for r in rows}

        # Inventários existentes do tenant
        inv_stmt = select(Inventory).where(Inventory.tenant_id == tenant_id)
        inv_list = (await self.db.execute(inv_stmt)).scalars().all()
        inv_map = {inv.product_id: inv for inv in inv_list}

        deltas: list[dict] = []
        touched: set[int] = set()

        # Atualizar/criar para produtos com entry_items
        for pid, fifo_sum in fifo_map.items():
            touched.add(pid)
            inv = inv_map.get(pid)
            if inv is None:
                new_inv = Inventory(product_id=pid, quantity=fifo_sum)
                new_inv.tenant_id = tenant_id
                self.db.add(new_inv)
                deltas.append({
                    'product_id': pid,
                    'tenant_id': tenant_id,
                    'fifo_sum': fifo_sum,
                    'inventory_quantity': fifo_sum,
                    'created': True,
                    'updated': False,
                    'previous_quantity': None,
                })
            elif inv.quantity != fifo_sum:
                prev = inv.quantity
                inv.quantity = fifo_sum
                deltas.append({
                    'product_id': pid,
                    'tenant_id': tenant_id,
                    'fifo_sum': fifo_sum,
                    'inventory_quantity': fifo_sum,
                    'created': False,
                    'updated': True,
                    'previous_quantity': prev,
                })

        # Para inventários existentes sem entry_items ativos, zera
        for pid, inv in inv_map.items():
            if pid in touched:
                continue
            if inv.quantity != 0:
                prev = inv.quantity
                inv.quantity = 0
                deltas.append({
                    'product_id': pid,
                    'tenant_id': tenant_id,
                    'fifo_sum': 0,
                    'inventory_quantity': 0,
                    'created': False,
                    'updated': True,
                    'previous_quantity': prev,
                })

        if deltas:
            await self.db.commit()

        return deltas

    async def reconcile_costs(self, *, tenant_id: int, product_id: int | None = None) -> dict:
        """Gera um resumo de reconciliação de custo FIFO.

        - custo_recebido_total: Σ(qty_received * unit_cost)
        - custo_restante: Σ(qty_remaining * unit_cost)
        - custo_vendido_entry_items: custo_recebido_total - custo_restante
        - custo_vendido_por_fontes: soma das fontes em sale_sources (se existirem)
        - diferenca: custo_vendido_por_fontes - custo_vendido_entry_items
        """
        from sqlalchemy import select, func

        # Somas por entry_items
        ei_stmt = select(
            func.coalesce(func.sum(EntryItem.quantity_received * EntryItem.unit_cost), 0),
            func.coalesce(func.sum(EntryItem.quantity_remaining * EntryItem.unit_cost), 0),
        ).where(EntryItem.tenant_id == tenant_id)
        if product_id is not None:
            ei_stmt = ei_stmt.where(EntryItem.product_id == product_id)
        received_cost, remaining_cost = (await self.db.execute(ei_stmt)).one()

        received_cost = float(received_cost or 0)
        remaining_cost = float(remaining_cost or 0)
        sold_cost_entry_items = received_cost - remaining_cost

        # Somar via sale_sources
        si_stmt = select(SaleItem.sale_sources).where(SaleItem.tenant_id == tenant_id)
        if product_id is not None:
            si_stmt = si_stmt.where(SaleItem.product_id == product_id)
        rows = (await self.db.execute(si_stmt)).scalars().all()
        sold_cost_sources = 0.0
        units_sold_sources = 0
        for src in rows:
            if not src or 'sources' not in src:
                continue
            for s in src['sources']:
                qty = int(s.get('quantity_taken', 0))
                unit_cost = float(s.get('unit_cost', 0))
                sold_cost_sources += qty * unit_cost
                units_sold_sources += qty

        diff = sold_cost_sources - sold_cost_entry_items

        return {
            'tenant_id': tenant_id,
            'product_id': product_id,
            'custo_recebido_total': round(received_cost, 2),
            'custo_restante': round(remaining_cost, 2),
            'custo_vendido_entry_items': round(sold_cost_entry_items, 2),
            'custo_vendido_por_fontes': round(sold_cost_sources, 2),
            'diferenca': round(diff, 2),
            'unidades_vendidas_por_fontes': units_sold_sources,
        }
    
    async def add_stock(
        self,
        product_id: int,
        quantity: int,
        movement_type: MovementType = MovementType.PURCHASE,
        reference_id: Optional[str] = None,
        notes: Optional[str] = None,
        *,
        tenant_id: int | None = None,
    ) -> Inventory:
        """
        Adiciona estoque a um produto (entrada manual).
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a adicionar
            movement_type: Tipo de movimentação (padrão: PURCHASE)
            reference_id: Referência externa (ex: número da nota fiscal)
            notes: Observações sobre a movimentação
            
        Returns:
            Inventory: Registro de estoque atualizado
            
        Raises:
            ValueError: Se produto não existe ou quantidade inválida
        """
        if quantity <= 0:
            raise ValueError("Quantidade deve ser maior que zero")
        
        # Verificar se produto existe e pertence ao tenant
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(
                f"Produto {product_id} não encontrado. "
                f"Verifique se o produto existe e pertence à sua loja."
            )
        
        if not product.is_active:
            raise ValueError("Produto não está ativo. Reative o produto antes de adicionar estoque.")
        
        # Buscar ou criar inventário
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        if not inventory:
            # Criar inventário inicial com tenant_id
            inventory_data = {
                'product_id': product_id,
                'quantity': 0,
                'min_stock': 5,
                'is_active': True,
                'tenant_id': tenant_id
            }
            inventory = await self.inventory_repo.create(self.db, inventory_data)
        
        # Adicionar estoque com movimento
        inventory = await self.inventory_repo.add_stock(
            product_id,
            quantity=quantity,
            movement_type=movement_type,
            reference_id=reference_id,
            notes=notes or f"Entrada de estoque - {quantity} unidades",
            tenant_id=tenant_id,
        )
        
        await self.db.commit()
        await self.db.refresh(inventory)
        
        return inventory
    
    async def remove_stock(
        self,
        product_id: int,
        quantity: int,
        movement_type: MovementType = MovementType.ADJUSTMENT,
        reference_id: Optional[str] = None,
        notes: Optional[str] = None,
        *,
        tenant_id: int | None = None,
    ) -> Inventory:
        """
        Remove estoque de um produto (saída manual).
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a remover
            movement_type: Tipo de movimentação (padrão: ADJUSTMENT)
            reference_id: Referência externa
            notes: Observações sobre a movimentação
            
        Returns:
            Inventory: Registro de estoque atualizado
            
        Raises:
            ValueError: Se estoque insuficiente ou produto não existe
        """
        if quantity <= 0:
            raise ValueError("Quantidade deve ser maior que zero")
        
        # Verificar se produto existe
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")
        
        # Verificar disponibilidade
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        if not inventory:
            raise ValueError(f"Produto {product_id} não possui registro de estoque")
        
        if inventory.quantity < quantity:
            raise ValueError(
                f"Estoque insuficiente. "
                f"Disponível: {inventory.quantity}, Solicitado: {quantity}"
            )
        
        # Remover estoque com movimento
        inventory = await self.inventory_repo.remove_stock(
            product_id,
            quantity=quantity,
            movement_type=movement_type,
            reference_id=reference_id,
            notes=notes or f"Saída de estoque - {quantity} unidades",
            tenant_id=tenant_id,
        )
        
        await self.db.commit()
        await self.db.refresh(inventory)
        
        return inventory
    
    async def transfer_stock(
        self,
        product_id: int,
        from_location: str,
        to_location: str,
        quantity: int,
        reference_id: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Inventory:
        """
        Transfere estoque entre localizações.
        
        Args:
            product_id: ID do produto
            from_location: Localização de origem
            to_location: Localização de destino
            quantity: Quantidade a transferir
            reference_id: Referência da transferência
            notes: Observações
            
        Returns:
            Inventory: Registro de estoque atualizado
            
        Raises:
            ValueError: Se estoque insuficiente ou dados inválidos
        """
        if quantity <= 0:
            raise ValueError("Quantidade deve ser maior que zero")
        
        # Verificar disponibilidade na origem
        inventory = await self.inventory_repo.get_by_product(product_id)
        if not inventory:
            raise ValueError(f"Produto {product_id} não possui estoque")
        
        if inventory.quantity < quantity:
            raise ValueError("Estoque insuficiente para transferência")
        
        # Criar movimentação de transferência
        transfer_notes = notes or f"Transferência: {from_location} → {to_location}"
        
        await self.inventory_repo.remove_stock(
            product_id,
            quantity=quantity,
            movement_type=MovementType.TRANSFER,
            reference_id=reference_id,
            notes=transfer_notes
        )
        
        # Atualizar localização do inventário
        await self.inventory_repo.update(
            self.db,
            inventory.id,
            {'location': to_location}
        )
        
        await self.db.commit()
        await self.db.refresh(inventory)
        
        return inventory
    
    async def adjust_stock(
        self,
        product_id: int,
        new_quantity: int,
        reason: str,
        reference_id: Optional[str] = None
    ) -> Inventory:
        """
        Ajusta estoque para uma quantidade específica.
        
        Usado para correções de inventário ou contagens físicas.
        
        Args:
            product_id: ID do produto
            new_quantity: Nova quantidade em estoque
            reason: Motivo do ajuste
            reference_id: Referência do ajuste
            
        Returns:
            Inventory: Registro de estoque atualizado
            
        Raises:
            ValueError: Se quantidade negativa ou produto não existe
        """
        if new_quantity < 0:
            raise ValueError("Quantidade não pode ser negativa")
        
        inventory = await self.inventory_repo.get_by_product(product_id)
        if not inventory:
            raise ValueError(f"Produto {product_id} não possui estoque")
        
        current_quantity = inventory.quantity
        difference = new_quantity - current_quantity
        
        if difference == 0:
            return inventory
        
        # Criar movimentação de ajuste
        notes = f"Ajuste de estoque: {current_quantity} → {new_quantity}. Motivo: {reason}"
        
        if difference > 0:
            # Adicionar
            inventory = await self.inventory_repo.add_stock(
                product_id,
                quantity=difference,
                movement_type=MovementType.ADJUSTMENT,
                reference_id=reference_id,
                notes=notes
            )
        else:
            # Remover
            inventory = await self.inventory_repo.remove_stock(
                product_id,
                quantity=abs(difference),
                movement_type=MovementType.ADJUSTMENT,
                reference_id=reference_id,
                notes=notes
            )
        
        await self.db.commit()
        await self.db.refresh(inventory)
        
        return inventory
    
    async def check_availability(
        self,
        product_id: int,
        quantity: int,
        *,
        tenant_id: int | None = None,
    ) -> bool:
        """
        Verifica disponibilidade de estoque para um produto.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade desejada
            tenant_id: ID do tenant
            
        Returns:
            bool: True se estoque disponível, False caso contrário
        """
        if quantity <= 0:
            return False
        
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        return inventory is not None and inventory.quantity >= quantity
    
    async def get_stock_level(self, product_id: int, *, tenant_id: int | None = None) -> Dict[str, any]:
        """
        Obtém nível de estoque detalhado de um produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Dict: Informações detalhadas do estoque
        """
        product = await self.product_repo.get(self.db, product_id, tenant_id=tenant_id)
        if not product:
            raise ValueError(f"Produto {product_id} não encontrado")
        
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        
        if not inventory:
            return {
                'product_id': product_id,
                'product_name': product.name,
                'sku': product.sku,
                'quantity': 0,
                'min_stock': 0,
                'status': 'no_inventory',
                'available': False
            }
        
        # Determinar status
        status = 'ok'
        if inventory.quantity == 0:
            status = 'out_of_stock'
        elif inventory.quantity <= inventory.min_stock:
            status = 'low_stock'
        
        return {
            'product_id': product_id,
            'product_name': product.name,
            'sku': product.sku,
            'quantity': inventory.quantity,
            'min_stock': inventory.min_stock,
            'max_stock': inventory.max_stock,
            'location': inventory.location,
            'status': status,
            'available': inventory.quantity > 0
        }
    
    async def get_stock_alerts(self, *, tenant_id: int | None = None) -> List[Dict[str, any]]:
        """
        Obtém alertas de produtos com estoque baixo ou zerado.
        
        Args:
            tenant_id: ID do tenant
        
        Returns:
            List[Dict]: Lista de alertas de estoque
        """
        low_stock_items = await self.inventory_repo.get_low_stock_products(tenant_id=tenant_id)
        alerts = []
        
        for inventory in low_stock_items:
            product = await self.product_repo.get(self.db, inventory.product_id, tenant_id=tenant_id)
            if not product or not product.is_active:
                continue
            
            deficit = inventory.min_stock - inventory.quantity
            severity = 'critical' if inventory.quantity == 0 else 'warning'
            
            alerts.append({
                'product_id': product.id,
                'product_name': product.name,
                'sku': product.sku,
                'current_stock': inventory.quantity,
                'min_stock': inventory.min_stock,
                'deficit': deficit,
                'severity': severity,
                'location': inventory.location
            })
        
        # Ordenar por severidade (crítico primeiro) e depois por déficit
        alerts.sort(key=lambda x: (0 if x['severity'] == 'critical' else 1, -x['deficit']))
        
        return alerts
    
    async def get_movement_history(
        self,
        product_id: int,
        limit: int = 50,
        *,
        tenant_id: int | None = None,
    ) -> List[Dict[str, any]]:
        """
        Obtém histórico de movimentações de um produto.
        
        Args:
            product_id: ID do produto
            limit: Número máximo de registros
            tenant_id: ID do tenant
            
        Returns:
            List[Dict]: Histórico de movimentações
        """
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        if not inventory:
            return []
        
        movements = await self.inventory_repo.get_movements_by_product(inventory.id, tenant_id=tenant_id)
        
        history = []
        for movement in movements[:limit]:
            history.append({
                'id': movement.id,
                'movement_type': movement.movement_type.value,
                'quantity_before': movement.quantity_before,
                'quantity_change': movement.quantity_change,
                'quantity_after': movement.quantity_after,
                'reference_id': movement.reference_id,
                'notes': movement.notes,
                'created_at': movement.created_at.isoformat()
            })
        
        return history
    
    async def reserve_stock(
        self,
        product_id: int,
        quantity: int,
        reference_id: str,
        notes: Optional[str] = None
    ) -> bool:
        """
        Reserva estoque para uma venda/pedido.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a reservar
            reference_id: ID da venda/pedido
            notes: Observações
            
        Returns:
            bool: True se reservado com sucesso
            
        Raises:
            ValueError: Se estoque insuficiente
        """
        # Verificar disponibilidade
        if not await self.check_availability(product_id, quantity):
            raise ValueError("Estoque insuficiente para reserva")
        
        # Por enquanto, apenas registramos a movimentação
        # Em um sistema mais complexo, teríamos uma tabela de reservas
        inventory = await self.inventory_repo.get_by_product(product_id)
        
        await self.inventory_repo.remove_stock(
            inventory.id,
            quantity=quantity,
            movement_type=MovementType.SALE,
            reference_id=reference_id,
            notes=notes or f"Reserva para venda {reference_id}"
        )
        
        await self.db.commit()
        return True
    
    async def update_min_stock(
        self,
        product_id: int,
        min_stock: int
    ) -> Inventory:
        """
        Atualiza o estoque mínimo de um produto.
        
        Args:
            product_id: ID do produto
            min_stock: Novo estoque mínimo
            
        Returns:
            Inventory: Registro atualizado
            
        Raises:
            ValueError: Se valor inválido
        """
        if min_stock < 0:
            raise ValueError("Estoque mínimo não pode ser negativo")
        
        inventory = await self.inventory_repo.get_by_product(product_id)
        if not inventory:
            raise ValueError(f"Produto {product_id} não possui estoque")
        
        updated = await self.inventory_repo.update(
            self.db,
            inventory.id,
            {'min_stock': min_stock}
        )
        
        await self.db.commit()
        await self.db.refresh(updated)
        
        return updated
    
    async def register_damage(
        self,
        product_id: int,
        quantity: int,
        reason: str,
        reference_id: Optional[str] = None
    ) -> Inventory:
        """
        Registra avaria/perda de produtos.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade danificada
            reason: Motivo da avaria
            reference_id: Referência
            
        Returns:
            Inventory: Estoque atualizado
        """
        notes = f"Avaria registrada: {reason}"
        
        return await self.remove_stock(
            product_id=product_id,
            quantity=quantity,
            movement_type=MovementType.DAMAGE,
            reference_id=reference_id,
            notes=notes
        )
    
    async def register_return(
        self,
        product_id: int,
        quantity: int,
        reference_id: str,
        notes: Optional[str] = None
    ) -> Inventory:
        """
        Registra devolução de produtos.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade devolvida
            reference_id: ID da venda original
            notes: Observações
            
        Returns:
            Inventory: Estoque atualizado
        """
        return_notes = notes or f"Devolução da venda {reference_id}"
        
        return await self.add_stock(
            product_id=product_id,
            quantity=quantity,
            movement_type=MovementType.RETURN,
            reference_id=reference_id,
            notes=return_notes
        )
