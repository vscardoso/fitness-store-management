---
description: Modo mobile expert — Expo Router, React Query, Zustand, convenções de UI
---

# Modo Mobile Expert

App React Native / Expo em `mobile/`.

## Estrutura

```
mobile/
  app/            # Expo Router (file-based): (auth), (tabs), products/, sales/, entries/, ...
  services/       # 1 arquivo por domínio + api.ts (axios) + loadingManager.ts + storage.ts
  hooks/          # useProducts, useSales, useStockEntries, useAIScanner, useThemeColors, ...
  store/          # Zustand: authStore, cartStore, uiStore, brandingStore, notificationStore,
                  #          conditionalProcessingStore
  components/ui/  # PageHeader, BottomSheet, ConfirmDialog, EmptyState, StatCard, Badge,
                  # DateTimeInput, AppButton, InfoRow, LoadingOverlay, LoadingSkeleton, ...
  constants/      # Colors.ts, Config.ts, tokens.ts, entryTypes.ts, tutorials.ts
  types/          # tipos compartilhados (importar via '@/types')
```

## Estado

- **Server state → React Query.** Nunca duplicar dado de API em Zustand.
- **Client state → Zustand** (`mobile/store/`).
- Após **toda** mutation: `queryClient.invalidateQueries({ queryKey: [...] })`.
  Invalide **todas** as keys afetadas. Exemplo real de `app/products/[id].tsx` ao deletar produto:
  `products`, `grouped-products`, `grouped-products-modal`, `active-products`,
  `dashboard-stats`, `low-stock`.
- **Nunca** mutar o cache do React Query manualmente.

## API (`mobile/services/api.ts`)

Cliente axios com interceptors que já cuidam de:

- **Loading automático** — toda request mostra o overlay via `loadingManager`. Para controlar:
  - `{ headers: { 'X-Skip-Loading': 'true' } }` — não mostra loading
  - `{ headers: { 'X-Loading-Message': 'Salvando...' } }` — mensagem customizada
- **`X-Tenant-Id`** injetado automaticamente no request interceptor.
- **Refresh de token** — em 401 tenta refresh silencioso (`/auth/refresh`, com `X-Skip-Loading`)
  e reenvia a request original. Se falhar: limpa AsyncStorage + invalida o cache do React Query
  → redirect pelo `app/_layout.tsx`. `refreshPromise` deduplica chamadas concorrentes.

## URL da API

`mobile/constants/Config.ts` é o **único** lugar. Auto-detecta o IP via Metro
(`Constants.expoConfig.hostUri` → `manifest2` → `manifest`), com `LOCAL_IP_FALLBACK` manual e
`TUNNEL_URL` atualizada pelo `.\start_tunnel.ps1`. Não hardcode URL em service nenhum.

## Services

Um arquivo por domínio, funções exportadas nomeadas, tipos importados de `@/types`:

```ts
export const getActiveProducts = async (params?: PaginationParams): Promise<Product[]> => {
  const { data } = await api.get<any>('/products/active', { params });
  // API pode retornar array direto ou paginado { items: [...] } — normalize
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
};
```

## UI

- **Sem `Divider`** — usar `margin` / `gap`.
- `headerShown: false` em telas com header custom (`PageHeader`).
- Evitar botões com `position: absolute` — usar scroll ou sticky footer adequado.
- Cores: `useThemeColors()` / `constants/Colors.ts` (light + dark). Nunca hex hardcoded.
- Reaproveitar `components/ui/` antes de criar componente novo.
- Textos de UI em português (há script de verificação em `scripts/`).

## Ordem de mudança

`Type → Service → Component → Screen → invalidateQueries`

## Comandos

```powershell
cd mobile && .\expo-dev.ps1
.\expo-dev.ps1 -Tunnel   # device físico em outra rede
.\kill-all.ps1           # se travar
```
