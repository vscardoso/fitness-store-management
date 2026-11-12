import { getServerPdf } from './pdfDelivery';
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
  /** Saldo de partida (da implantação); só vem do servidor novo. */
  opening_balance?: number | string;
  breakdown: {
    opening: number; sales: number; refunds: number; cash_register: number;
    transfers_in: number; transfers_out: number; payables_paid: number; expenses_paid: number;
    /** Mercadoria das compras que saíram desta conta (entradas com "de onde saiu o dinheiro"). */
    purchases_paid?: number;
    receivables_received: number; other_in: number; other_out: number; closing_adjustments: number;
  };
}

export interface FinanceOverview {
  started: boolean;
  start_date: string | null;
  accounts: FinanceAccount[];
  total: number;
  /** Suposição "e se eu receber o fiado?" (nada é gravado). Só vem depois da implantação. */
  projection?: FinanceProjection;
  /** Maquininha: quando o cartão cai no banco (previsão por dia útil). */
  card_schedule?: CardSchedule | null;
  /** Compras de mercadoria que ainda não disseram de onde saiu o dinheiro (o saldo ainda não as desconta). */
  purchases_pending?: PurchasesPending;
}

export interface PendingPurchase { id: number; entry_code: string; entry_date: string; supplier_name: string; amount: number }
export interface PurchasesPending { started: boolean; count: number; total: number; entries: PendingPurchase[] }

/** Resumo, compra por compra, de onde saiu o dinheiro depois de descontar compras (o servidor devolve junto com os saldos). */
export interface PurchasesResult {
  mode: 'with_cash' | 'account' | 'outside' | 'undone';
  account_name: string | null;
  /** Quanto a gaveta tinha para pagar (só em "Gaveta + banco") e quanto ficou. */
  cash_before: number | null;
  cash_after: number | null;
  items: { id: number; entry_code: string; entry_date: string; supplier_name: string; total: number; from_cash: number; from_account: number }[];
  total: number;
  from_cash: number;
  from_account: number;
}

/** Diz de onde saiu o dinheiro de compras já lançadas (conta vazia e outside falso desfaz). */
export const payPurchases = async (entryIds: number[], target: { accountId?: number | null; outside?: boolean; withCash?: boolean }): Promise<FinanceOverview & { purchases_result?: PurchasesResult }> =>
  (await api.post('/finance/purchases-pay', { entry_ids: entryIds, account_id: target.accountId ?? null, outside: !!target.outside, with_cash: !!target.withCash })).data;

export interface CardScheduleItem { expected_on: string; weekday: string; amount: number; status: 'overdue' | 'today' | 'future' }
export interface CardSchedule {
  account_id: number; balance: number; previous: number; items: CardScheduleItem[]; due_now: number;
  bank_account_id: number | null; bank_name: string | null; rule: string;
  /** Repasse automático: ligado, banco de destino, hora a partir da qual o dia de hoje entra e até que dia já foi lançado. */
  auto: { enabled: boolean; account_id: number | null; bank_name: string | null; run_hour: number; through: string | null };
}

/** Liga ou desliga o repasse automático da maquininha (só administrador). */
export const setCardAuto = async (enabled: boolean, accountId?: number): Promise<CardSchedule> =>
  (await api.put('/finance/card-auto', { enabled, ...(accountId ? { account_id: accountId } : {}) })).data;

export const settleCard = async (body: { gross: number; received: number; occurred_on?: string }): Promise<{ fee: number }> =>
  (await api.post('/finance/card-settlement', body)).data;

export interface FinanceProjection {
  money_now: number;
  fiado_open: number;
  fiado_overdue: number;
  fiado_customers: number;
  payables_open: number;
  if_overdue_received: number;
  if_all_received: number;
  after_paying_everything: number;
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
  /** despesa da loja: ao pagar entra no resultado do mês; falso = compra de mercadoria ou dívida de antes da implantação */
  counts_as_expense: boolean;
  expense_category_id: number | null;
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
  /** Lançado pelo sistema (repasse automático da maquininha) e o dia de cartão que ele quitou. */
  is_auto?: boolean;
  card_day?: string | null;
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
}): Promise<FinanceOverview & { warning?: string | null }> =>
  (await api.post<FinanceOverview & { warning?: string | null }>('/finance/transfers', body)).data;

export const listTransfers = async (): Promise<AccountTransfer[]> =>
  (await api.get<AccountTransfer[]>('/finance/transfers', { headers: { 'X-Skip-Loading': 'true' } })).data;

