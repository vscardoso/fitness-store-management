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
  /** Número curto da etiqueta (#0123), quando a variação já foi numerada. */
  short_code: number | null;
  system_quantity: number;
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
