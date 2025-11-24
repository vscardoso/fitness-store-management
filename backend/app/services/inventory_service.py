"""
Serviço de gerenciamento de estoque e inventário.
"""
from typing import Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory, MovementType
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
            inventory.id,
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
            inventory.id,
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
                inventory.id,
                quantity=difference,
                movement_type=MovementType.ADJUSTMENT,
                reference_id=reference_id,
                notes=notes
            )
        else:
            # Remover
            inventory = await self.inventory_repo.remove_stock(
                inventory.id,
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
