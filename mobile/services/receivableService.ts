/**
 * Fiado (contas a receber): parcelas das vendas no fiado e fiado antigo, receber, desfazer e cancelar.
 * Regras em backend/app/models/receivable.py e backend/app/services/receivable_service.py.
 */
import api from './api';

export type ReceivableStatus = 'open' | 'partial' | 'paid' | 'canceled';
export type ReceivableFilter = 'open' | 'overdue' | 'paid' | 'canceled' | 'all';
export type ReceiveMethod = 'cash' | 'pix' | 'bank_transfer' | 'debit_card' | 'credit_card';

export interface Receivable {
  id: number;
  customer_id: number;
  customer_name: string | null;
  sale_id: number | null;
  origin: 'sale' | 'opening';
  description: string | null;
  installment_number: number;
  installments_total: number;
  amount: number;
  received_amount: number;
  abated_amount: number;
  outstanding: number;
  due_date: string;
  status: ReceivableStatus;
  overdue: boolean;
  notes: string | null;
}

export interface ReceivableSummary {
  open_total: number;
  overdue_total: number;
  due_this_week: number;
  customers: number;
  installments: number;
}

export interface ReceivablePayment {
  id: number;
  amount: number;
  payment_method: ReceiveMethod;
  method_label: string;
  received_on: string;
  created_by_name: string | null;
}

export const RECEIVE_METHODS: { value: ReceiveMethod; label: string }[] = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'debit_card', label: 'Débito' },
  { value: 'credit_card', label: 'Crédito' },
  { value: 'bank_transfer', label: 'Transferência' },
];

export async function listReceivables(status: ReceivableFilter = 'open', customerId?: number) {
  const { data } = await api.get<{ items: Receivable[]; summary: ReceivableSummary }>('/receivables', {
    params: { status, ...(customerId ? { customer_id: customerId } : {}) },
  });
  return data;
}

export async function getReceivableSummary(customerId?: number) {
  const { data } = await api.get<ReceivableSummary>('/receivables/summary', {
    params: customerId ? { customer_id: customerId } : {}, headers: { 'X-Skip-Loading': 'true' },
  });
  return data;
}

export async function listReceivablePayments(receivableId: number) {
  const { data } = await api.get<ReceivablePayment[]>(`/receivables/${receivableId}/payments`);
  return data;
}

export async function receiveFiado(body: {
  customer_id?: number; receivable_id?: number; amount: number; payment_method: ReceiveMethod; received_on?: string;
}) {
  const { data } = await api.post('/receivables/receive', body, { headers: { 'X-Loading-Message': 'Recebendo...' } });
  return data;
}

export async function createOpeningFiado(body: {
  customer_id: number; description?: string; installments: { amount: number; due_date: string }[];
}) {
  const { data } = await api.post('/receivables/opening', body);
  return data;
}

export async function cancelReceivable(id: number) {
  const { data } = await api.post(`/receivables/${id}/cancel`);
  return data;
}

export async function undoReceivablePayment(paymentId: number) {
  const { data } = await api.delete(`/receivables/payments/${paymentId}`);
  return data;
}
