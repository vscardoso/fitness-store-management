# Mobile Expert

Você está no modo **mobile expert** do projeto fitness-store-management.

## Contexto do projeto

Stack: Expo SDK 54 + React Native + TypeScript + Expo Router file-based.
Estado: React Query (server state) + Zustand (client state).
API URL centralizada em `mobile/constants/Config.ts` — único lugar.

## Regras obrigatórias

### Estado e dados
- React Query para TUDO que vem da API (`useQuery` / `useMutation`)
- Após mutations: `queryClient.invalidateQueries()` SEMPRE — nunca mutar cache manualmente
- Zustand stores: `authStore` (auth+tenant), `cartStore` (carrinho), `uiStore` (modais/loading)

### Loading automático
- Toda request já exibe loading overlay via interceptor (`loadingManager`)
- Para desabilitar: `{ headers: { 'X-Skip-Loading': 'true' } }`
- Para mensagem custom: `{ headers: { 'X-Loading-Message': 'Salvando...' } }`

### Token refresh
- Interceptor em `mobile/services/api.ts` tenta refresh silencioso em 401
- Se falhar: limpa AsyncStorage + invalida queries + redirect via `_layout.tsx`

### UI/UX obrigatório
- **Sem Dividers** — usar margin/gap
- `headerShown: false` em telas com header custom (`PageHeader`)
- Não usar `position: absolute` em botões — usar scroll ou sticky footer
- Componentes reutilizáveis em `mobile/components/ui/`: PageHeader, BottomSheet, ConfirmDialog, EmptyState, StatCard, Badge, DateTimeInput

### Roteamento (Expo Router)
- File-based: `app/(tabs)/`, `app/(auth)/`, `app/products/[id].tsx`
- Auth checks no `_layout.tsx`
- Deep linking suportado na estrutura de rotas

## Fluxo de mudança mobile

```
Type → Service → Component → Screen → invalidateQueries
```

## Serviços existentes

`mobile/services/`: api.ts, authService.ts, productService.ts, salesService.ts, customerService.ts, stockEntryService.ts, dashboardService.ts, reportService.ts, tripService.ts, conditionalService.ts, paymentDiscountService.ts, pdvService.ts, inventoryService.ts, categoryService.ts

## Hooks custom disponíveis

`mobile/hooks/`: useProductWizard.ts, useAIScanner.ts, useAuth.ts, useCart.ts, useProducts.ts, useCustomers.ts, useSales.ts, usePushNotifications.ts, useStockEntries.ts, useTrips.ts, useSuppliers.ts

## Telas implementadas

- `(tabs)/`: index (dashboard), products, sale (PDV), customers, inventory, more
- `products/`: wizard, scan, [id], add, edit/[id], label/[id]
- `customers/`: [id], add, edit/[id]
- `entries/`, `trips/`, `sales/`, `reports/`, `conditional/`, `expenses/`, `looks/`, `suppliers/`

## Iniciar mobile

```powershell
cd mobile
.\expo-dev.ps1              # emulador
.\expo-dev.ps1 -Tunnel      # dispositivo físico
.\kill-all.ps1              # se travar
```

## TypeScript erros conhecidos (pré-existentes, não críticos)

- `conditional/[id].tsx` — ShipmentStatus desatualizado
- `more.tsx` — comparação de roles
- `usePushNotifications.ts` — API Expo Notifications mudou
- `BarcodeScanner.tsx` — props do Modal

---

Pronto para implementar. Descreva o que precisa fazer.
