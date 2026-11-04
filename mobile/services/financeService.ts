/**
 * Financeiro: implantação da loja em andamento, contas (gaveta, bancos, maquininha a receber) com saldo calculado
 * pelo servidor, transferências e contas a pagar. Regras em backend/app/models/finance.py.
 */
import api from './api';

export type AccountKind = 'cash' | 'bank' | 'card';

export interface FinanceAccount {
  id: number;
  name: string;
  kind: AccountKind;
  kind_label: string;
  receives_pix: boolean;
  balance: number;
  breakdown: {
    opening: number; sales: number; refunds: number; cash_register: number;
    transfers_in: number; transfers_out: number; payables_paid: number; expenses_paid: number;
  };
}

export interface FinanceOverview {
  started: boolean;
  start_date: string | null;
  accounts: FinanceAccount[];
  total: number;
}

export interface Payable {
  id: number;
  description: string;
  supplier_id: number | null;
  supplier_name: string | null;
  amount: number;
  due_date: string;
  status: 'open' | 'paid' | 'canceled';
  overdue: boolean;
  paid_on: string | null;
  paid_account_id: number | null;
  origin: 'implantacao' | 'manual';
  notes: string | null;
}

export interface PayableList {
  items: Payable[];
  open_total: number;
  overdue_total: number;
  overdue_count: number;
}

export interface AccountTransfer {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  occurred_on: string;
  description: string | null;
  created_by_name: string | null;
}

export interface SetupPayload {
  start_date: string;
  cash_balance: number;
  card_balance: number;
  banks: { name: string; balance: number; receives_pix: boolean }[];
  payables: { description: string; amount: number; due_date: string }[];
}

export const getFinanceOverview = async (): Promise<FinanceOverview> =>
  (await api.get<FinanceOverview>('/finance/accounts', { headers: { 'X-Skip-Loading': 'true' } })).data;

export const setupFinance = async (payload: SetupPayload): Promise<FinanceOverview> =>
  (await api.post<FinanceOverview>('/finance/setup', payload, { headers: { 'X-Loading-Message': 'Implantando...' } })).data;

export const addBankAccount = async (name: string, balance: number, receivesPix: boolean): Promise<FinanceOverview> =>
  (await api.post<FinanceOverview>('/finance/accounts', { name, balance, receives_pix: receivesPix })).data;

export const setPixAccount = async (accountId: number): Promise<FinanceOverview> =>
  (await api.put<FinanceOverview>(`/finance/accounts/${accountId}/pix`)).data;

export const transferBetweenAccounts = async (body: {
  from_account_id: number; to_account_id: number; amount: number; description?: string; occurred_on?: string;
}): Promise<FinanceOverview> => (await api.post<FinanceOverview>('/finance/transfers', body)).data;

export const listTransfers = async (): Promise<AccountTransfer[]> =>
  (await api.get<AccountTransfer[]>('/finance/transfers', { headers: { 'X-Skip-Loading': 'true' } })).data;

/** Apaga a transferência lançada errado: as duas contas voltam ao que eram. */
export const deleteTransfer = async (id: number): Promise<FinanceOverview> =>
  (await api.delete<FinanceOverview>(`/finance/transfers/${id}`)).data;

export const listPayables = async (status?: 'open' | 'paid' | 'canceled'): Promise<PayableList> =>
  (await api.get<PayableList>('/finance/payables', { params: status ? { status } : undefined, headers: { 'X-Skip-Loading': 'true' } })).data;

export const createPayable = async (body: { description: string; amount: number; due_date: string; notes?: string }): Promise<Payable> =>
  (await api.post<Payable>('/finance/payables', body)).data;

export const payPayable = async (id: number, accountId: number, paidOn?: string): Promise<Payable> =>
  (await api.post<Payable>(`/finance/payables/${id}/pay`, { account_id: accountId, paid_on: paidOn })).data;

/** Desfaz o pagamento: a conta volta para em aberto e o dinheiro volta para a conta de onde saiu. */
export const unpayPayable = async (id: number): Promise<Payable> =>
  (await api.post<Payable>(`/finance/payables/${id}/unpay`)).data;

export const cancelPayable = async (id: number): Promise<Payable> =>
  (await api.post<Payable>(`/finance/payables/${id}/cancel`)).data;

/** Date -> "AAAA-MM-DD" no fuso do aparelho (a data que a pessoa escolheu, sem virar o dia por UTC). */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
