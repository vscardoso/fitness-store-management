/** Conferências de estoque salvas: histórico com data, quem contou e o resultado de cada peça. */
import api from './api';

export interface StockCountSummary {
  id: number;
  created_at: string;
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

export async function saveStockCount(params: {
  name?: string;
  note?: string;
  categoryId?: number | null;
  items: { variant_id: number; counted_quantity: number }[];
}): Promise<StockCountSummary> {
  const { data } = await api.post<StockCountSummary>('/reports/stock-counts', {
    name: params.name?.trim() || undefined,
    note: params.note?.trim() || undefined,
    category_id: params.categoryId ?? undefined,
    items: params.items,
  });
  return data;
}

export async function listStockCounts(params: { limit?: number; offset?: number } = {}): Promise<{ total: number; results: StockCountSummary[] }> {
  const { data } = await api.get('/reports/stock-counts', { params: { limit: params.limit ?? 30, offset: params.offset ?? 0 } });
  return data;
}

export async function getStockCount(id: number, onlyDiffs = false): Promise<StockCountDetail> {
  const { data } = await api.get<StockCountDetail>(`/reports/stock-counts/${id}`, { params: { only_diffs: onlyDiffs } });
  return data;
}
