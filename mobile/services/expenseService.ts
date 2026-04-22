import api from './api';
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

export async function updateExpense(id: number, payload: ExpenseUpdate): Promise<Expense> {
  const { data } = await api.put(`/expenses/${id}`, payload);
  return data;
}

export async function deleteExpense(id: number): Promise<void> {
  await api.delete(`/expenses/${id}`);
}

// ─── P&L ──────────────────────────────────────────────────────

export async function getMonthlyResult(year?: number, month?: number): Promise<MonthlyResult> {
  const { data } = await api.get('/expenses/resultado-mes', {
    params: { year, month },
  });
  return data;
}
