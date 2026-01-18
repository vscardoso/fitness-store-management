# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 IMPORTANTE: Sistema de Orquestração

**Antes de fazer qualquer mudança que envolva múltiplas camadas (backend + frontend + UX), leia:**
- 📋 **[AGENT_ORCHESTRATION.md](./AGENT_ORCHESTRATION.md)** - Processo completo e checklists
- ⚡ **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Comandos rápidos e exemplos

**Use comandos `🔄 FULL-STACK [TIPO]` para garantir zero retrabalho e consistência total.**

---

## System Overview

Full-stack fitness retail management system with **FastAPI backend** (Python 3.11+) and **React Native + Expo** mobile app. The architecture follows a strict 3-layer pattern with async SQLAlchemy 2.0, Repository Pattern, and mandatory Soft Delete.

## Critical Architecture Patterns

### Backend: 3-Layer Architecture (FastAPI)

```
API Layer (app/api/v1/) → Service Layer (app/services/) → Repository Layer (app/repositories/)
```

**Layer Responsibilities:**
- **API Layer** (`app/api/v1/endpoints/`): Define endpoints, validate with Pydantic schemas, return HTTP responses. No database access.
- **Service Layer** (`app/services/`): Business logic, orchestrate multiple repositories, manage transactions.
- **Repository Layer** (`app/repositories/`): Database access ONLY, no business logic. All repos extend `BaseRepository` (app/repositories/base.py).

**Key Rules:**
- ALL database operations are async (`async def`, `await`, `AsyncSession`)
- Soft delete is default: NEVER hard delete, set `is_active=False` instead
- Every model extends `BaseModel` with: `id`, `created_at`, `updated_at`, `is_active` (backend/app/models/base.py:16)

**Correct Pattern Example:**
```python
# ✅ Service Layer (business logic)
class ProductService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.product_repo = ProductRepository()
        self.inventory_repo = InventoryRepository()

    async def delete_product(self, product_id: int):
        # Business rule validation
        inventory = await self.inventory_repo.get_by_product(self.db, product_id)
        if inventory and inventory.quantity > 0:
            raise ValueError("Cannot delete product with stock")
        # Soft delete
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': False})
```

**Wrong Pattern:**
```python
# ❌ Repository with business logic (DON'T DO THIS)
class ProductRepository:
    async def delete_product(self, db, product_id):
        if has_stock:  # ❌ Business logic doesn't belong here
            raise ValueError("...")
```

**Key Backend Files:**
- `backend/app/repositories/base.py` - Generic CRUD operations (get, create, update, delete, get_multi, count, etc.)
- `backend/app/models/base.py` - Common fields for all models
- `backend/app/api/deps.py` - Auth dependencies (`get_current_user`, `require_role()`)

### Inventory Traceability: Every Product Must Have an Entry

**CRITICAL RULE: Todo produto DEVE estar vinculado a uma entrada de estoque (StockEntry).**

**Why this matters:**
- ✅ Complete traceability: Know where every product came from
- ✅ Financial accuracy: Calculate FIFO, real cost per sale, ROI per purchase
- ✅ Supplier analysis: Track performance by supplier/trip
- ✅ Audit trail: No "phantom" products without origin
- ✅ Better decisions: "Which trip was profitable?", "Which supplier has best ROI?"

**Entry Types (EntryType enum):**
```python
class EntryType(str, enum.Enum):
    TRIP = "trip"                    # Purchase from trip
    ONLINE = "online"                # Online purchase
    LOCAL = "local"                  # Local purchase
    INITIAL_INVENTORY = "initial"    # Initial stock (before system)
    ADJUSTMENT = "adjustment"        # Inventory adjustment
    RETURN = "return"                # Customer return
    DONATION = "donation"            # Donation/gift received
```

**How it works:**

