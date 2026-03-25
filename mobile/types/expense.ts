export interface ExpenseCategory {
  id: number;
  name: string;
  color: string;
  icon: string;
  is_active: boolean;
}

export interface Expense {
  id: number;
  amount: number;
  description: string;
  expense_date: string; // ISO date YYYY-MM-DD
  notes?: string | null;
  is_recurring: boolean;
  recurrence_day?: number | null;
  category_id?: number | null;
  category?: ExpenseCategory | null;
  is_active: boolean;
}

export interface ExpenseCreate {
  amount: number;
  description: string;
  expense_date: string;
  notes?: string | null;
  is_recurring?: boolean;
  recurrence_day?: number | null;
  category_id?: number | null;
}

export interface ExpenseUpdate {
  amount?: number;
  description?: string;
  expense_date?: string;
  notes?: string | null;
  is_recurring?: boolean;
  recurrence_day?: number | null;
  category_id?: number | null;
}

export interface ExpenseCategoryCreate {
  name: string;
  color?: string;
  icon?: string;
}

export interface MonthlyResult {
  period_label: string;
  revenue: number;
  cmv: number;
  gross_profit: number;
  gross_margin_pct: number;
  total_expenses: number;
  net_profit: number;
  net_margin_pct: number;
  expenses_by_category: ExpenseByCategoryItem[];
}

export interface ExpenseByCategoryItem {
  category_id: number;
  category: string;
  color: string;
  icon: string;
  total: number;
}
