# CLAUDE.md

## Stack
FastAPI (Python 3.11) + React Native/Expo. Para mudanças multi-camada ver AGENT_ORCHESTRATION.md.

## Backend: 3 camadas
`API → Service → Repository`. Nunca acessar DB na API, nunca lógica de negócio no Repository.
- Tudo async/await com AsyncSession
- Soft delete OBRIGATÓRIO: `is_active=False`, NUNCA hard delete
- Modelos extendem `BaseModel` (id, created_at, updated_at, is_active) — `backend/app/models/base.py`
- BaseRepository já tem: get, get_multi, create, update, delete, count, exists, get_by_field
- Auth deps: `get_current_user`, `require_role()` — `backend/app/api/deps.py`

## Estoque: todo produto vinculado a StockEntry
`initial_stock > 0` cria entrada INITIAL_INVENTORY automaticamente. Fluxo: StockEntry → EntryItem (FIFO) → Inventory.quantity. EntryType: TRIP, ONLINE, LOCAL, INITIAL_INVENTORY, ADJUSTMENT, RETURN, DONATION.

## Mobile
- Expo Router file-based, React Query para server state, Zustand para client state
- Após mutations: `queryClient.invalidateQueries()` SEMPRE
- API URL: `mobile/constants/Config.ts` (único lugar)
- Loading automático em todas requests; `withLoadingMessage()` / `skipLoading()` quando necessário
- UI: sem Dividers, usar margin/gap. `headerShown: false` em telas com header custom.

## Comandos
```powershell
# Backend
cd backend && .\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
python migrate.py "descrição"   # migration: gera + aplica

# Mobile
cd mobile && .\expo-dev.ps1
.\expo-dev.ps1 -Tunnel          # device físico
.\kill-all.ps1                  # se travar
```

## Mudanças backend: Model → Schema → `python migrate.py` → Service → Endpoint
## Mudanças mobile: Type → Service → Component → Screen → invalidateQueries

## Modelos chave
- Product: name, sku, barcode, cost_price, sale_price → category, inventory
- Customer: loyalty_points, total_spent, customer_type (REGULAR/VIP/PREMIUM) — auto-upgrade R$10k/R$25k
- Inventory: quantity = sum(EntryItem.quantity_remaining)
- Sale: customer_id, total_amount, payment_method, status

## Auth
`POST /api/v1/auth/login` → access_token + refresh_token. 401 → limpa AsyncStorage → redirect via _layout.tsx.

## Pitfalls
- SQL raw: usar `= true/false`, nunca `= 1/0` para BOOLEAN (PostgreSQL)
- Não mutar cache React Query manualmente
- Não criar produto com estoque sem StockEntry
