/**
 * Regras de texto e agrupamento da tela de Despesas (lista, detalhe e lançar). Nada de conta aqui: total, contagem e quebra por
 * categoria vêm do servidor (GET /expenses/summary). Sem imports do React Native (testes: node scripts/test-expense-logic.mts).
 */
// (sem importar outros arquivos: os testes rodam direto no node)
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export type AccountTone = 'neutral' | 'ok' | 'warn';
export interface AccountLine { text: string; detail: string | null; tone: AccountTone }

/** Texto sem acento e em minúsculas, para comparar palavras ("Retirada" = "retirada" = "RETIRADA"). */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const OWNER_DRAW_WORDS = ['retirada', 'retirou', 'pro labore', 'pro-labore', 'prolabore', 'socio', 'socia', 'emprestimo', 'fatura do cartao'];

/**
 * O texto parece retirada de sócio, empréstimo ou fatura de cartão? Isso NÃO é gasto da loja: tira dinheiro da conta mas não deve
 * entrar no resultado do mês. É só uma sugestão (o lojista decide): o app não bloqueia nada.
 */
export function looksLikeOwnerDraw(description: string): boolean {
  const t = fold(description);
  return OWNER_DRAW_WORDS.some((w) => t.includes(w));
}

/**
 * De onde saiu o dinheiro desta despesa, em palavras do lojista.
 * `financeStarted` falso: o Financeiro não está ligado, então não existe "conta" para falar (devolve null).
 */
export function accountLine(
  e: { stock_entry_id?: number | null; account_id?: number | null },
  accountName: string | undefined,
  financeStarted: boolean,
): AccountLine | null {
  if (e.stock_entry_id) return { text: 'Custo de um lote', detail: 'Já está no custo das peças; não entra de novo no resultado do mês.', tone: 'neutral' };
  if (!financeStarted) return null;
  if (e.account_id) return { text: accountName ? `Saiu de ${accountName}` : 'Saiu de uma conta', detail: null, tone: 'ok' };
  return { text: 'Sem conta', detail: 'Entra no resultado do mês, mas não tirou dinheiro de nenhuma conta.', tone: 'warn' };
}

export interface PendingApproval { id: number; kind: 'delete' | 'update'; requested_by_name?: string | null; approved_count: number; required_count: number }

/** Frase do pedido de aprovação em andamento ("Pedido para apagar esperando aprovação (aprovaram 1 de 2)"). */
export function approvalText(p: PendingApproval): string {
  const what = p.kind === 'delete' ? 'apagar' : 'mudar';
  const progress = p.required_count > 0 ? ` (aprovaram ${p.approved_count} de ${p.required_count})` : '';
  return `Pedido para ${what} esperando aprovação${progress}`;
}

const WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "Hoje", "Ontem" ou "23/11 · segunda". `today` é o dia de hoje (AAAA-MM-DD), passado de fora para o teste não depender do relógio. */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Hoje';
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  if (diff === 1) return 'Ontem';
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} · ${WEEK[dow]}`;
}

export type ListEntry<T> = { type: 'day'; key: string; label: string } | { type: 'item'; key: string; item: T };

/** Despesas (já em ordem de data, da mais nova) com um cabeçalho por dia: a data deixa de repetir em toda linha. */
export function withDayHeaders<T extends { id: number; expense_date: string }>(items: T[], today: string): ListEntry<T>[] {
  const out: ListEntry<T>[] = [];
  let last = '';
  for (const it of items) {
    if (it.expense_date !== last) {
      last = it.expense_date;
      out.push({ type: 'day', key: `d-${last}`, label: dayLabel(last, today) });
    }
    out.push({ type: 'item', key: `i-${it.id}`, item: it });
  }
  return out;
}

/** Busca por descrição ou categoria, sem acento e sem diferença de maiúscula. */
export function matchesQuery(e: { description: string; category?: { name: string } | null; notes?: string | null }, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${e.description} ${e.category?.name ?? ''} ${e.notes ?? ''}`);
  return words.every((w) => hay.includes(w));
}
