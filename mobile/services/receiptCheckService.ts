/** Conferir recebimento de uma entrada: a mesma conferência compartilhada da Conferência de estoque, com escopo de UMA entrada. */
import api from './api';
import type { CountOp } from '@/utils/countOps';

export interface ReceiptLine {
  variant_id: number;
  product_name: string;
  label: string;
  display_code: string | null;
  /** o que a nota trouxe */
  expected: number;
  /** o que as pessoas já bipararam (somado) */
  counted: number;
  counted_by_name: string | null;
}

/** Peça lida que não é desta entrada. */
export interface ReceiptExtra {
  variant_id: number;
  product_name: string;
  label: string;
  display_code: string | null;
  quantity: number;
  counted_by_name: string | null;
}

export interface ReceiptCheckState {
  entry: { id: number; entry_code: string };
  count_id: number | null;
  revision: number;
  lines: ReceiptLine[];
  extras: ReceiptExtra[];
  totals: { expected: number; read: number; missing: number; over: number; extra: number };
}

/** Versão do que o servidor tem (muda quando chega contagem nova, ou quando alguém zera e recomeça). */
export const receiptRevisionKey = (s: Pick<ReceiptCheckState, 'count_id' | 'revision'>): string => `${s.count_id ?? 0}:${s.revision}`;

export async function getReceiptCheck(entryId: number, quiet = false): Promise<ReceiptCheckState> {
  const { data } = await api.get<ReceiptCheckState>(`/stock-entries/${entryId}/receipt-check`, quiet ? { headers: { 'X-Skip-Loading': 'true' } } : undefined);
  return data;
}

export async function applyReceiptCheck(entryId: number, ops: CountOp[], batchId: string): Promise<ReceiptCheckState> {
  const { data } = await api.post<ReceiptCheckState>(
    `/stock-entries/${entryId}/receipt-check/apply`, { ops, batch_id: batchId }, { headers: { 'X-Skip-Loading': 'true' } },
  );
  return data;
}

/** Zera a contagem de TODAS as pessoas (gerente e admin). */
export async function resetReceiptCheck(entryId: number): Promise<ReceiptCheckState> {
  const { data } = await api.delete<ReceiptCheckState>(`/stock-entries/${entryId}/receipt-check`);
  return data;
}
