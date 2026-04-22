# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack
FastAPI (Python 3.11) + React Native/Expo. Para mudanças multi-camada ver AGENT_ORCHESTRATION.md (comando `🔄 FULL-STACK`).

## Backend: 3 camadas
`API → Service → Repository`. Nunca acessar DB na API, nunca lógica de negócio no Repository.
- Tudo async/await com AsyncSession
- Soft delete OBRIGATÓRIO: `is_active=False`, NUNCA hard delete
- Modelos extendem `BaseModel` (id, created_at, updated_at, is_active, **tenant_id**) — `backend/app/models/base.py`
- **Multi-tenancy**: todo modelo tem `tenant_id` (FK para `stores.id`). Endpoints filtram por tenant via `X-Tenant-Id` header.
- BaseRepository já tem: get, get_multi, create, update, delete, count, exists, get_by_field
- Auth deps: `get_current_user`, `require_role()` — `backend/app/api/deps.py`
- Enums centralizados: `backend/app/models/enums.py`

## Estoque: todo produto vinculado a StockEntry
`initial_stock > 0` cria entrada INITIAL_INVENTORY automaticamente. Fluxo: StockEntry → EntryItem (FIFO) → Inventory.quantity. EntryType: TRIP, ONLINE, LOCAL, INITIAL_INVENTORY, ADJUSTMENT, RETURN, DONATION.

## Mobile
- Expo Router file-based, React Query para server state, Zustand para client state
- Após mutations: `queryClient.invalidateQueries()` SEMPRE
- API URL: `mobile/constants/Config.ts` (único lugar)
- **Loading automático**: todas as requests mostram loading overlay via `loadingManager`. Para controlar:
  - `{ headers: { 'X-Skip-Loading': 'true' } }` — desabilita loading
  - `{ headers: { 'X-Loading-Message': 'Salvando...' } }` — mensagem customizada
- **Token refresh automático**: interceptor em `mobile/services/api.ts` tenta refresh silencioso em 401 antes de forçar logout
- UI: sem Dividers, usar margin/gap. `headerShown: false` em telas com header custom.
- Componentes UI reutilizáveis em `mobile/components/ui/`: PageHeader, BottomSheet, ConfirmDialog, EmptyState, StatCard, Badge, DateTimeInput, etc.

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
- **Product**: name, sku, barcode, cost_price, sale_price → category, inventory, variants, media (galeria)
- **Customer**: loyalty_points, total_spent, customer_type (REGULAR/VIP/PREMIUM) — auto-upgrade R$10k/R$25k
- **Inventory**: quantity = sum(EntryItem.quantity_remaining) — nunca atualizar diretamente
- **Sale**: customer_id, total_amount, payment_method, status
- **ConditionalShipment**: envio condicional (try before you buy) — ConditionalShipmentItem com status PENDING/KEPT/RETURNED/LOST
- **Supplier / SupplierProduct**: fornecedores vinculados a produtos com preço e frequência
- **Trip**: viagem de compras com StockEntries associadas
- **Expense**: despesas operacionais (P&L)
- **Look**: combinações de produtos (outfit)

## Auth
`POST /api/v1/auth/login` → access_token + refresh_token. 401 → refresh silencioso → se falhar, limpa AsyncStorage + invalida React Query cache → redirect via _layout.tsx.

## Pitfalls
- SQL raw: usar `= true/false`, nunca `= 1/0` para BOOLEAN (PostgreSQL)
- Não mutar cache React Query manualmente
- Não criar produto com estoque sem StockEntry
- Não esquecer `tenant_id` ao criar registros manualmente (BaseRepository já cuida em operações normais)
- Botões com `position: absolute` devem ser evitados — usar scroll ou sticky footer adequado


## Skills disponíveis

- **wa-billing**: Especialista em faturamento — assinaturas, Mercado Pago, Stripe, relatórios financeiros (MRR, DRE, churn). Localização: `.agents/skills/wa-billing/SKILL.md`
- **pdv-generic**: Especialista no módulo PDV genérico — maquininha física, providers (Cielo/Stone/Rede/etc.), confirmação manual, gestão de terminais, fluxo de checkout. Localização: `.agents/skills/pdv-generic/SKILL.md`

## Skills path
`.agents/skills/`
