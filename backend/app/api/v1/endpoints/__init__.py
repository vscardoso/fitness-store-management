"""
Endpoints da API v1.

Este módulo exporta todos os routers de endpoints da API v1,
facilitando a importação centralizada.

Módulos disponíveis:
    - auth: Autenticação e autorização
    - products: Gerenciamento de produtos
    - sales: Processamento de vendas
    - inventory: Controle de estoque
    - customers: Gerenciamento de clientes
    - categories: Gerenciamento de categorias
"""

from . import (
    auth,
    products,
    sales,
    inventory,
    customers,
    categories
)

__all__ = [
    "auth",
    "products",
    "sales",
    "inventory",
    "customers",
    "categories",
]
