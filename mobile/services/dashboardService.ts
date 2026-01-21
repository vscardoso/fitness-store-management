/**
 * Dashboard Service
 *
 * Serviço para buscar estatísticas e métricas do dashboard.
 * Usa dados baseados em rastreabilidade completa (EntryItems).
 */

import api from './api';

export interface DashboardStats {
  stock: {
    invested_value: number;
    potential_revenue: number;
    potential_profit: number;
    average_margin_percent: number;
    total_quantity: number;
    total_products: number;
    low_stock_count: number;
  };
  sales: {
    total_today: number;
    count_today: number;
    average_ticket: number;
  };
  customers: {
    total: number;
  };
  metadata: {
    calculated_at: string;
    traceability_enabled: boolean;
    note: string;
  };
}

/**
 * Busca estatísticas do dashboard
 */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const { data } = await api.get<DashboardStats>('/dashboard/stats');
  return data;
};

// Valuation do estoque
export interface InventoryValuation {
  cost_value: number;
  retail_value: number;
  potential_margin: number;
  by_category: Array<{
    category_id: number;
    category_name: string;
    cost_value: number;
    retail_value: number;
    potential_margin: number;
  }>;
}

export const getInventoryValuation = async (): Promise<InventoryValuation> => {
  const { data } = await api.get<InventoryValuation>('/dashboard/inventory/valuation');
  return data;
};

// Saúde do estoque
export interface InventoryHealth {
  coverage_days: number | null;
  low_stock_count: number;
  aging: { [bucket: string]: number }; // percentuais por faixa
  turnover_30d: number | null; // custo das vendas 30d / custo estoque atual
  health_score: number; // 0–100
  period: { from: string; to: string };
}

export const getInventoryHealth = async (): Promise<InventoryHealth> => {
  const { data } = await api.get<InventoryHealth>('/dashboard/inventory/health');
  return data;
};

// Métricas mensais de vendas
export interface MonthlySalesStats {
  total_month: number;
  count_month: number;
  profit_month: number;
  average_ticket_month: number;
  margin_percent_month: number;
  cmv_month: number;
  period: { from: string; to: string };
}

export const getMonthlySalesStats = async (): Promise<MonthlySalesStats> => {
  const { data } = await api.get<MonthlySalesStats>('/dashboard/sales/monthly');
  return data;
};

