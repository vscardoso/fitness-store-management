/**
 * Guarda no aparelho (só no app web) os dados das telas mais usadas e mostra na hora ao abrir o app,
 * enquanto os dados novos chegam por trás. Com o servidor a ~300 ms de distância, esperar a rede para
 * desenhar cada tela deixava o app lento. Só dados de consulta (nunca senha ou token); sai ao trocar de conta.
 */
import { Platform } from 'react-native';
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

const KEY = '@provador:cache_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 1_500_000;
const SAVE_DELAY_MS = 2000;

/** Só consultas de leitura das telas principais. Fora da lista: clientes, equipe, pagamentos pendentes, etc. */
const ALLOWED = new Set([
  'dashboard-stats', 'inventory-valuation', 'period-sales', 'period-purchases', 'recent-sales', 'daily-sales',
  'top-products', 'fifo-performance', 'yoy-comparison', 'monthly-result', 'inventory-health', 'low-stock',
  'products', 'grouped-products', 'active-products', 'products-inventory', 'categories', 'suppliers',
  'stock-entries', 'stock-entries-stats', 'stock-entry', 'lot-analytics', 'lot-costs', 'sales', 'expenses', 'trips',
]);

function storage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function clearPersistedCache(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // sem armazenamento: nada a limpar
  }
}

/** Devolve ao React Query o que foi guardado, se for do mesmo usuário e recente. Chamar uma vez, depois do login. */
let restored = false;

export function restoreQueryCache(qc: QueryClient, userId: number | string): void {
  const s = storage();
  if (!s || restored) return;
  restored = true;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || String(saved.uid) !== String(userId) || Date.now() - Number(saved.at) > MAX_AGE_MS) {
      s.removeItem(KEY);
      return;
    }
    hydrate(qc, saved.state);
  } catch {
    clearPersistedCache(); // arquivo corrompido: começa do zero
  }
}

/** Passa a guardar as consultas bem-sucedidas (a cada 2 s no máximo). Devolve a função que para de guardar. */
export function startQueryPersist(qc: QueryClient, getUserId: () => number | string | null | undefined): () => void {
  const s = storage();
  if (!s) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const uid = getUserId();
    if (uid == null) return;
    try {
      const state = dehydrate(qc, {
        shouldDehydrateQuery: (q) => q.state.status === 'success' && ALLOWED.has(String(q.queryKey[0])),
      });
      const text = JSON.stringify({ uid, at: Date.now(), state });
      if (text.length <= MAX_BYTES) s.setItem(KEY, text);
    } catch {
      // cheio ou bloqueado: o app segue sem guardar
    }
  };
  const unsubscribe = qc.getQueryCache().subscribe(() => {
    if (timer == null) timer = setTimeout(save, SAVE_DELAY_MS);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