1. **Creating new products with stock:**
   ```python
   # When creating a product with initial_stock > 0
   product_data = ProductCreate(
       name="Whey Protein",
       sku="WHY-001",
       price=89.90,
       cost_price=45.00,
       initial_stock=10,  # ← Automatically creates INITIAL_INVENTORY entry
       min_stock=5,
   )

   # ProductService automatically:
   # 1. Creates product
   # 2. Creates StockEntry with type=INITIAL_INVENTORY
   # 3. Creates EntryItem linking product to entry
   # 4. Now product has full traceability!
   ```

2. **Migrating existing products:**
   ```bash
   # Run ONCE to create entries for products that existed before this system
   python backend/migrate_products_to_entries.py
   ```

   This script:
   - Finds all products with stock but no entry
   - Creates INITIAL_INVENTORY entries for them
   - Links existing stock to these entries
   - Ensures 100% traceability from day 1

3. **Stock flow:**
   ```
   StockEntry (trip/online/local)
       ├─> EntryItem (product_id, quantity_received, quantity_remaining)
       │   └─> Used for FIFO: oldest entries sold first
       └─> Inventory.quantity = sum(all EntryItem.quantity_remaining)
   ```

**Key Models:**
- `StockEntry` (backend/app/models/stock_entry.py): Purchase/entry record
- `EntryItem` (backend/app/models/entry_item.py): Individual product in an entry (FIFO tracking)
- `Inventory` (backend/app/models/inventory.py): Current stock total (sum of all entry_items)

