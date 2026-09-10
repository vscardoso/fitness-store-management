---
description: Modo backend expert — arquitetura 3 camadas, FIFO, multi-tenant, migrations
---

# Modo Backend Expert

Você está trabalhando no backend FastAPI (Python 3.11) em `backend/`.

## Arquitetura obrigatória: 3 camadas

```
API (app/api/v1/endpoints/)  →  Service (app/services/)  →  Repository (app/repositories/)
```

- **Nunca** acessar o DB direto na camada API.
- **Nunca** colocar lógica de negócio no Repository.
- Tudo `async/await` com `AsyncSession`.

## Repositories

`BaseRepository` (`app/repositories/base.py`) é genérico e recebe **o model no `__init__`**, mas
**a sessão em cada método**:

```python
class BaseRepository(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]): ...
    async def get(self, db: AsyncSession, id: int, *, tenant_id: int | None = None): ...
```

Já traz: `get`, `get_multi`, `create`, `update`, `delete` (soft), `count`, `exists`,
`get_by_field`, `bulk_create`, `get_or_create`.

⚠️ **Pegadinha:** os repositórios concretos invertem isso — recebem `db` no `__init__` e fazem
wrapper dos métodos da base:

```python
class ProductRepository(BaseRepository[Product, Any, Any]):
    def __init__(self, db: AsyncSession):
        super().__init__(Product)
        self.db = db

    async def create(self, obj_in: dict, *, tenant_id: int | None = None) -> Product:
        return await super().create(self.db, obj_in, tenant_id=tenant_id)
```

Ao criar um repositório novo, **siga o padrão do concreto** (`db` no construtor) e sempre repasse
`tenant_id`.

## Soft delete — OBRIGATÓRIO

Nunca `DELETE` físico. Sempre `is_active = False`. Todas as queries da base já filtram
`is_active == True`.

## Multi-tenancy

`BaseModel` (`app/models/base.py`) dá a todo model: `id`, `created_at`, `updated_at`, `is_active`,
`tenant_id` (FK → `stores.id`, `ondelete="RESTRICT"`, nullable).

O tenant vem de `get_current_tenant_id` (`app/api/deps.py`), com esta ordem de resolução:

1. `current_user.tenant_id` (do JWT/DB)
2. `request.state.tenant_id` (middleware)
3. Header `X-Tenant-Id`
4. Header `X-Store-Slug`
5. Host header → `Store.domain`
6. `Store.is_default == True`

Todo endpoint que lê/escreve dados de loja **precisa** injetar
`tenant_id: int = Depends(get_current_tenant_id)` e repassar para service/repository.

## Auth

Em `app/api/deps.py`:
- `get_current_user` / `get_current_active_user`
- `require_role([UserRole.ADMIN, ...])`
- Atalhos: `require_admin`, `require_seller_or_admin`

## Estoque e FIFO

Todo produto com estoque tem que estar vinculado a uma `StockEntry`.
`initial_stock > 0` cria automaticamente uma entrada `INITIAL_INVENTORY` (ver
`ProductService.create_product` em `app/services/product_service.py`).

Fluxo: `StockEntry` → `EntryItem` (FIFO) → `Inventory.quantity`.

`Inventory.quantity` = soma de `EntryItem.quantity_remaining`. **Nunca atualizar direto.**

`EntryType` fica em `app/models/stock_entry.py` (valores são minúsculos):

```python
TRIP = "trip"; ONLINE = "online"; LOCAL = "local"; INITIAL_INVENTORY = "initial"
ADJUSTMENT = "adjustment"; RETURN = "return"; DONATION = "donation"
```

`FIFOService(db)` (`app/services/fifo_service.py`): `process_sale`, `check_availability`,
`simulate_sale`, `get_product_cost_info`, `reverse_sale`.

## Enums

⚠️ `app/models/enums.py` hoje só tem `ShipmentStatus`. Outros enums moram no model correspondente
(`EntryType` em `stock_entry.py`, `UserRole` em `user.py`). Ao criar um enum novo, prefira
centralizar em `enums.py`.

## Migrations

```bash
cd backend && python migrate.py "descrição da mudança"
```

O script roda `alembic current` → `alembic revision --autogenerate` → `alembic upgrade head`.
Não rode alembic na mão a menos que precise de uma migration de dados manual.

## Ordem de mudança

`Model → Schema → python migrate.py → Service → Endpoint → registrar no router.py`

Endpoints novos precisam de `api_router.include_router(...)` em `app/api/v1/router.py`.

## Pitfalls

- SQL raw em PostgreSQL: use `= true` / `= false`, **nunca** `= 1` / `= 0` para BOOLEAN.
- Não criar produto com estoque sem `StockEntry`.
- Não esquecer `tenant_id` ao criar registros manualmente.
- `response_model` tem que bater com o dict retornado — divergência gera
  `ResponseValidationError` (500), não 422.

## Validação antes de entregar

```bash
cd backend && python -m py_compile <arquivos alterados>
cd backend && pytest
```
