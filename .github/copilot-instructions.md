# Fitness Store Management - AI Agent Instructions

## System Overview
Full-stack fitness retail management system with **FastAPI backend** (Python 3.11+) and **React Native + Expo** mobile app. Architecture uses **async SQLAlchemy 2.0**, **Repository Pattern**, and **Soft Delete** throughout.

## Critical Architecture Patterns

### Backend: 3-Layer Architecture (FastAPI)
```
API Layer (app/api/v1/) → Service Layer (app/services/) → Repository Layer (app/repositories/)
```

- **API Layer**: Define endpoints, validate with Pydantic, return HTTP responses
- **Service Layer**: Business logic, orchestrate multiple repositories, manage transactions
- **Repository Layer**: Database access ONLY, no business logic, generic CRUD via `BaseRepository`
- **ALL database operations are async** (`async def`, `await`, `AsyncSession`)
- **Soft delete is default**: Never hard delete, set `is_active=False` instead
- **Every model extends `BaseModel`** with: `id`, `created_at`, `updated_at`, `is_active`

### Backend Code Conventions
```python
# ✅ Correct Repository Pattern
class ProductService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.product_repo = ProductRepository()  # No business logic
        self.inventory_repo = InventoryRepository()
    
    async def delete_product(self, product_id: int):
        # Business rule in service
        inventory = await self.inventory_repo.get_by_product(self.db, product_id)
        if inventory and inventory.quantity > 0:
            raise ValueError("Cannot delete product with stock")
        # Soft delete
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': False})

# ❌ Wrong: Business logic in repository
class ProductRepository:
    async def delete_product(self, db, product_id):
        if has_stock:  # ❌ Business logic doesn't belong here
            raise ValueError("...")
```

**Key Files**:
- `backend/app/repositories/base.py` - Generic CRUD operations all repos inherit
- `backend/app/models/base.py` - Common fields (`id`, timestamps, `is_active`)
- `backend/app/api/deps.py` - Auth dependencies (`get_current_user`, role-based access)

### Mobile: File-Based Routing + React Query
- **Expo Router**: File-based navigation (`app/(tabs)/`, `app/(auth)/`, `app/products/[id].tsx`)
- **State Management**: 
  - **Server state**: React Query (`useQuery`, `useMutation`, auto-caching)
  - **Client state**: Zustand stores (`authStore`, `cartStore`, `uiStore`)
- **API calls**: Axios instance (`services/api.ts`) with JWT interceptor
- **Never bypass React Query**: Always use `queryClient.invalidateQueries()` after mutations

### Mobile Code Conventions
```typescript
// ✅ Correct React Query Pattern
const queryClient = useQueryClient();

const { data: products, isLoading } = useQuery({
  queryKey: ['products'],
  queryFn: getProducts,
});

const createMutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });  // ✅ Invalidate cache
  },
});

// ❌ Wrong: Direct state mutation
setProducts([...products, newProduct]);  // ❌ Bypasses React Query cache
```

**UI Conventions**:
- **No Dividers**: Use `marginTop` for spacing between sections instead of `<Divider>` components
- **No Visual Separators in Headers**: Use gap/margin for spacing, not divider lines
- **Custom Headers**: Disable default Expo Router headers (`headerShown: false`) when using custom headers
- **Header Simplicity**: Avoid redundant titles - if you show the entity name (e.g., product name), don't add a generic "Details" title above it
- **SafeAreaView**: Use for screens without Expo Router navigation

**Key Files**:
- `mobile/services/api.ts` - Axios instance with JWT interceptor
- `mobile/store/authStore.ts` - Zustand auth state (persisted to AsyncStorage)
- `mobile/constants/Config.ts` - API URL (change tunnel URL here for testing)
- `mobile/app/(tabs)/_layout.tsx` - Tab navigation + auth redirect

## Development Workflow

### Starting the System (PowerShell)
```powershell
# Terminal 1 - Backend
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Mobile
cd mobile
npx expo start

# For physical device testing, update mobile/constants/Config.ts:
# BASE_URL: 'https://your-tunnel.loca.lt/api/v1'  # Get from localtunnel
```