**Best Practices:**
- ✅ Every new product with stock creates INITIAL_INVENTORY entry automatically
- ✅ Bulk purchases create entries of type TRIP/ONLINE/LOCAL
- ✅ Adjustments use ADJUSTMENT type with notes explaining why
- ✅ Returns use RETURN type
- ❌ NEVER create products with stock without an entry (system won't allow it)

### Mobile: File-Based Routing + React Query

**Architecture:**
- **Expo Router**: File-based navigation (`app/(tabs)/`, `app/(auth)/`, `app/products/[id].tsx`)
- **Server State**: React Query (`@tanstack/react-query`) with `useQuery`, `useMutation`, auto-caching
- **Client State**: Zustand stores (`authStore`, `cartStore`, `uiStore`)
- **API Client**: Axios instance (`mobile/services/api.ts`) with JWT interceptor

**React Query Pattern (MANDATORY):**
```typescript
// ✅ Correct: Use React Query and invalidate after mutations
const queryClient = useQueryClient();

const { data: products, isLoading } = useQuery({
  queryKey: ['products'],
  queryFn: getProducts,
});

const createMutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });  // ✅ ALWAYS invalidate
  },
});

// ❌ Wrong: Direct state mutation bypasses React Query
setProducts([...products, newProduct]);  // ❌ DON'T DO THIS
```

**UI/UX Conventions:**
- **No Dividers**: Use `marginTop`/`marginBottom` for spacing instead of `<Divider>` components
- **No Visual Separators in Headers**: Use gap/margin, not divider lines
- **Custom Headers**: Disable default Expo Router headers with `headerShown: false` when using custom headers
- **Avoid Redundant Titles**: If showing entity name (e.g., product name), don't add generic "Details" title

**Global Loading System:**
- **Automatic Loading**: All API requests automatically show a global loading overlay
- **Custom Messages**: Use `withLoadingMessage('Mensagem...')` helper for context-specific feedback
- **Skip Loading**: Use `skipLoading()` helper for background operations (silent refreshes, polling)
- **Smart Behavior**: Request counter handles concurrent requests, 300ms minimum display time prevents flicker
- **Safety Features**: 10s timeout warning, 30s auto-hide to prevent stuck states

```typescript
// ✅ Default: automatic loading
await api.post('/products', data);

// ✅ Custom message
await api.post('/products', data, withLoadingMessage('Criando produto...'));

// ✅ Skip loading for background operations
await api.get('/products', skipLoading());
```

**Key Mobile Files:**
- `mobile/services/api.ts` - Axios instance with JWT interceptor + loading manager
- `mobile/services/loadingManager.ts` - Global loading state manager
- `mobile/components/ui/LoadingOverlay.tsx` - Loading overlay component
- `mobile/utils/apiHelpers.ts` - Helper functions (`skipLoading()`, `withLoadingMessage()`)
- `mobile/store/authStore.ts` - Zustand auth state (persisted to AsyncStorage)
- `mobile/constants/Config.ts` - API URL (change for physical device testing with localtunnel)
- `mobile/app/(tabs)/_layout.tsx` - Tab navigation + auth redirect
- `mobile/docs/LOADING_SYSTEM.md` - Complete loading system documentation
- `mobile/docs/LOADING_EXAMPLES.md` - Practical usage examples

## Common Development Commands

### Starting the System (Windows PowerShell)

```powershell
# Terminal 1 - Backend
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Mobile (RECOMENDADO - previne travamentos)
cd mobile
.\expo-dev.ps1

# Alternativa (para device físico):
.\expo-dev.ps1 -Tunnel

# Se o terminal travar: Feche o terminal → Abra novo → Execute:
.\kill-all.ps1
.\expo-dev.ps1
```

**⚠️ IMPORTANTE - Terminal Travando?**
Se o terminal travar ao rodar Expo:
1. **Feche o terminal** (X ou Alt+F4)
2. **Abra novo terminal** e execute `.\kill-all.ps1`
3. **Inicie com** `.\expo-dev.ps1`

📚 **Documentação completa:** `mobile/TERMINAL_FREEZE_FIX.md` e `mobile/QUICK_START.md`

```

### Backend Development

```powershell
# Setup
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Database operations
python recreate_db.py              # ⚠️ DELETES ALL DATA
python create_user.py              # Email: admin@fitness.com, Password: admin123
python create_categories.py        # Seed initial categories

# Run tests
pytest                             # All tests
pytest -v                          # Verbose
pytest --cov=app                   # With coverage
pytest tests/test_products.py      # Specific test file

# Linting
black .                            # Format code
flake8 .                           # Lint check
mypy app/                          # Type checking

# Database Migrations (AUTOMATIZADO)
python migrate.py "add new field"      # Gera E aplica migration automaticamente
python reset_db.py                     # Reset completo do banco (com backup)

# Manual (NÃO RECOMENDADO - use migrate.py)
alembic upgrade head                   # Só aplicar migrations pendentes
alembic current                        # Ver revisão atual
```

### Mobile Development

```powershell
cd mobile
npm install

# Run app
npx expo start                     # Development
npx expo start --android           # Android emulator
npx expo start --ios               # iOS simulator
npx expo start --tunnel            # Physical device with tunnel

# Testing
npm test                           # Run tests
npm run lint                       # Lint check

# Physical device testing
npx localtunnel --port 8000
# Update mobile/constants/Config.ts with tunnel URL
```

## Database Schema & Models

### Model Hierarchy

All models extend `BaseModel` (backend/app/models/base.py:16):
```python
class BaseModel(Base):
    id: Mapped[int]                    # Primary key
    created_at: Mapped[datetime]       # Auto-generated
    updated_at: Mapped[datetime]       # Auto-updated
    is_active: Mapped[bool]            # Soft delete flag (default=True)
```

### Key Models

**Product** (backend/app/models/product.py):
- Fields: name, sku, barcode, cost_price, sale_price, description
- Relations: category (many-to-one), inventory (one-to-one)
- Business methods: calculate_profit_margin()

**Customer** (backend/app/models/customer.py):
- Fields: full_name, email, phone, document_number, address fields
- Loyalty: customer_type (REGULAR/VIP/PREMIUM/CORPORATE), loyalty_points, total_spent
- Business methods: calculate_discount_percentage(), add_loyalty_points(), update_purchase_stats()

**Inventory** (backend/app/models/inventory.py):
- Fields: product_id, quantity, min_stock_threshold
- Relations: product (one-to-one), movements (one-to-many)

**Sale** (backend/app/models/sale.py):
- Fields: customer_id, total_amount, payment_method, status
- Relations: customer (many-to-one), items (one-to-many)

## Authentication Flow

1. **Login**: `POST /api/v1/auth/login` → Returns `access_token` + `refresh_token`
2. **Requests**: Include `Authorization: Bearer {token}` header
3. **Mobile**: Axios interceptor (mobile/services/api.ts:25) auto-adds token from AsyncStorage
4. **Token Expiry**: 401 → Mobile clears AsyncStorage, redirect happens via `_layout.tsx`
5. **Roles**: `ADMIN`, `SELLER`, `EMPLOYEE` (use `require_role()` dependency in backend/app/api/deps.py:94)

## Common Patterns & Best Practices

### Backend Testing

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_product(client: AsyncClient, auth_token: str):
    response = await client.post(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"name": "Test Product", "sale_price": 100}
    )
    assert response.status_code == 201
```

Test fixtures are in `backend/tests/conftest.py`:
- `client` - AsyncClient for API testing
- `db` - AsyncSession for database testing
- `auth_token` - JWT token for authenticated requests

### Naming Conventions

- **Python**: `snake_case` (variables/functions), `PascalCase` (classes), `UPPER_CASE` (constants)
- **TypeScript**: `camelCase` (variables/functions), `PascalCase` (components/types/interfaces)
- **Files**: `kebab-case.ts` (utils), `PascalCase.tsx` (React components)
- **Commits**: Follow Conventional Commits: `feat(products): add edit screen`, `fix(api): resolve auth token issue`

### Common Pitfalls to Avoid

❌ **Don't query database in API endpoints**
✅ **Do call service layer**, which uses repositories

❌ **Don't hard delete records**
✅ **Do soft delete** with `is_active=False`

❌ **Don't forget `await` on async functions**
✅ **Do use async/await** for all DB operations

❌ **Don't mutate React Query cache manually**
✅ **Do use** `invalidateQueries()` after mutations

❌ **Don't store API URL in multiple places**
✅ **Do use** `mobile/constants/Config.ts` (single source of truth)

❌ **Don't put business logic in repositories**
✅ **Do put business logic in service layer**

## Key API Endpoints

Authentication:
- `POST /api/v1/auth/login` - Login with email/password

Products:
- `GET /api/v1/products?search=...&category_id=...` - List products with filters
- `GET /api/v1/products/{id}` - Get product details
- `POST /api/v1/products` - Create product (ADMIN/SELLER)
- `PUT /api/v1/products/{id}` - Update product (ADMIN/SELLER)
- `DELETE /api/v1/products/{id}` - Soft delete product (ADMIN)
- `GET /api/v1/products/low-stock` - Products below min_stock_threshold

Inventory:
- `POST /api/v1/inventory/movement` - Move stock (IN/OUT)
- `GET /api/v1/inventory/movements/{product_id}` - Movement history

Customers:
- `GET /api/v1/customers` - List customers
- `POST /api/v1/customers` - Create customer
- `PUT /api/v1/customers/{id}` - Update customer
- `GET /api/v1/customers/{id}/history` - Purchase history

Sales:
- `POST /api/v1/sales` - Create sale
- `GET /api/v1/sales` - List sales
- `GET /api/v1/sales/{id}` - Get sale details

Interactive API docs: `http://localhost:8000/docs` (Swagger UI)

## Environment Configuration

**Backend** (`backend/.env`):
```env
DATABASE_URL=sqlite+aiosqlite:///./fitness_store.db
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
```

**Mobile** (`mobile/.env`):
```env
EXPO_PUBLIC_API_URL=http://YOUR_IP:8000/api/v1
```

For physical device testing with localtunnel:
1. Run `npx localtunnel --port 8000`
2. Update `mobile/constants/Config.ts` with tunnel URL

## When Making Changes

### Backend Changes (Model → Schema → Repository → Service → Endpoint)

1. **Update Model**: Modify `backend/app/models/*.py`
2. **Update Schema**: Modify `backend/app/schemas/*.py` (Pydantic)
3. **Create Migration**: `python migrate.py "description"` (gera E aplica)
4. **Update Repository**: Usually no changes needed (BaseRepository handles CRUD)
5. **Update Service**: Add business logic in `backend/app/services/*.py`
6. **Update Endpoint**: Modify `backend/app/api/v1/endpoints/*.py`
7. **Add Tests**: Create/update tests in `backend/tests/`

### Mobile Changes (Type → Service → Component → Screen)

1. **Update Type**: Modify `mobile/types/*.ts`
2. **Update Service**: Modify API calls in `mobile/services/*.ts`
3. **Update Component**: Modify/create in `mobile/components/`
4. **Update Screen**: Modify screen in `mobile/app/`
5. **Invalidate Cache**: Use `queryClient.invalidateQueries()` after mutations

### Database Schema Changes

**SEMPRE use migrate.py** (automatizado):
```powershell
cd backend
python migrate.py "add customer_type field"  # Faz tudo: gera + aplica
```

**NUNCA** edite o banco manualmente ou use alembic diretamente.

## Project Structure

```
fitness-store-management/
├── backend/                    # Python FastAPI
│   ├── app/
│   │   ├── api/v1/            # API endpoints (Router layer)
│   │   ├── core/              # Config, database, security
│   │   ├── models/            # SQLAlchemy models
│   │   ├── schemas/           # Pydantic schemas (validation)
│   │   ├── repositories/      # Data access layer
│   │   ├── services/          # Business logic layer
│   │   └── main.py            # Application entry
│   ├── tests/                 # Unit & integration tests
│   ├── alembic/               # Database migrations
│   └── requirements.txt       # Python dependencies
│
├── mobile/                     # React Native + Expo
│   ├── app/                   # Expo Router (file-based routing)
│   │   ├── (auth)/           # Login screens
│   │   ├── (tabs)/           # Main app tabs
│   │   └── products/         # Product screens
│   ├── components/            # Reusable UI components
│   ├── services/              # API clients
│   ├── store/                 # Zustand stores
│   ├── hooks/                 # Custom React hooks
│   ├── types/                 # TypeScript types
│   ├── utils/                 # Utilities
│   └── constants/             # App constants (Config, Colors)
│
├── docs/                       # Documentation
│   ├── API.md                 # API reference
│   ├── SETUP.md               # Setup guide
│   └── ARCHITECTURE.md        # Architecture details
│
└── scripts/                    # Utility scripts
    ├── setup.sh               # Automated setup
    └── test.sh                # Test runner
```

## Pro Tips

1. **BaseRepository**: Check `backend/app/repositories/base.py` before writing custom queries. Methods like `get`, `get_multi`, `create`, `update`, `delete`, `count`, `exists`, `get_by_field` are already implemented.

2. **Customer Model Business Logic**: Customer model (backend/app/models/customer.py:24) has built-in methods for loyalty points and auto-upgrade logic:
   - `calculate_discount_percentage()` - Returns discount based on customer_type
   - `add_loyalty_points(amount)` - 1 point per R$ 10 spent
   - `update_purchase_stats(sale_amount)` - Auto-upgrades customer type (R$10k → VIP, R$25k → PREMIUM)

3. **Soft Delete**: All repositories use soft delete by default. To restore a soft-deleted record, update `is_active=True`.

4. **React Query DevTools**: Available in development mode for debugging queries and cache.

5. **API Docs**: Always check `http://localhost:8000/docs` for interactive API documentation with request/response examples.