/** Apaga a transferência lançada errado: as duas contas voltam ao que eram. */
export const deleteTransfer = async (id: number): Promise<FinanceOverview> =>
  (await api.delete<FinanceOverview>(`/finance/transfers/${id}`)).data;

export const listPayables = async (status?: 'open' | 'paid' | 'canceled'): Promise<PayableList> =>
  (await api.get<PayableList>('/finance/payables', { params: status ? { status } : undefined, headers: { 'X-Skip-Loading': 'true' } })).data;

export const createPayable = async (body: {
  description: string; amount: number; due_date: string; notes?: string | null;
  counts_as_expense?: boolean; expense_category_id?: number | null;
}): Promise<Payable> =>
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

// ── Retiradas de sócio, empréstimos, fatura do cartão: mexem na conta e NÃO entram no resultado do mês ──────────────
export type EntryKind =
  | 'owner_withdrawal' | 'loan_given' | 'loan_paid' | 'card_bill' | 'other_out'
  | 'owner_contribution' | 'loan_repaid' | 'loan_taken' | 'other_in' | 'closing_adjustment';

export interface AccountEntry {
  id: number;
  kind: EntryKind;
  kind_label: string;
  direction: 'in' | 'out' | 'adjust';
  amount: number;
  occurred_on: string;
  account_id: number;
  account_name: string | null;
  person: string | null;
  description: string | null;
  created_by_name: string | null;
  closing_id: number | null;
}

export interface LoanPerson {
  person: string; given: number; repaid: number; to_receive: number; taken: number; paid: number; to_pay: number;
}

export interface LoansSummary { people: LoanPerson[]; to_receive_total: number; to_pay_total: number }

export const listEntries = async (): Promise<AccountEntry[]> =>
  (await api.get<AccountEntry[]>('/finance/entries', { headers: { 'X-Skip-Loading': 'true' } })).data;

export const createEntry = async (body: {
  kind: EntryKind; account_id: number; amount: number; occurred_on?: string; person?: string; description?: string;
}): Promise<AccountEntry> => (await api.post<AccountEntry>('/finance/entries', body)).data;

export const deleteEntry = async (id: number): Promise<void> => { await api.delete(`/finance/entries/${id}`); };

export const getLoans = async (): Promise<LoansSummary> =>
  (await api.get<LoansSummary>('/finance/loans', { headers: { 'X-Skip-Loading': 'true' } })).data;

// ── Fechamento do mês ───────────────────────────────────────────────────────────────────────────────────────────
export interface ClosingMonth { year: number; month: number; label: string; closed: boolean; difference: number | null }

export interface ClosingAccount {
  id: number; name: string; kind: AccountKind; receives_pix: boolean; start: number; expected: number;
  counted?: number; difference?: number;
}

export interface Line { label: string; amount: number; kind?: string; method?: string }

export interface MonthClosing {
  year: number; month: number; label: string; period_start: string; period_end: string;
  month_finished: boolean; partial_start: boolean; start_total: number;
  entered: { sales: Line[]; sales_on_account: number; receivables_received: number; other: Line[]; cash_register_in: number; total: number };
  left: {
    expenses: Line[]; purchases_and_debts: number; refunds: number; other: Line[]; cash_register_out: number; total: number;
    expenses_without_account: { count: number; amount: number };
  };
  transfers_between_accounts: number;
  expected_total: number;
  check_ok: boolean;
  accounts: ClosingAccount[];
  to_receive: { fiado_open: number; fiado_overdue: number; fiado_count: number; loans: number };
  to_pay: { payables_open: number; loans: number };
  result: { revenue: number; cost: number; expenses: number; profit: number; sales_count: number; units_sold: number };
  stock: { pieces: number; sale_value: number; cost_value: number };
  counted_total?: number;
  difference?: number;
  closed: null | {
    id: number; closed_at: string; closed_by_name: string | null; notes: string | null; counted_total: number;
    difference: number; changed_since_close: number; expenses_without_account_changed?: boolean; is_latest: boolean;
  };
}

export const listClosingMonths = async (): Promise<{ started: boolean; months: ClosingMonth[] }> =>
  (await api.get('/finance/closings', { headers: { 'X-Skip-Loading': 'true' } })).data;

export const getMonthClosing = async (year: number, month: number): Promise<MonthClosing> =>
  (await api.get<MonthClosing>(`/finance/closings/${year}/${month}`, { headers: { 'X-Skip-Loading': 'true' } })).data;

export const closeMonth = async (year: number, month: number, counted: Record<string, number>, notes?: string): Promise<MonthClosing> =>
  (await api.post<MonthClosing>(`/finance/closings/${year}/${month}`, { counted, notes },
    { headers: { 'X-Loading-Message': 'Fechando o mês...' } })).data;

