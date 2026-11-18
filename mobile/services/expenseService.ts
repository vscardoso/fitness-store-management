import api from './api';
import { settle, withBankReason } from './bankApproval';
import type {
  Expense,
  ExpenseCategory,
  ExpenseCategoryCreate,
  ExpenseCreate,
  ExpenseUpdate,
  MonthlyResult,
} from '@/types/expense';

// ─── Categorias ───────────────────────────────────────────────

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data } = await api.get('/expenses/categories');
  return data;
}

export async function createExpenseCategory(payload: ExpenseCategoryCreate): Promise<ExpenseCategory> {
  const { data } = await api.post('/expenses/categories', payload);
  return data;
}

// ─── Despesas ─────────────────────────────────────────────────

export interface ListExpensesParams {
  start_date?: string;
  end_date?: string;
  category_id?: number;
  skip?: number;
  limit?: number;
}

export async function getExpenses(params?: ListExpensesParams): Promise<Expense[]> {
  const { data } = await api.get('/expenses', { params });
  return data;
}

export async function getStockLosses(params?: Omit<ListExpensesParams, 'category_id'>): Promise<Expense[]> {
  const { data } = await api.get('/expenses/stock-losses', { params });
  return data;
}

export async function getExpense(id: number): Promise<Expense> {
  const { data } = await api.get(`/expenses/${id}`);
  return data;
}

export async function createExpense(payload: ExpenseCreate): Promise<Expense> {
  const { data } = await api.post('/expenses', payload);
  return data;
}

/** Despesa paga por um banco: mudar valor, dia ou conta vira pedido de aprovação dos administradores (ver services/bankApproval.ts). */
export async function updateExpense(id: number, payload: ExpenseUpdate): Promise<Expense> {
  return settle(
    await withBankReason(async (reason) => (await api.put(`/expenses/${id}`, payload, { params: reason ? { reason } : undefined })).data),
    {} as Expense,
  );
}

export async function deleteExpense(id: number): Promise<void> {
  settle(
    await withBankReason(async (reason) => (await api.delete(`/expenses/${id}`, { params: reason ? { reason } : undefined })).data),
    undefined,
  );
}

// ─── P&L ──────────────────────────────────────────────────────

export async function getMonthlyResult(year?: number, month?: number): Promise<MonthlyResult> {
  const { data } = await api.get('/expenses/resultado-mes', {
    params: { year, month },
  });
  return data;
}

/**
 * Resultado financeiro dos últimos N dias corridos (janela móvel).
 * Mesma fórmula do P&L mensal, usada na dashboard de estoque (filtro 7/30/60/90 dias).
 */
export async function getResultByPeriod(days: number): Promise<MonthlyResult> {
  const { data } = await api.get('/expenses/resultado-periodo', {
    params: { days },
  });
  return data;
}

/** Um produto vendido no mês: mesma conta do Resultado do Mês (a soma bate com o total). */
export interface ProductMonthResult {
  product_id: number | null;
  name: string;
  pieces_sold: number;
  pieces_returned: number;
  pieces_net: number;
  revenue: number;
  cost: number;
  profit: number;
  average_price: number;
  average_cost: number;
  margin_percent: number;
}

export async function getMonthlyResultByProduct(year: number, month: number): Promise<ProductMonthResult[]> {
  const { data } = await api.get('/expenses/resultado-mes/produtos', { params: { year, month } });
  return data;
}

/** Resultado entre duas datas (AAAA-MM-DD, inclusive): mesma conta do mês. */
export async function getResultByRange(start: string, end: string): Promise<MonthlyResult> {
  const { data } = await api.get('/expenses/resultado-periodo', { params: { start_date: start, end_date: end } });
  return data;
}

export async function getResultByProductRange(start: string, end: string): Promise<ProductMonthResult[]> {
  const { data } = await api.get('/expenses/resultado-mes/produtos', { params: { start_date: start, end_date: end } });
  return data;
}
