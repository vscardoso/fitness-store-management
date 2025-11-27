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
