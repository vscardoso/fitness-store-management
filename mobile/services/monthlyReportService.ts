/** Relatório mensal da loja (financeiro e analítico). Tudo calculado no servidor (backend/app/services/monthly_report_service.py). */
import api from './api';
import { openServerPdf } from './pdfDelivery';

export interface ResultSide {
  revenue: number; cost: number; gross_profit: number; gross_margin_pct: number; expenses: number; stock_losses: number;
  net_profit: number; net_margin_pct: number; sales_count: number; units_sold: number; average_ticket: number;
  expenses_by_category: { label: string; amount: number }[];
}
export interface MonthlyReport {
  year: number; month: number; label: string; period_start: string; period_end: string; month_finished: boolean;
  previous_label: string;
  result: { current: ResultSide; previous: ResultSide; change: Record<string, number | null> };
  sales: {
    pieces_sold: number; discount_total: number; sales_with_customer: number; sales_without_customer: number;
    returns_count: number; returns_total: number; cancelled_count: number; cancelled_total: number;
    payment_breakdown: { method: string; total: number; count: number; percentage: number }[];
    top_products: { product_name: string; variant_label?: string | null; variant_display_code?: string | null; quantity_sold: number; revenue: number; profit: number }[];
    by_category: { category: string; pieces: number; revenue: number; profit: number; percentage: number }[];
    by_seller: { seller_name: string; sales: number; revenue: number; average_ticket: number; percentage: number }[];
  };
  new_customers: number;
  finance: {
    started: boolean; unavailable?: string; start_total?: number; expected_total?: number; check_ok?: boolean;
    entered?: { sales: { label: string; amount: number }[]; receivables_received: number; other: { label: string; amount: number }[]; cash_register_in: number; total: number };
    left?: { expenses: { label: string; amount: number }[]; purchases_and_debts: number; refunds: number; other: { label: string; amount: number }[]; cash_register_out: number; total: number };
    accounts?: { id: number; name: string; kind: string; start: number; expected: number }[];
    closed?: { closed_at: string; counted_total: number; difference: number } | null;
  };
  to_receive: { fiado_open: number; fiado_overdue: number; due_this_week: number; launched_in_month: number; launched_count: number; received_in_month: number };
  to_pay: { open_total: number; overdue_total: number; overdue_count: number };
  stock: { pieces: number; sale_value: number; cost_value: number; turnover_pct: number; stagnant_units: number; other_out: number };
  attention: { level: 'bad' | 'warn' | 'good'; text: string }[];
}

export async function getMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
  const res = await api.get('/reports/monthly', { params: { year, month } });
  return res.data;
}

/** PDF gerado no servidor (no iPhone instalado não há arquivo local): o app abre o link https. */
export async function openMonthlyReportPdfWeb(year: number, month: number): Promise<void> {
  await openServerPdf('/reports/monthly/pdf', { params: { year, month }, title: 'Relatório mensal da loja' });
}
