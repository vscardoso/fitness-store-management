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
  /** Despesa de um lote (entrada); sem lote é despesa geral da loja. */
  stock_entry_id?: number | null;
  account_id?: number | null;
  is_active: boolean;
  /** Quem lançou (nome na hora do lançamento; vazio nas antigas). */
  created_by_name?: string | null;
  /** Pedido de apagar ou mudar esperando aprovação dos administradores (despesa paga por banco). */
  pending_approval?: {
    id: number; kind: 'delete' | 'update'; requested_by_name?: string | null; approved_count: number; required_count: number;
  } | null;
}

/** Resumo do período calculado no servidor (GET /expenses/summary): a tela não soma a lista. */
export interface ExpensePeriodSummary {
  start_date: string;
  end_date: string;
  /** gasto da loja: o que entra no resultado do mês */
  store_total: number;
  store_count: number;
  /** gasto de lote: já está no custo das peças */
  lot_total: number;
  lot_count: number;
  by_category: { category_id: number | null; name: string; color?: string | null; icon?: string | null; total: number; count: number }[];
}

export interface ExpenseCreate {
  amount: number;
  description: string;
  expense_date: string;
  notes?: string | null;
  is_recurring?: boolean;
  recurrence_day?: number | null;
  category_id?: number | null;
  stock_entry_id?: number | null;
  account_id?: number | null;
}

export interface ExpenseUpdate {
  amount?: number;
  description?: string;
  expense_date?: string;
  notes?: string | null;
  is_recurring?: boolean;
  recurrence_day?: number | null;
  category_id?: number | null;
  stock_entry_id?: number | null;
  account_id?: number | null;
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
  stock_losses_total: number;
  net_profit: number;
  net_margin_pct: number;
  /** Custo das peças dadas de brinde (linha própria, fora do custo das vendidas e dos gastos). */
  gifts_total?: number;
  gifts_count?: number;
  expenses_by_category: ExpenseByCategoryItem[];
  sales_count: number;
  units_sold: number;
}

export interface ExpenseByCategoryItem {
  category_id: number;
  category: string;
  color: string;
  icon: string;
  total: number;
}
