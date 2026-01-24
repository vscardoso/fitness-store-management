/**
 * Service para API de relatórios
 */
import api from './api';

export interface PaymentBreakdown {
  method: string;
  total: number;
  count: number;
  percentage: number;
}

export interface TopProduct {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  revenue: number;
  profit: number;
  margin: number;
}

export interface SalesReport {
  period: string;
  start_date: string;
  end_date: string;
  total_revenue: number;
  total_sales: number;
  average_ticket: number;
  total_cost: number;
  total_profit: number;
  profit_margin: number;
  payment_breakdown: PaymentBreakdown[];
  top_products: TopProduct[];
}

export interface CashFlowReport {
  period: string;
  start_date: string;
  end_date: string;
  total: number;
  breakdown: PaymentBreakdown[];
}

export interface TopCustomer {
  customer_id: number;
  customer_name: string;
  total_purchases: number;
  purchase_count: number;
  average_purchase: number;
  customer_type: string;
}

export interface CustomersReport {
  period: string;
  start_date: string;
  end_date: string;
  total_customers: number;
  new_customers: number;
  top_customers: TopCustomer[];
  average_ticket: number;
}

export type PeriodFilter = 'this_month' | 'last_30_days' | 'last_2_months' | 'last_3_months' | 'last_6_months' | 'this_year';

/**
 * Relatório de vendas
 */
export const getSalesReport = async (period: PeriodFilter = 'this_month'): Promise<SalesReport> => {
  const response = await api.get(`/reports/sales?period=${period}`);
  return response.data;
};

/**
 * Relatório de fluxo de caixa
 */
export const getCashFlowReport = async (period: PeriodFilter = 'this_month'): Promise<CashFlowReport> => {
  const response = await api.get(`/reports/cash-flow?period=${period}`);
  return response.data;
};

/**
 * Relatório de clientes
 */
export const getCustomersReport = async (period: PeriodFilter = 'this_month', limit: number = 10): Promise<CustomersReport> => {
  const response = await api.get(`/reports/customers?period=${period}&limit=${limit}`);
  return response.data;
};
