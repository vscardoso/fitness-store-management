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
  variant_id?: number | null;
  variant_sku?: string | null;
  variant_size?: string | null;
  variant_color?: string | null;
  variant_label?: string | null;
  variant_short_code?: number | null;
  quantity_sold: number;
  revenue: number;
  profit: number;
  margin: number;
}

export interface PeriodComparison {
  current_total: number;
  previous_total: number;
  difference: number;
  percentage_change: number;
  is_growth: boolean;
  previous_sales: number;
  previous_profit: number;
  previous_start?: string | null;
  previous_end?: string | null;
}

export interface DaySales { date: string; revenue: number; sales: number; profit: number }
export interface WeekdaySales { weekday: number; revenue: number; sales: number }
export interface CategorySales { category: string; pieces: number; revenue: number; profit: number; percentage: number }
export interface SellerSales { seller_id: number; seller_name: string; sales: number; revenue: number; average_ticket: number; percentage: number }

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
  comparison?: PeriodComparison | null;
  pieces_sold?: number;
  discount_total?: number;
  sales_with_customer?: number;
  sales_without_customer?: number;
  returns_count?: number;
  returns_total?: number;
  cancelled_count?: number;
  cancelled_total?: number;
  daily?: DaySales[];
  by_weekday?: WeekdaySales[];
  by_category?: CategorySales[];
  by_seller?: SellerSales[];
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

/**
 * Interface para produto no ranking
 */
export interface TopProductDetail {
  ranking: number;
  product_id: number;
  variant_id?: number | null;
  product_name: string;
  brand: string;
  sku: string;
  variant_size?: string | null;
  variant_color?: string | null;
  variant_label?: string | null;
  category: string;
  current_price: number;
  quantity_sold: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  profit_margin: number;
  share_quantity: number;
  share_revenue: number;
  progress: number;
}

/**
 * Interface para resposta de top products
 */
export interface TopProductsResponse {
  period: string;
  period_label: string;
  start_date: string | null;
  end_date: string | null;
  total_products: number;
  total_quantity_sold: number;
  total_revenue: number;
  products: TopProductDetail[];
}

/**
 * Filtros de período disponíveis
 */
export type TopProductsPeriod =
  | 'this_month'
  | 'last_30_days'
  | 'last_2_months'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'all_time';

/**
 * Relatório de produtos mais vendidos
 */
export const getTopProducts = async (
  period: TopProductsPeriod = 'this_month',
  limit: number = 10
): Promise<TopProductsResponse> => {
  const response = await api.get(`/sales/reports/top-products?period=${period}&limit=${limit}`);
  return response.data;
};

/**
 * Interface para evento do histórico
 */
export interface HistoryEvent {
  id: string;
  type: 'sale' | 'entry' | 'conditional';
  type_label: string;
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  value: number | null;
  status: string;
  timestamp: string;
  date: string;
  time: string;
  link_id: number;
  link_type: string;
}

/**
 * Interface para grupo de eventos por data
 */
export interface HistoryGroup {
  date: string;
  events: HistoryEvent[];
}

/**
 * Interface para resposta do histórico
 */
export interface HistoryResponse {
  period: string;
  start_date: string;
  end_date: string;
  total_count: number;
  returned_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  timeline: HistoryGroup[];
  events: HistoryEvent[];
}

/**
 * Períodos disponíveis para histórico
 */
export type HistoryPeriod =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_3_months'
  | 'this_year';

/**
 * Tipos de evento para filtro
 */
export type HistoryEventType = 'sale' | 'entry' | 'conditional' | null;

/**
 * Histórico unificado de atividades
 */
export const getHistory = async (
  period: HistoryPeriod = 'last_30_days',
  eventType: HistoryEventType = null,
  limit: number = 50,
  offset: number = 0
): Promise<HistoryResponse> => {
  const params = new URLSearchParams();
  params.append('period', period);
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());
  if (eventType) {
    params.append('event_type', eventType);
  }

  const response = await api.get(`/reports/history?${params.toString()}`);
  return response.data;
};

/**
 * Web (inclusive o app instalado no iPhone): PDF gerado no servidor, porque o navegador não tem
 * impressão confiável nem arquivo local. Tenta o compartilhar do aparelho; se não der, abre ou baixa.
 */
export async function openSalesReportPdfWeb(period: string): Promise<void> {
  const res = await api.get(`/reports/sales/pdf?period=${period}`, {
    responseType: 'blob',
    headers: { 'X-Loading-Message': 'Gerando PDF...' },
  });
  const filename = `relatorio-vendas-${period}.pdf`;
  const blob = new Blob([res.data], { type: 'application/pdf' });
  try {
    const file = new File([blob], filename, { type: 'application/pdf' });
    const nav: any = navigator;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: 'Relatório de Vendas' });
      return;
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return; // a pessoa fechou o compartilhar
  }
  const href = URL.createObjectURL(blob);
  const win = window.open(href, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
