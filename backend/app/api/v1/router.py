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
    categories,
    trips,
    stock_entries,
    dashboard,
    conditional_shipments,
    notifications,
    reports,
    payment_discounts,
    team,
    ai,
    debug,
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



# Gerenciamento de viagens
api_router.include_router(
    trips.router,
    tags=["Viagens"]
)

# Gerenciamento de entradas de estoque
api_router.include_router(
    stock_entries.router,
    tags=["Entradas de Estoque"]
)

# Dashboard - Estatísticas e métricas
api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["Dashboard"]
)

# Envios Condicionais (Try Before You Buy)
api_router.include_router(
    conditional_shipments.router,
    tags=["Envios Condicionais"]
)

# Notificações Push
api_router.include_router(
    notifications.router,
    tags=["Notificações"]
)

# Relatórios (Vendas, Caixa, Clientes)
api_router.include_router(
    reports.router,
    tags=["Relatórios"]
)

# Descontos por Forma de Pagamento
api_router.include_router(
    payment_discounts.router,
    tags=["Descontos de Pagamento"]
)

# Gerenciamento de Equipe (Usuários da Loja)
api_router.include_router(
    team.router,
    prefix="/team",
    tags=["Equipe"]
)

# AI - Scanner de Produtos com IA
api_router.include_router(
    ai.router,
    tags=["IA"]
)

# Debug - Logs em tempo real (apenas desenvolvimento)
api_router.include_router(
    debug.router,
    prefix="/debug",
    tags=["Debug"]
)
