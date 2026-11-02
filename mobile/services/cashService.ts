/** Caixa da loja: abrir, suprimento/sangria, fechar e histórico. O esperado vem calculado do servidor. */
import api from './api';
import { skipLoading } from '@/utils/apiHelpers';

export type MovementKind = 'supply' | 'withdrawal';

export interface CashMovement {
  id: number;
  kind: MovementKind;
  amount: number;
  reason: string;
  reason_label: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

export interface CashSession {
  id: number;
  status: 'open' | 'closed';
  opened_at: string;
  opened_by: string | null;
  opening_note: string | null;
  closed_at: string | null;
  closed_by: string | null;
  closing_note: string | null;
  counted_amount: number | null;
  difference: number | null;
  opening_amount: number;
  cash_sales: number;
  cash_refunds: number;
  supplies: number;
  withdrawals: number;
  expected_amount: number;
  sales_count: number;
  other_methods: Record<string, { amount: number; sales: number }>;
  movements: CashMovement[];
}

export interface CashCurrent {
  open: boolean;
  session: CashSession | null;
  last_closed: { id: number; closed_at: string; counted_amount: number; difference: number } | null;
}

export interface CashSessionSummary {
  id: number;
  status: 'open' | 'closed';
  opened_at: string;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  opening_amount: number;
  expected_amount: number | null;
  counted_amount: number | null;
  difference: number | null;
  cash_sales: number | null;
  sales_count: number | null;
}

export interface CashReason {
  id: string;
  label: string;
}

export const getCashCurrent = async (): Promise<CashCurrent> => (await api.get<CashCurrent>('/cash/current', skipLoading())).data;

export const getCashReasons = async (): Promise<Record<MovementKind, CashReason[]>> =>
  (await api.get('/cash/reasons', skipLoading())).data;

export const openCash = async (openingAmount: number, note?: string): Promise<CashSession> =>
  (await api.post<CashSession>('/cash/open', { opening_amount: openingAmount, note: note || null })).data;

export const addCashMovement = async (kind: MovementKind, amount: number, reason: string, note?: string): Promise<CashSession> =>
  (await api.post<CashSession>('/cash/movements', { kind, amount, reason, note: note || null })).data;

export const closeCash = async (countedAmount: number, note?: string): Promise<CashSession> =>
  (await api.post<CashSession>('/cash/close', { counted_amount: countedAmount, note: note || null })).data;

export const getCashSessions = async (skip = 0, limit = 30): Promise<CashSessionSummary[]> =>
  (await api.get<CashSessionSummary[]>('/cash/sessions', { params: { skip, limit } })).data;

export const getCashSession = async (id: number): Promise<CashSession> => (await api.get<CashSession>(`/cash/sessions/${id}`)).data;
