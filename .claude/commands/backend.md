# Backend Expert

Você está no modo **backend expert** do projeto fitness-store-management.

## Contexto do projeto

Stack: FastAPI + SQLAlchemy 2.0 async + Python 3.12 local / 3.11 prod.
DB: SQLite local (`sqlite+aiosqlite:///./fitness_store.db`) | PostgreSQL prod (Render).

## Arquitetura obrigatória — 3 camadas

```
API (app/api/v1/endpoints/) → Service (app/services/) → Repository (app/repositories/)
```

- **API**: só HTTP (validação Pydantic, status code, chamar service). Zero lógica de negócio.
- **Service**: toda lógica de negócio, transações, orquestração de repositories.
- **Repository**: só acesso ao banco. Estender `BaseRepository`. Zero lógica de negócio.

## Regras críticas

- Soft delete OBRIGATÓRIO: `is_active=False`, NUNCA `db.delete()`
- Tudo async/await com `AsyncSession`
- Todo modelo tem `tenant_id` (FK para `stores.id`)
- Modelos extendem `BaseModel` → `backend/app/models/base.py`
- Enums em `backend/app/models/enums.py`
- Auth deps: `get_current_user`, `require_role()` → `backend/app/api/deps.py`
- SQL raw: usar `= true/false` nunca `= 1/0` para BOOLEAN (PostgreSQL)
- `BaseRepository` já tem: get, get_multi, create, update, delete, count, exists, get_by_field

## Fluxo de mudança backend

```
Model → Schema → python migrate.py "descrição" → Service → Endpoint
```

## Estoque (FIFO)

`StockEntry → EntryItem (FIFO source truth) → Inventory (derivado)`

- `initial_stock > 0` cria `INITIAL_INVENTORY` automaticamente
- Inventory.quantity = sum(EntryItem.quantity_remaining)
- EntryTypes: TRIP, ONLINE, LOCAL, INITIAL_INVENTORY, ADJUSTMENT, RETURN, DONATION
- Nunca atualizar `Inventory.quantity` diretamente

## Multi-tenant

Endpoints filtram por tenant via header `X-Tenant-Id`. Resolver tenant:
1. `user.tenant_id` (autenticado)
2. Header `X-Tenant-Id`
3. `Store.slug` / `Store.domain`
4. `Store.is_default = true`

## Comandos úteis

```powershell
cd backend && .\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
python migrate.py "descrição da mudança"
alembic upgrade head
alembic stamp head   # para sincronizar sem rodar migrations
```

## Pitfalls conhecidos

- `asyncpg` em prod, `aiosqlite` em dev — nunca confundir URLs
- Migrations incrementais assumem tabelas base existentes — se banco novo, `create_all` + `stamp head`
- CORS_ORIGINS é `str` parseado por `@property` (pydantic-settings v2) — não `List[str]`

---

Pronto para implementar. Descreva o que precisa fazer.
