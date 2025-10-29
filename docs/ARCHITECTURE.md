# Architecture Documentation - Fitness Store Management

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Arquitetura do Sistema](#arquitetura-do-sistema)
- [Backend (FastAPI)](#backend-fastapi)
- [Mobile (React Native)](#mobile-react-native)
- [Banco de Dados](#banco-de-dados)
- [Fluxos de Dados](#fluxos-de-dados)
- [Segurança](#segurança)
- [Padrões e Convenções](#padrões-e-convenções)

---

## 🌐 Visão Geral

O **Fitness Store Management** é um sistema completo de gestão para lojas de artigos esportivos, composto por:

- **Backend API:** FastAPI (Python) - REST API assíncrona
- **Mobile App:** React Native com Expo - Aplicativo principal
- **Database:** SQLite (desenvolvimento) / PostgreSQL (produção)

### Características Principais

- ✅ **Async/Await:** Operações assíncronas em todo backend
- ✅ **Repository Pattern:** Separação de lógica de negócio e acesso a dados
- ✅ **JWT Authentication:** Autenticação stateless com refresh tokens
- ✅ **React Query:** Gerenciamento de estado do servidor no mobile
- ✅ **TypeScript:** Type safety no frontend
- ✅ **Soft Delete:** Deleção lógica para auditoria
- ✅ **Material Design 3:** Interface moderna e intuitiva

---

## 🏗 Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE APP (React Native)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   UI Layer   │  │ State Mgmt   │  │   Services   │      │
│  │  (Screens)   │◄─┤ React Query  │◄─┤  API Clients │      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
└────────────────────────────────────────────┼────────────────┘
                                             │
                                    HTTP/JSON (REST)
                                             │
┌────────────────────────────────────────────▼────────────────┐
│                   BACKEND API (FastAPI)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   API Layer  │  │ Service Layer│  │  Repository  │      │
│  │  (Endpoints) │─►│  (Business)  │─►│    Layer     │      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
└────────────────────────────────────────────┼────────────────┘
                                             │
                                        SQLAlchemy
                                             │
┌────────────────────────────────────────────▼────────────────┐
│                    DATABASE (SQLite/PostgreSQL)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Products │ │Inventory │ │  Sales   │ │Customers │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🐍 Backend (FastAPI)

### Estrutura de Diretórios

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # Application entry point
│   │
│   ├── api/                    # API Layer (Routers)
│   │   ├── __init__.py
│   │   ├── deps.py            # Dependencies (get_db, get_current_user)
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── auth.py        # Authentication endpoints
│   │       ├── products.py    # Product CRUD endpoints
│   │       ├── categories.py
│   │       ├── inventory.py
│   │       ├── sales.py
│   │       └── customers.py
│   │
│   ├── core/                   # Core Configuration
│   │   ├── __init__.py
│   │   ├── config.py          # Settings (Pydantic BaseSettings)
│   │   ├── database.py        # Database connection & session
│   │   └── security.py        # JWT, hashing, authentication
│   │
│   ├── models/                 # SQLAlchemy Models (Database)
│   │   ├── __init__.py
│   │   ├── base.py            # Base model with common fields
│   │   ├── user.py
│   │   ├── product.py
│   │   ├── category.py
│   │   ├── inventory.py
│   │   ├── sale.py
│   │   └── customer.py
│   │
│   ├── schemas/                # Pydantic Schemas (Validation)
│   │   ├── __init__.py
│   │   ├── user.py            # UserCreate, UserResponse, etc.
│   │   ├── product.py
│   │   ├── category.py
│   │   ├── inventory.py
│   │   ├── sale.py
│   │   └── customer.py
│   │
│   ├── repositories/           # Repository Pattern (Data Access)
│   │   ├── __init__.py
│   │   ├── base.py            # BaseRepository with CRUD
│   │   ├── user_repository.py
│   │   ├── product_repository.py
│   │   ├── category_repository.py
│   │   ├── inventory_repository.py
│   │   ├── sale_repository.py
│   │   └── customer_repository.py
│   │
│   ├── services/               # Business Logic Layer
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── product_service.py
│   │   └── ...
│   │
│   └── utils/                  # Utilities
│       ├── __init__.py
│       └── helpers.py
│
├── alembic/                    # Database Migrations
│   ├── versions/
│   └── env.py
│
├── tests/                      # Unit & Integration Tests
│   ├── test_products.py
│   ├── test_auth.py
│   └── ...
│
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Docker configuration
└── .env.example               # Environment variables template
```

### Camadas da Aplicação

#### 1. **API Layer** (`app/api/v1/`)
- Define os endpoints HTTP
- Valida entrada com Pydantic schemas
- Chama a camada de serviço
- Retorna respostas HTTP

**Exemplo:**
```python
@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = ProductService(db)
    product = await service.get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
```

#### 2. **Service Layer** (`app/services/`)
- Contém a lógica de negócio
- Orquestra múltiplos repositories
- Valida regras de negócio
- Gerencia transações

**Exemplo:**
```python
class ProductService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.product_repo = ProductRepository()
        self.inventory_repo = InventoryRepository()

    async def delete_product(self, product_id: int):
        # Verificar se tem estoque
        inventory = await self.inventory_repo.get_by_product(self.db, product_id)
        if inventory and inventory.quantity > 0:
            raise ValueError("Cannot delete product with stock")
        
        # Soft delete
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': False})
```

#### 3. **Repository Layer** (`app/repositories/`)
- Acesso direto ao banco de dados
- CRUD operations
- Queries específicas
- Sem lógica de negócio

**Exemplo:**
```python
class ProductRepository(BaseRepository[Product, ProductCreate, ProductUpdate]):
    async def get_low_stock(self, db: AsyncSession) -> List[Product]:
        query = (
            select(Product)
            .join(Inventory)
            .where(
                and_(
                    Product.is_active == True,
                    Inventory.quantity <= Product.min_stock_threshold
                )
            )
        )
        result = await db.execute(query)
        return result.scalars().all()
```

### Padrões Utilizados

#### Repository Pattern
```python
class BaseRepository(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get(self, db: AsyncSession, *, id: int) -> Optional[ModelType]:
        query = select(self.model).where(self.model.id == id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, *, obj_in: CreateSchemaType) -> ModelType:
        obj_data = obj_in.dict()
        db_obj = self.model(**obj_data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj
```

#### Dependency Injection
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    # Verify JWT and return user
    ...
```

---

## 📱 Mobile (React Native)

### Estrutura de Diretórios

```
mobile/
├── app/                        # Expo Router (File-based routing)
│   ├── _layout.tsx            # Root layout
│   ├── index.tsx              # Entry point (redirect)
│   ├── (auth)/                # Auth group (no tabs)
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/                # Main app (with tabs)
│   │   ├── _layout.tsx
│   │   ├── index.tsx          # Dashboard
│   │   ├── products.tsx       # Products list
│   │   ├── sale.tsx           # Sales screen
│   │   └── more.tsx           # Settings
│   └── products/              # Product details/edit
│       ├── [id].tsx           # Details
│       └── edit/[id].tsx      # Edit
│
├── components/                 # Reusable Components
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── TabBar.tsx
│   ├── products/
│   │   ├── ProductCard.tsx
│   │   └── ProductList.tsx
│   ├── sales/
│   └── ui/
│       ├── CustomModal.tsx
│       └── ModalActions.tsx
│
├── services/                   # API Clients
│   ├── api.ts                 # Axios instance
│   ├── authService.ts
│   ├── productService.ts
│   ├── inventoryService.ts
│   ├── saleService.ts
│   └── customerService.ts
│
├── store/                      # Zustand State Management
│   ├── authStore.ts           # Auth state (tokens, user)
│   ├── cartStore.ts           # Shopping cart
│   └── uiStore.ts             # UI state
│
├── hooks/                      # Custom React Hooks
│   ├── useAuth.ts
│   ├── useProducts.ts
│   ├── useCategories.ts
│   └── useCart.ts
│
├── types/                      # TypeScript Types
│   └── index.ts               # All type definitions
│
├── constants/                  # Configuration
│   ├── Colors.ts              # Theme colors
│   └── Config.ts              # API URL, etc.
│
├── utils/                      # Utility Functions
│   ├── format.ts              # Currency, date formatting
│   ├── validation.ts          # Form validation
│   └── masks.ts               # Input masks (CPF, phone)
│
├── package.json
├── tsconfig.json
├── app.json                    # Expo configuration
└── .env.example
```

### Arquitetura de Componentes

```
┌─────────────────────────────────────────────────┐
│              Screen (app/...)                   │
│  ┌───────────────────────────────────────────┐  │
│  │  React Query Hook (useQuery/useMutation) │  │
│  └────────────────┬──────────────────────────┘  │
│                   │                             │
│  ┌────────────────▼──────────────────────────┐  │
│  │         Service Layer (API Call)         │  │
│  └────────────────┬──────────────────────────┘  │
└───────────────────┼─────────────────────────────┘
                    │
                    │ HTTP Request
                    │
              ┌─────▼──────┐
              │   Backend  │
              └────────────┘
```

### Gerenciamento de Estado

#### React Query (Server State)
```typescript
// Buscar produtos
const { data: products, isLoading } = useQuery({
  queryKey: ['products'],
  queryFn: getProducts,
});

// Criar produto
const createMutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  },
});
```

#### Zustand (Client State)
```typescript
// Auth Store
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  logout: () => set({ user: null, token: null }),
}));
```

### Navegação (Expo Router)

```
App Structure:
/                       → Redirect to /login or /(tabs)
/(auth)/login          → Login screen
/(tabs)/               → Main app with bottom tabs
  ├─ index             → Dashboard
  ├─ products          → Products list
  ├─ sale              → Sales screen
  └─ more              → Settings
/products/[id]         → Product details (dynamic route)
/products/edit/[id]    → Edit product
```

---

## 🗄 Banco de Dados

### Modelo Relacional

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│   USERS     │       │  CATEGORIES  │       │  CUSTOMERS  │
├─────────────┤       ├──────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)      │       │ id (PK)     │
│ email       │       │ name         │       │ name        │
│ password    │       │ description  │       │ email       │
│ full_name   │       │ is_active    │       │ phone       │
│ role        │       │ created_at   │       │ cpf         │
│ is_active   │       └──────────────┘       │ created_at  │
└─────────────┘                              └─────────────┘

┌─────────────────┐       ┌──────────────────┐
│    PRODUCTS     │       │    INVENTORY     │
├─────────────────┤       ├──────────────────┤
│ id (PK)         │◄──────┤ product_id (FK)  │
│ name            │       │ warehouse_id     │
│ sku             │       │ quantity         │
│ barcode         │       │ min_stock        │
│ description     │       │ max_stock        │
│ brand           │       │ last_movement_dt │
│ category_id (FK)├──┐    └──────────────────┘
│ cost_price      │  │
│ price           │  │    ┌──────────────────┐
│ min_stock_thr   │  │    │ INV_MOVEMENTS    │
│ is_active       │  │    ├──────────────────┤
│ created_at      │  │    │ id (PK)          │
└─────────────────┘  │    │ product_id (FK)  │
                     │    │ movement_type    │
                     │    │ quantity         │
                     │    │ notes            │
                     │    │ created_at       │
                     │    └──────────────────┘
                     │
                     └──►┌──────────────────┐
                         │   SALES          │
                         ├──────────────────┤
                         │ id (PK)          │
                         │ customer_id (FK) │
                         │ user_id (FK)     │
                         │ total_amount     │
                         │ discount         │
                         │ payment_method   │
                         │ status           │
                         │ created_at       │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │   SALE_ITEMS     │
                         ├──────────────────┤
                         │ id (PK)          │
                         │ sale_id (FK)     │
                         │ product_id (FK)  │
                         │ quantity         │
                         │ unit_price       │
                         │ discount         │
                         │ subtotal         │
                         └──────────────────┘
```

### Migrations (Alembic)

```bash
# Criar nova migration
alembic revision --autogenerate -m "Add new field"

# Aplicar migrations
alembic upgrade head

# Reverter migration
alembic downgrade -1
```

---

## 🔄 Fluxos de Dados

### Fluxo de Autenticação

```
1. User enters credentials
   ↓
2. Mobile sends POST /auth/login
   ↓
3. Backend validates credentials
   ↓
4. Backend generates JWT tokens (access + refresh)
   ↓
5. Mobile stores tokens (secure storage)
   ↓
6. All subsequent requests include: Authorization: Bearer {token}
   ↓
7. Backend validates token on each request
   ↓
8. Token expires → Use refresh token → Get new access token
```

### Fluxo de Criação de Produto

```
Mobile                    Backend                   Database
  │                         │                         │
  │ POST /products          │                         │
  ├────────────────────────►│                         │
  │                         │ Validate data           │
  │                         │ (Pydantic)              │
  │                         │                         │
  │                         │ Service Layer:          │
  │                         │  - Check SKU unique     │
  │                         │  - Check category       │
  │                         │                         │
  │                         │ Repository:             │
  │                         │  - Create product       │
  │                         ├────────────────────────►│
  │                         │                         │ INSERT
  │                         │◄────────────────────────┤
  │                         │                         │
  │                         │ Repository:             │
  │                         │  - Create inventory     │
  │                         ├────────────────────────►│
  │                         │                         │ INSERT
  │                         │◄────────────────────────┤
  │                         │                         │
  │◄────────────────────────┤                         │
  │ 201 Created             │                         │
  │                         │                         │
  │ Invalidate cache        │                         │
  │ (React Query)           │                         │
```

---

## 🔒 Segurança

### Autenticação JWT

```python
# Gerar token
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=30)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Verificar token
def verify_token(token: str):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return payload
```

### Hash de Senhas

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

### CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 📝 Padrões e Convenções

### Código Python

- **PEP 8:** Style guide
- **Type hints:** Sempre usar
- **Async/await:** Todas as operações de I/O
- **Docstrings:** Documentar funções públicas

### Código TypeScript

- **ESLint:** Linting
- **Prettier:** Formatação
- **Interfaces:** Definir tipos explicitamente
- **Hooks:** Usar custom hooks para lógica reutilizável

### Commits

```
<type>(<scope>): <subject>

feat(products): add product edit screen
fix(auth): resolve token refresh issue
docs(readme): update setup instructions
```

### Nomenclatura

- **Python:** `snake_case` (variáveis, funções), `PascalCase` (classes)
- **TypeScript:** `camelCase` (variáveis, funções), `PascalCase` (componentes, interfaces)
- **Arquivos:** `kebab-case.ts` (utils), `PascalCase.tsx` (componentes)

---

## 🚀 Deploy (Produção)

### Backend

- **Hosting:** Railway, Render, AWS, DigitalOcean
- **Database:** PostgreSQL (substituir SQLite)
- **Environment:** Variáveis via secrets
- **SSL:** HTTPS obrigatório

### Mobile

- **iOS:** Apple App Store (Expo EAS Build)
- **Android:** Google Play Store (Expo EAS Build)
- **OTA Updates:** Expo Updates

---

## 📊 Monitoramento

- **Backend:** Sentry (error tracking)
- **Mobile:** Expo Analytics
- **Logs:** Structured logging (JSON)
- **Performance:** APM tools

---

Este documento descreve a arquitetura atual do sistema. Para implementação de novas features, consulte este guia para manter a consistência arquitetural.
