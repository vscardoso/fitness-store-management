"""
Router principal da API v1.

Este módulo agrega todos os routers de endpoints da API v1,
centralizando o registro de rotas no aplicativo FastAPI.

Routers incluídos:
    - /auth: Autenticação (register, login, logout, refresh)
    - /products: CRUD de produtos + lookups (SKU, barcode, low-stock)
    - /sales: Processamento de vendas + relatórios
    - /inventory: Controle de estoque (add, remove, alerts, movements)
    - /customers: CRUD de clientes + histórico de compras
    - /categories: CRUD de categorias com hierarquia

Uso:
    from app.api.v1.router import api_router
    app.include_router(api_router)
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    products,
    sales,
    inventory,
    customers,
    categories
)


# Router principal da API v1
api_router = APIRouter(prefix="/api/v1")


# ============================================================================
# INCLUIR TODOS OS ROUTERS DE ENDPOINTS
# ============================================================================

# Autenticação e autorização
api_router.include_router(
    auth.router,
    tags=["Autenticação"]
)

# Gerenciamento de produtos
api_router.include_router(
    products.router,
    tags=["Produtos"]
)

# Processamento de vendas e relatórios
api_router.include_router(
    sales.router,
    tags=["Vendas"]
)

# Controle de estoque
api_router.include_router(
    inventory.router,
    tags=["Estoque"]
)

# Gerenciamento de clientes
api_router.include_router(
    customers.router,
    tags=["Clientes"]
)

# Gerenciamento de categorias
api_router.include_router(
    categories.router,
    tags=["Categorias"]
)