### Database Operations
```powershell
# Recreate database (⚠️ DELETES ALL DATA)
python backend/recreate_db.py

# Create admin user
python backend/create_user.py  # Email: admin@fitness.com, Pwd: admin123

# Create initial categories
python backend/create_categories.py

# Run tests
cd backend
pytest -v  # Unit tests
pytest --cov=app  # Coverage report
```

### Alembic Migrations
```powershell
# Create migration
cd backend
alembic revision --autogenerate -m "Add new field"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Common Patterns & Conventions

### Backend Testing
- Use `@pytest.mark.asyncio` for async tests
- Fixtures in `tests/conftest.py` provide `client`, `db`, `auth_token`
- Test all three layers: endpoints, services, repositories
```python
@pytest.mark.asyncio
async def test_create_product(client, auth_token):
    response = await client.post(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"name": "Test", "price": 100}
    )
    assert response.status_code == 201
```

### Authentication Flow
1. **Login**: `POST /api/v1/auth/login` → Returns `access_token` + `refresh_token`
2. **Requests**: Include `Authorization: Bearer {token}` header
3. **Mobile**: Axios interceptor auto-adds token from AsyncStorage
4. **Expiry**: 401 → Mobile clears auth, redirects to login
5. **Roles**: `ADMIN`, `SELLER`, `EMPLOYEE` (use `require_role()` dependency)

### Naming Conventions
- **Python**: `snake_case` (vars/functions), `PascalCase` (classes)
- **TypeScript**: `camelCase` (vars/functions), `PascalCase` (components/types)
- **Files**: `kebab-case.ts` (utils), `PascalCase.tsx` (React components)
- **Commits**: `feat(products): add edit screen` (Conventional Commits)

### Common Pitfalls
❌ **Don't**: Query database directly in API endpoints  
✅ **Do**: Call service layer, which uses repositories

❌ **Don't**: Hard delete records  
✅ **Do**: Soft delete with `is_active=False`

❌ **Don't**: Forget `await` on async functions  
✅ **Do**: All DB operations are `async/await`

❌ **Don't**: Mutate React Query cache manually  
✅ **Do**: Use `invalidateQueries()` after mutations

❌ **Don't**: Store API URL in multiple places  
✅ **Do**: Use `mobile/constants/Config.ts` (single source of truth)

## Key API Endpoints
- `POST /api/v1/auth/login` - Login (returns JWT)
- `GET /api/v1/products?search=...&category_id=...` - List products (with filters)
- `POST /api/v1/inventory/movement` - Move stock (`IN`/`OUT`)
- `GET /api/v1/products/low-stock` - Products below `min_stock_threshold`
- Interactive docs: `http://localhost:8000/docs`

## Environment Configuration
- **Backend**: `backend/.env` (DB URL, SECRET_KEY, CORS origins)
- **Mobile**: `mobile/.env` (`EXPO_PUBLIC_API_URL`)
- **Tunnel for testing**: Update `mobile/constants/Config.ts` with localtunnel URL

## Docker Support
```powershell
docker-compose up -d  # Start PostgreSQL + Redis + Backend
```
Default dev setup uses **SQLite** (easier, no Docker needed).

## Documentation
- `docs/ARCHITECTURE.md` - Detailed architecture
- `docs/API.md` - Full API reference
- `docs/SETUP.md` - Step-by-step setup guide
- `README.md` - Project overview

## When Making Changes
1. **Backend**: Update model → schema → repository → service → endpoint
2. **Mobile**: Update type → service → component → screen
3. **DB Schema**: Create Alembic migration
4. **Tests**: Add unit tests for new features
5. **Cache**: Invalidate React Query cache after mutations
6. **Soft Delete**: Never permanently delete, use `is_active=False`

---

**Pro Tip**: Search `backend/app/repositories/base.py` for generic CRUD methods before writing custom queries. Most operations are already implemented.
