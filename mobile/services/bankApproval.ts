/**
 * Aprovação dos administradores para mexer no saldo de um BANCO (regra da loja).
 *
 * O servidor responde 202 `{ approval_required: true, approval }` quando uma correção envolve um banco: nada é aplicado, o pedido
 * fica esperando todos os administradores. Sem motivo escrito (20 letras) ele responde 400 com a frase "Para mexer no saldo de
 * um banco...": aí o app pergunta o motivo (janela global, `BankApprovalHost`) e repete a chamada UMA vez com ele.
 * Contas de gaveta e maquininha não passam por aqui.
 */
import { Alert } from 'react-native';
import { router } from 'expo-router';
import api from './api';

export interface ApprovalVote { user_id: number; name: string | null; vote: 'approve' | 'reject'; comment: string | null; at: string | null }
export interface FinanceApproval {
  id: number; kind: string; title: string; summary: string; reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled' | 'failed';
  rule: string; account_id: number | null; amount: number | null;
  requested_by: string | null; requested_by_id: number | null;
  created_at: string | null; expires_at: string; decided_at: string | null; result_message: string | null;
  votes: ApprovalVote[]; waiting_for: { user_id: number; name: string }[];
  can_vote: boolean; can_cancel: boolean; approved_count: number; admins_total: number;
}
export interface ApprovalHeld { approval_required: true; approval: FinanceApproval; message: string }
export interface Approver { user_id: number; name: string; approver: boolean }
export interface ApprovalList { items: FinanceApproval[]; pending: number; waiting_for_me: number; approvers: Approver[] }
/** Administrador escolhe quais administradores aprovam (os outros só acompanham). */
export const setApprovers = async (userIds: number[]): Promise<Approver[]> =>
  (await api.put<Approver[]>('/finance/approvers', { user_ids: userIds })).data;

export const getApprovals = async (): Promise<ApprovalList> =>
  (await api.get<ApprovalList>('/finance/approvals', { headers: { 'X-Skip-Loading': 'true' } })).data;
export const getApprovalsSummary = async (): Promise<{ pending: number; waiting_for_me: number }> =>
  (await api.get('/finance/approvals/summary', { headers: { 'X-Skip-Loading': 'true' } })).data;
export const approveApproval = async (id: number, comment?: string): Promise<FinanceApproval> =>
  (await api.post<FinanceApproval>(`/finance/approvals/${id}/approve`, { comment })).data;
export const rejectApproval = async (id: number, comment: string): Promise<FinanceApproval> =>
  (await api.post<FinanceApproval>(`/finance/approvals/${id}/reject`, { comment })).data;
export const cancelApproval = async (id: number): Promise<FinanceApproval> =>
  (await api.post<FinanceApproval>(`/finance/approvals/${id}/cancel`)).data;

export const isHeld = (data: unknown): data is ApprovalHeld => !!data && (data as ApprovalHeld).approval_required === true;

/** A frase com que o servidor pede o motivo (o app a reconhece para perguntar e repetir). */
export const REASON_NEEDLE = 'Para mexer no saldo de um banco';
/** A gaveta com diferença acima de R$ 10 também pede motivo (e outro administrador aprova). */
export const DRAWER_REASON_NEEDLE = 'Para acertar a gaveta com uma diferença acima';
export const isBankReasonRequired = (e: unknown): boolean => {
  const err = e as { status?: number; message?: string } | undefined;
  const msg = String(err?.message ?? '');
  return !!err && (err.status === 400 || err.status === undefined) && (msg.includes(REASON_NEEDLE) || msg.includes(DRAWER_REASON_NEEDLE));
};

// ── janela do motivo (montada uma vez na raiz: BankApprovalHost) ─────────────────────────────────────────────────
type Asker = () => Promise<string | null>;
let asker: Asker | null = null;
export const registerReasonAsker = (fn: Asker | null) => { asker = fn; };

export class ReasonCancelled extends Error {
  constructor() { super('Pedido cancelado: sem motivo o saldo do banco não muda.'); this.name = 'ReasonCancelled'; }
}

/** Roda `send` sem motivo; se o servidor pedir, pergunta e roda de novo com ele. */
export async function withBankReason<T>(send: (reason?: string) => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (e) {
    if (isBankReasonRequired(e) && asker) {
      const reason = await asker();
      if (!reason) throw new ReasonCancelled();
      return await send(reason);
    }
    throw e;
  }
}

/** Aviso depois de um pedido enviado ("o saldo só muda quando todos aprovarem"). */
export function announceHeld(held: ApprovalHeld): void {
  const waiting = held.approval.waiting_for.map((w) => w.name).filter(Boolean);
  const who = waiting.length ? `Falta aprovar: ${waiting.join(', ')}.` : '';
  Alert.alert('Pedido enviado', `${held.message}\n\n${held.approval.summary}\n\n${who}`.trim(), [
    { text: 'Ver pedidos', onPress: () => router.push('/finance/approvals' as any) },
    { text: 'Ok', style: 'cancel' },
  ]);
}

/** Se a resposta foi um pedido (202), avisa e devolve `fallback`; senão devolve a resposta normal. */
export function settle<T>(data: unknown, fallback: T): T {
  if (isHeld(data)) {
    announceHeld(data);
    return fallback;
  }
  return data as T;
}
