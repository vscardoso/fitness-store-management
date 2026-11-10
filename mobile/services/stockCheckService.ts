/** Relatório de conferência de estoque: base do sistema para comparar com a contagem física. */
import api from './api';

export interface StockCheckRow {
  variant_id: number;
  product_id: number;
  product_name: string;
  category_id: number | null;
  category_name: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  /** Número antigo por variação (#0123). */
  short_code: number | null;
  /** Código da etiqueta (#101-1), quando a variação já foi numerada. */
  display_code?: string | null;
  system_quantity: number;
  /** A variação já teve venda: a baixa não oferece excluí-la. */
  ever_sold?: boolean;
}

export interface StockCheckReport {
  rows: StockCheckRow[];
  total_variants: number;
  total_pieces: number;
}

export async function getStockCheck(params: { categoryId?: number | null; onlyInStock?: boolean }): Promise<StockCheckReport> {
  const { data } = await api.get<StockCheckReport>('/reports/stock-check', {
    params: {
      ...(params.categoryId ? { category_id: params.categoryId } : {}),
      only_in_stock: params.onlyInStock ? true : false,
    },
  });
  return data;
}

export type WriteoffReason = 'perda' | 'avaria' | 'furto' | 'ajuste';

export async function getStockWriteoffEnabled(): Promise<boolean> {
  const { data } = await api.get<{ enabled: boolean }>('/store/stock-writeoff-settings');
  return !!data.enabled;
}

export async function setStockWriteoffEnabled(enabled: boolean): Promise<boolean> {
  const { data } = await api.put<{ enabled: boolean }>('/store/stock-writeoff-settings', { enabled });
  return !!data.enabled;
}

/** Dá baixa no estoque (admin, e só com a opção ligada). Tudo ou nada. */
export async function writeoffStock(payload: {
  reason: WriteoffReason;
  note?: string;
  /** delete_variation: cadastro errado, exclui também a variação (só vale se a baixa zera o estoque e ela nunca vendeu). */
  items: { variant_id: number; quantity: number; delete_variation?: boolean }[];
}): Promise<{ ok: boolean; total_pecas: number; items?: { variant_id: number; quantity: number; variation_deleted?: boolean }[] }> {
  const { data } = await api.post('/reports/stock-check/writeoff', payload);
  return data;
}
