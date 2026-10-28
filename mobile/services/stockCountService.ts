/** Conferências de estoque: em andamento (pode continuar em qualquer aparelho) ou finalizadas (relatório fechado). */
import api from './api';

export type StockCountStatus = 'open' | 'finished';

export interface StockCountSummary {
  id: number;
  created_at: string;
  updated_at: string | null;
  finished_at: string | null;
  status: StockCountStatus;
  revision: number;
  name: string | null;
  note: string | null;
  category_id: number | null;
  category_name: string | null;
  created_by_name: string | null;
  total_variants: number;
  counted_variants: number;
  ok_variants: number;
  diff_variants: number;
  short_pieces: number;
  over_pieces: number;
  system_pieces: number;
  counted_pieces: number;
}

export interface StockCountItem {
  variant_id: number | null;
  product_id: number | null;
  product_name: string;
  category_name: string | null;
  color: string | null;
  size: string | null;
  sku: string | null;
  display_code: string | null;
  system_quantity: number;
  counted_quantity: number;
  difference: number;
}

export interface StockCountDetail {
  count: StockCountSummary;
  items: StockCountItem[];
}

export interface CountedItemInput {
  variant_id: number;
  counted_quantity: number;
}

/** Primeiro salvamento: cria a conferência em andamento (ou já finalizada com `finish`). */
export async function createStockCount(params: {
  name?: string;
  note?: string;
  categoryId?: number | null;
  items: CountedItemInput[];
  finish?: boolean;
}): Promise<StockCountSummary> {
  const { data } = await api.post<StockCountSummary>('/reports/stock-counts', {
    name: params.name?.trim() || undefined,
    note: params.note?.trim() || undefined,
    category_id: params.categoryId ?? undefined,
    items: params.items,
    finish: !!params.finish,
  });
  return data;
}

/** Salvamentos seguintes: troca o que foi contado. `revision` é a que este aparelho abriu (409 se outra pessoa salvou antes). */
export async function updateStockCount(
  id: number,
  params: { revision: number; name?: string; note?: string; items: CountedItemInput[]; finish?: boolean },
): Promise<StockCountSummary> {
  const { data } = await api.put<StockCountSummary>(`/reports/stock-counts/${id}`, {
    revision: params.revision,
    name: params.name?.trim() || undefined,
    note: params.note?.trim() || undefined,
    items: params.items,
    finish: !!params.finish,
  });
  return data;
}

export async function listStockCounts(
  params: { limit?: number; offset?: number; status?: StockCountStatus } = {},
): Promise<{ total: number; results: StockCountSummary[] }> {
  const { data } = await api.get('/reports/stock-counts', {
    params: { limit: params.limit ?? 30, offset: params.offset ?? 0, ...(params.status ? { status: params.status } : {}) },
  });
  return data;
}

export async function getStockCount(id: number, onlyDiffs = false): Promise<StockCountDetail> {
  const { data } = await api.get<StockCountDetail>(`/reports/stock-counts/${id}`, { params: { only_diffs: onlyDiffs } });
  return data;
}

/** Chave estável do que foi contado: serve para saber se há algo novo para salvar. */
export const countsKey = (items: CountedItemInput[]) =>
  items.map((i) => `${i.variant_id}:${i.counted_quantity}`).sort().join(',');