export const reopenMonth = async (year: number, month: number): Promise<MonthClosing> =>
  (await api.post<MonthClosing>(`/finance/closings/${year}/${month}/reopen`)).data;

/** Admin: leva o saldo da conta ao valor de verdade com um AJUSTE de hoje (não é venda nem despesa). */
export const adjustAccountBalance = async (
  accountId: number, body: { target_balance: string; reason: string },
): Promise<FinanceOverview & { warning?: string | null }> =>
  (await api.post<FinanceOverview & { warning?: string | null }>(`/finance/accounts/${accountId}/adjust`, body)).data;

/** Admin: corrige o saldo de PARTIDA (erro de implantação) ou o nome da conta. 409 se há mês fechado. */
export const updateAccount = async (
  accountId: number, body: { opening_balance?: string; name?: string },
): Promise<FinanceOverview> => (await api.patch<FinanceOverview>(`/finance/accounts/${accountId}`, body)).data;

// ── Corrigir o que já foi lançado (o saldo é calculado na hora, então corrigir o valor acerta o saldo) ─────────────
/** Corrige valor, dia ou descrição de uma transferência. 400 se a conta ficaria negativa; 409 se é do caixa ou repasse com taxa. */
export const updateTransfer = async (
  id: number, body: { amount?: string; occurred_on?: string; description?: string },
): Promise<AccountTransfer> => (await api.patch<AccountTransfer>(`/finance/transfers/${id}`, body)).data;

/** Corrige o que é, valor, vencimento ou observação. Conta já paga: o valor também acerta a despesa e a conta de onde saiu. */
export const updatePayable = async (
  id: number, body: { description?: string; amount?: string; due_date?: string; notes?: string },
): Promise<Payable> => (await api.patch<Payable>(`/finance/payables/${id}`, body)).data;

/** Corrige valor, dia, conta, pessoa ou descrição de uma retirada ou empréstimo. */
export const updateEntry = async (
  id: number, body: { amount?: string; occurred_on?: string; account_id?: number; person?: string; description?: string },
): Promise<AccountEntry> => (await api.patch<AccountEntry>(`/finance/entries/${id}`, body)).data;

// ── Extrato passo a passo (dia a dia, com o saldo no começo e no fim) ────────────────────────────────────────────────
export interface StatementItem { label: string; amount: number; ref: string | null }
export interface StatementLine { kind: string; label: string; amount: number; count: number | null; items: StatementItem[] }
export interface StatementDay {
  date: string; opening: number; closing: number; net: number; lines: StatementLine[];
  /** Saldo de cada conta no fim do dia (separa o disponível do que a maquininha ainda vai pagar). */
  accounts?: { id: number; name: string; kind: string; closing: number }[];
  /** Vendas no fiado do dia, uma por uma (não entra dinheiro). */
  fiado_launched?: { label: string; amount: number; ref: string | null }[];
  /** Vendas do dia por forma de pagamento e a conta onde o dinheiro entrou. */
  by_method?: { method: string; label: string; count: number; amount: number; account: string }[];
}
export interface Statement {
  started: boolean;
  start_date: string | null;
  account: { id: number; name: string; kind: string } | null;
  days: StatementDay[];
  /** Passe como `before` para ver os dias anteriores; vazio quando já chegou ao começo da contagem. */
  next_before: string | null;
  /** Confere o saldo de agora com o fim do dia mais recente. `difference` só vem na primeira página (a que chega até hoje). */
  reconciliation: { balance_now: number; closing_of_latest_day: number; difference: number | null } | null;
}

/** Extrato de uma conta (ou de todas) por 7 dias antes de `before` (padrão: até hoje). Só gerente e administrador. */
export const getStatement = async (params: { accountId?: number | null; before?: string; days?: number } = {}): Promise<Statement> =>
  (await api.get<Statement>('/finance/statement', {
    params: { ...(params.accountId ? { account_id: params.accountId } : {}), ...(params.before ? { before: params.before } : {}), days: params.days ?? 7 },
    headers: { 'X-Skip-Loading': 'true' },
  })).data;

/** Extrato COMPLETO em PDF (do começo da contagem até hoje, dia a dia). Objeto para o <PdfActions />. Só gerente e administrador. */
export const getStatementPdf = (accountId?: number | null) =>
  getServerPdf('/finance/statement/pdf', { params: accountId ? { account_id: accountId } : {}, title: 'Extrato financeiro' });
