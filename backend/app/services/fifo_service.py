"""
Serviço de controle FIFO (First In, First Out) para vendas.
"""
from typing import List, Dict, Any
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.entry_item_repository import EntryItemRepository


class FIFOService:
    """
    Serviço para processar vendas usando FIFO (First In, First Out).
    
    Garante que produtos vendidos sejam retirados das entradas mais antigas primeiro,
    mantendo o controle adequado de custos e estoque.
    """
    
    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço FIFO.
        
        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self.item_repo = EntryItemRepository()
    
    async def process_sale(
        self,
        product_id: int,
        quantity: int,
        *,
        tenant_id: int | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Processa uma venda usando FIFO (First In, First Out).
        
        Busca entradas disponíveis do produto (ordenadas por data - mais antigas primeiro)
        e deduz a quantidade vendida, retornando as fontes utilizadas.
        
        Args:
            product_id: ID do produto vendido
            quantity: Quantidade vendida
            
        Returns:
            List[Dict]: Lista de fontes utilizadas na venda:
                [
                    {
                        "entry_id": int,
                        "entry_item_id": int,
                        "quantity_taken": int,
                        "unit_cost": Decimal,
                        "total_cost": Decimal,
                        "entry_code": str,
                        "entry_date": date
                    },
                    ...
                ]
                
        Raises:
            ValueError: Se quantidade insuficiente em estoque
        """
        # Validar quantidade
        if quantity <= 0:
            raise ValueError("Quantity must be greater than 0")
        
        # Buscar itens disponíveis ordenados por FIFO
        available_items = await self.item_repo.get_available_for_product(
            self.db, 
            product_id
        )
        
        if not available_items:
            raise ValueError(
                f"Product {product_id} has no available stock"
            )
        
        # Verificar se há quantidade total suficiente
        total_available = sum(item.quantity_remaining for item in available_items)
        if total_available < quantity:
            raise ValueError(
                f"Insufficient stock for product {product_id}. "
                f"Requested: {quantity}, Available: {total_available}"
            )
        
        # Processar venda usando FIFO
        remaining_to_process = quantity
        sources = []
        
        for item in available_items:
            if remaining_to_process <= 0:
                break
            
            # Determinar quanto retirar deste item
            quantity_to_take = min(item.quantity_remaining, remaining_to_process)
            
            # Deduzir quantidade do item
            success = await self.item_repo.decrease_quantity(
                self.db,
                item.id,
                quantity_to_take
            )
            
            if not success:
                # Rollback se algo der errado
                await self.db.rollback()
                raise ValueError(
                    f"Failed to decrease quantity for entry item {item.id}"
                )
            
            # Calcular custo total desta porção
            total_cost = Decimal(str(quantity_to_take)) * item.unit_cost
            
            # Adicionar à lista de fontes
            source = {
                "entry_id": item.entry_id,
                "entry_item_id": item.id,
                "quantity_taken": quantity_to_take,
                "unit_cost": float(item.unit_cost),
                "total_cost": float(total_cost),
                "entry_code": item.stock_entry.entry_code if item.stock_entry else None,
                "entry_date": item.stock_entry.entry_date.isoformat() if item.stock_entry and item.stock_entry.entry_date else None,
            }
            sources.append(source)
            
            # Atualizar quantidade restante
            remaining_to_process -= quantity_to_take
        
        # Verificar se conseguiu processar tudo
        if remaining_to_process > 0:
            await self.db.rollback()
            raise ValueError(
                f"Failed to process complete sale. Remaining: {remaining_to_process}"
            )
        
        return sources
    
    async def check_availability(
        self, 
        product_id: int, 
        quantity: int
    ) -> Dict[str, Any]:
        """
        Verifica disponibilidade de estoque para um produto.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade desejada
            
        Returns:
            Dict com informações de disponibilidade:
                {
                    "available": bool,
                    "total_available": int,
                    "requested": int,
                    "shortage": int (se insuficiente),
                    "sources_count": int,
                    "oldest_entry_date": date,
                    "newest_entry_date": date
                }
        """
        # Buscar itens disponíveis
        available_items = await self.item_repo.get_available_for_product(
            self.db,
            product_id
        )
        
        if not available_items:
            return {
                "available": False,
                "total_available": 0,
                "requested": quantity,
                "shortage": quantity,
                "sources_count": 0,
                "oldest_entry_date": None,
                "newest_entry_date": None,
            }
        
        # Calcular total disponível
        total_available = sum(item.quantity_remaining for item in available_items)
        is_available = total_available >= quantity
        
        # Datas das entradas
        entry_dates = [
            item.stock_entry.entry_date 
            for item in available_items 
            if item.stock_entry
        ]
        
        return {
            "available": is_available,
            "total_available": total_available,
            "requested": quantity,
            "shortage": max(0, quantity - total_available),
            "sources_count": len(available_items),
            "oldest_entry_date": min(entry_dates) if entry_dates else None,
            "newest_entry_date": max(entry_dates) if entry_dates else None,
        }
    
    async def simulate_sale(
        self, 
        product_id: int, 
        quantity: int
    ) -> Dict[str, Any]:
        """
        Simula uma venda sem modificar o banco de dados.
        
        Útil para preview de custos antes de confirmar a venda.
        
        Args:
            product_id: ID do produto
            quantity: Quantidade a vender
            
        Returns:
            Dict com simulação da venda:
                {
                    "feasible": bool,
                    "sources": List[Dict],
                    "total_cost": Decimal,
                    "average_unit_cost": Decimal
                }
                
        Raises:
            ValueError: Se quantidade insuficiente
        """
        # Buscar itens disponíveis
        available_items = await self.item_repo.get_available_for_product(
            self.db,
            product_id
        )
        
        if not available_items:
            return {
                "feasible": False,
                "sources": [],
                "total_cost": Decimal("0.00"),
                "average_unit_cost": Decimal("0.00"),
                "error": "No stock available"
            }
        
        # Verificar disponibilidade total
        total_available = sum(item.quantity_remaining for item in available_items)
        if total_available < quantity:
            return {
                "feasible": False,
                "sources": [],
                "total_cost": Decimal("0.00"),
                "average_unit_cost": Decimal("0.00"),
                "error": f"Insufficient stock. Available: {total_available}, Requested: {quantity}"
            }
        
        # Simular alocação FIFO
        remaining_to_allocate = quantity
        sources = []
        total_cost = Decimal("0.00")
        
        for item in available_items:
            if remaining_to_allocate <= 0:
                break
            
            quantity_to_take = min(item.quantity_remaining, remaining_to_allocate)
            cost = Decimal(str(quantity_to_take)) * item.unit_cost
            total_cost += cost
            
            sources.append({
                "entry_id": item.entry_id,
                "entry_item_id": item.id,
                "quantity_taken": quantity_to_take,
                "unit_cost": float(item.unit_cost),
                "total_cost": float(cost),
                "entry_code": item.stock_entry.entry_code if item.stock_entry else None,
                "entry_date": item.stock_entry.entry_date.isoformat() if item.stock_entry and item.stock_entry.entry_date else None,
            })
            
            remaining_to_allocate -= quantity_to_take
        
        # Calcular custo médio
        average_unit_cost = total_cost / Decimal(str(quantity)) if quantity > 0 else Decimal("0.00")
        
        return {
            "feasible": True,
            "sources": sources,
            "total_cost": float(total_cost),
            "average_unit_cost": float(average_unit_cost),
        }
    
    async def get_product_cost_info(
        self, 
        product_id: int
    ) -> Dict[str, Any]:
        """
        Obtém informações de custo de um produto baseado no estoque FIFO.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Dict com informações de custo:
                {
                    "total_quantity": int,
                    "total_cost": Decimal,
                    "average_unit_cost": Decimal,
                    "oldest_unit_cost": Decimal,
                    "newest_unit_cost": Decimal,
                    "sources_count": int
                }
        """
        # Buscar itens disponíveis
        available_items = await self.item_repo.get_available_for_product(
            self.db,
            product_id
        )
        
        if not available_items:
            return {
                "total_quantity": 0,
                "total_cost": Decimal("0.00"),
                "average_unit_cost": Decimal("0.00"),
                "oldest_unit_cost": None,
                "newest_unit_cost": None,
                "sources_count": 0,
            }
        
        # Calcular métricas
        total_quantity = sum(item.quantity_remaining for item in available_items)
        total_cost = sum(
            Decimal(str(item.quantity_remaining)) * item.unit_cost 
            for item in available_items
        )
        average_unit_cost = total_cost / Decimal(str(total_quantity)) if total_quantity > 0 else Decimal("0.00")
        
        # Custos unitários (primeiro = mais antigo, último = mais novo)
        oldest_unit_cost = available_items[0].unit_cost if available_items else None
        newest_unit_cost = available_items[-1].unit_cost if available_items else None
        
        return {
            "total_quantity": total_quantity,
            "total_cost": float(total_cost),
            "average_unit_cost": float(average_unit_cost),
            "oldest_unit_cost": float(oldest_unit_cost) if oldest_unit_cost else None,
            "newest_unit_cost": float(newest_unit_cost) if newest_unit_cost else None,
            "sources_count": len(available_items),
        }
    
    async def reverse_sale(
        self,
        sources: List[Dict[str, Any]]
    ) -> bool:
        """
        Reverte uma venda, devolvendo quantidades aos entry_items.
        
        Útil para estornos e cancelamentos de vendas.
        
        Args:
            sources: Lista de fontes da venda original (retornado por process_sale)
            
        Returns:
            bool: True se revertido com sucesso
            
        Raises:
            ValueError: Se houver erro ao reverter
        """
        try:
            for source in sources:
                entry_item_id = source["entry_item_id"]
                quantity_to_return = source["quantity_taken"]
                
                # Aumentar quantidade do item
                success = await self.item_repo.increase_quantity(
                    self.db,
                    entry_item_id,
                    quantity_to_return
                )
                
                if not success:
                    await self.db.rollback()
                    raise ValueError(
                        f"Failed to return quantity to entry item {entry_item_id}"
                    )
            
            await self.db.commit()
            return True
            
        except Exception as e:
            await self.db.rollback()
            raise ValueError(f"Failed to reverse sale: {str(e)}")
