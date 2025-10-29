"""
Módulo de repositórios para operações de banco de dados.

Este módulo contém todos os repositórios do sistema, implementando o padrão Repository
para abstrair o acesso aos dados e fornecer uma interface limpa para as operações
de CRUD e consultas específicas de cada entidade.

Repositórios disponíveis:
- BaseRepository: Repositório genérico com operações CRUD básicas
- ProductRepository: Operações específicas de produtos
- SaleRepository: Operações específicas de vendas
- InventoryRepository: Operações de inventário e controle de estoque
- CustomerRepository: Operações específicas de clientes
- UserRepository: Operações específicas de usuários
- CategoryRepository: Operações específicas de categorias com hierarquia
"""

from .base import BaseRepository
from .product_repository import ProductRepository
from .sale_repository import SaleRepository
from .inventory_repository import InventoryRepository
from .customer_repository import CustomerRepository
from .user_repository import UserRepository
from .category_repository import CategoryRepository

__all__ = [
    "BaseRepository",
    "ProductRepository", 
    "SaleRepository",
    "InventoryRepository",
    "CustomerRepository",
    "UserRepository",
    "CategoryRepository"
]
