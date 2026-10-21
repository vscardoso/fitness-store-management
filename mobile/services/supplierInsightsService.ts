/**
 * Análises de fornecedores (Fase 2): ranking, comparação de custo e lista de reposição.
 */
import api from './api';

export type SupplierRating = 'otimo' | 'bom' | 'atencao' | 'sem_dados';

export interface SupplierRankingRow {
  position: number;
  supplier_id: number;
  supplier_name: string;
  entries: number;
  products: number;
  purchased_qty: number;
  purchased_cost: number;
  sold_qty: number;
  sell_through_pct: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin_pct: number | null;
  stock_qty: number;
  stock_cost: number;
  last_purchase_date: string | null;
  score: number | null;
  rating: SupplierRating;
  low_data: boolean;
}

export interface SupplierRanking {
  days: number;
  since: string | null;
  score_formula: string;
  suppliers: SupplierRankingRow[];
}

export interface CostComparisonSupplier {
  supplier_id: number;
  supplier_name: string;
  last_unit_cost: number;
  purchase_count: number;
  last_purchase_date: string | null;
  previous_unit_cost: number | null;
  change_pct: number | null;
  is_cheapest: boolean;
}

export interface CostComparisonProduct {
  product_id: number;
  product_name: string;
  supplier_count: number;
  min_cost: number;
  max_cost: number;
  savings_per_unit: number;
  savings_pct: number;
  cheapest_supplier_id: number | null;
  cheapest_supplier_name: string | null;
  suppliers: CostComparisonSupplier[];
}

export interface PriceIncrease {
  product_id: number;
  product_name: string;
  supplier_id: number;
  supplier_name: string;
  previous_unit_cost: number;
  last_unit_cost: number;
  change_pct: number;
}

export interface CostComparison {
  products: CostComparisonProduct[];
  price_increases: PriceIncrease[];
}

export interface RestockItem {
  product_id: number;
  product_name: string;
  variant_id: number;
  size: string | null;
  color: string | null;
  sku: string | null;
  stock: number;
  sold_recent: number;
  sold_per_30_days: number;
  suggested_qty: number;
  last_unit_cost: number | null;
  estimated_cost: number | null;
}

export interface RestockGroup {
  supplier_id: number | null;
  supplier_name: string;
  phone: string | null;
  items: RestockItem[];
  total_qty: number;
  estimated_total: number;
  whatsapp_text: string | null;
}

export interface RestockList {
  cover_days: number;
  low_threshold: number;
  lookback_days: number;
  rule: string;
  total_items: number;
  total_qty: number;
  estimated_total: number;
  groups: RestockGroup[];
}

export async function getSupplierRanking(days: number): Promise<SupplierRanking> {
  const { data } = await api.get<SupplierRanking>('/suppliers/ranking', { params: { days } });
  return data;
}

export async function getCostComparison(): Promise<CostComparison> {
  const { data } = await api.get<CostComparison>('/suppliers/cost-comparison');
  return data;
}

export async function getRestockList(coverDays: number): Promise<RestockList> {
  const { data } = await api.get<RestockList>('/suppliers/restock-list', { params: { cover_days: coverDays } });
  return data;
}
