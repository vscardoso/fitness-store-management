/**
 * Dashboard Service
 *
 * Serviço para buscar estatísticas e métricas do dashboard.
 * Usa dados baseados em rastreabilidade completa (EntryItems).
 */

import api from './api';
import type { PeriodFilterValue } from '@/components/PeriodFilter';

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
    profit_today: number;
    cmv_today: number;
    margin_today: number;
    total_yesterday?: number;
    count_yesterday?: number;
    trend_percent?: number;
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

// Comparação com período anterior
export interface PeriodComparison {
  prev_total: number;
  prev_count: number;
  prev_profit: number;
  total_change_percent: number;
  count_change_percent: number;
  profit_change_percent: number;
}

// Métricas de vendas por período
export interface PeriodSalesStats {
  // Dados do período atual
  total: number;
  count: number;
  profit: number;
  average_ticket: number;
  margin_percent: number;
  cmv: number;

  // Compatibilidade com versão anterior
  total_month: number;
  count_month: number;
  profit_month: number;
  average_ticket_month: number;
  margin_percent_month: number;
  cmv_month: number;

  // Comparação com período anterior
  comparison: PeriodComparison;

  // Metadados do período
  period: {
    filter: string;
    label: string;
    from: string;
    to: string;
  };
  previous_period: {
    from: string;
    to: string;
  };
}

// Alias para compatibilidade
export type MonthlySalesStats = PeriodSalesStats;

/**
 * Busca estatísticas de vendas por período
 * @param period - Filtro de período (padrão: this_month)
 */
export const getPeriodSalesStats = async (
  period: PeriodFilterValue = 'this_month'
): Promise<PeriodSalesStats> => {
  const { data } = await api.get<PeriodSalesStats>('/dashboard/sales/monthly', {
    params: { period },
  });
  return data;
};

/**
 * @deprecated Use getPeriodSalesStats com parâmetro de período
 */
export const getMonthlySalesStats = async (
  period?: PeriodFilterValue
): Promise<PeriodSalesStats> => {
  return getPeriodSalesStats(period || 'this_month');
};

// Compras/Entradas por periodo
export interface PeriodPurchasesStats {
  total_invested: number;
  entries_count: number;
  items_count: number;
  average_per_entry: number;
  by_type: {
    [key: string]: {
      total: number;
      count: number;
    };
  };
  type_labels: {
    [key: string]: string;
  };
  comparison: {
    prev_total: number;
    prev_count: number;
    total_change_percent: number;
    count_change_percent: number;
  };
  period: {
    filter: string;
    label: string;
    from: string;
    to: string;
  };
}

/**
 * Busca estatisticas de compras/entradas por periodo
 * @param period - Filtro de periodo (padrao: this_month)
 */
export const getPeriodPurchases = async (
  period: PeriodFilterValue = 'this_month'
): Promise<PeriodPurchasesStats> => {
  const { data } = await api.get<PeriodPurchasesStats>('/dashboard/purchases', {
    params: { period },
  });
  return data;
};

// Vendas diárias para gráfico
export interface DailySalesData {
  date: string;
  day_name: string;
  day_short: string;
  total: number;
  count: number;
  cmv: number;
  profit: number;
  margin_percent: number;
}

export interface DailySalesStats {
  daily: DailySalesData[];
  totals: {
    total: number;
    count: number;
    profit: number;
    cmv: number;
    average_per_day: number;
  };
  best_day: DailySalesData | null;
  period: {
    days: number;
    from: string;
    to: string;
  };
}

/**
 * Busca vendas dos últimos N dias para gráfico
 * @param days - Quantidade de dias (padrão: 7)
 */
export const getDailySales = async (
  days: number = 7
): Promise<DailySalesStats> => {
  const { data } = await api.get<DailySalesStats>('/dashboard/sales/daily', {
    params: { days },
  });
  return data;
};

// Top produtos do período
export interface TopProduct {
  product_id: number;
  product_name: string;
  qty_sold: number;
  revenue: number;
  cmv: number;
  profit: number;
  margin_percent: number;
  share_percent: number;
}

export interface TopProductsData {
  products: TopProduct[];
  period: {
    filter: string;
    from: string;
    to: string;
  };
}

export const getTopProducts = async (
  period: PeriodFilterValue = 'this_month',
  limit: number = 5
): Promise<TopProductsData> => {
  const { data } = await api.get<TopProductsData>('/dashboard/top-products', {
    params: { period, limit },
  });
  return data;
};

// Performance FIFO
export interface FifoPerformanceData {
  sell_through: {
    rate: number;
    total_received: number;
    total_sold: number;
    total_remaining: number;
  };
  roi: {
    avg_roi: number;
    negative_count: number;
    negative_entries: Array<{
      entry_id: number;
      entry_date: string;
      total_cost: number;
      estimated_revenue: number;
      roi: number;
      sell_through: number;
    }>;
  };
}

export const getFifoPerformance = async (): Promise<FifoPerformanceData> => {
  const { data } = await api.get<FifoPerformanceData>('/dashboard/fifo-performance');
  return data;
};

// Comparação YoY (Ano a Ano)
export interface YoYMonth {
  month: number;
  month_name: string;
  current_total: number;
  current_profit: number;
  prev_total: number;
  prev_profit: number;
  change_percent: number;
}

export interface YoYData {
  months: YoYMonth[];
  totals: {
    current_year: number;
    prev_year: number;
    current_total: number;
    current_profit: number;
    prev_total: number;
    prev_profit: number;
    total_change_percent: number;
  };
}

export const getYoYComparison = async (): Promise<YoYData> => {
  const { data } = await api.get<YoYData>('/dashboard/sales/yoy');
  return data;
};

