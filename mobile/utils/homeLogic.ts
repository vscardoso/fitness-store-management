/**
 * Regras da tela Início que não dependem de tela: as frases e as escolhas por papel ficam aqui para serem testadas
 * sem abrir o app (`node scripts/test-home-logic.mts`). Sem imports, como `saleRefund.ts` (o node dos testes não resolve `./format`).
 */

/** Frase do dia dentro do cartão "Nova venda". Sem venda vira convite, nunca um zero solto. */
export function todayLine(total: number, count: number, money: (v: number) => string): string {
  if (!(count > 0)) return 'Hoje: nenhuma venda ainda';
  return `Hoje: ${money(total)} em ${count.toLocaleString('pt-BR')} ${count === 1 ? 'venda' : 'vendas'}`;
}

/**
 * Atalhos fixos da Início, por papel (quatro, todos à vista). Nova venda não entra: é o cartão principal.
 * Quem gerencia vê o que muda no dia a dia da compra e do dinheiro; quem vende vê o que usa no balcão.
 */
export type ShortcutId = 'entries' | 'finance' | 'labels' | 'consult' | 'products' | 'customers' | 'conditional';
export function shortcutIds(manager: boolean): ShortcutId[] {
  return manager ? ['entries', 'finance', 'labels', 'consult'] : ['consult', 'products', 'customers', 'conditional'];
}

/**
 * Linhas da conta do mês, na ordem em que o olho soma: vendeu, custo das peças, gastos da loja e (só se houve) brindes.
 * O servidor faz sobrou = vendeu - custo - gastos - brindes (perdas de estoque já estão nos gastos); por isso não há linha de perdas.
 */
export type MonthLineId = 'revenue' | 'cmv' | 'expenses' | 'gifts';
export interface MonthLine { id: MonthLineId; label: string; value: number; sign: 1 | -1 }
export function monthLines(r: { revenue: number; cmv: number; total_expenses: number; gifts_total?: number | null }): MonthLine[] {
  const lines: MonthLine[] = [
    { id: 'revenue', label: 'Você vendeu', value: Number(r.revenue) || 0, sign: 1 },
    { id: 'cmv', label: 'Custo das peças', value: Number(r.cmv) || 0, sign: -1 },
    { id: 'expenses', label: 'Gastos da loja', value: Number(r.total_expenses) || 0, sign: -1 },
  ];
  const gifts = Number(r.gifts_total) || 0;
  if (gifts > 0) lines.push({ id: 'gifts', label: 'Brindes dados', value: gifts, sign: -1 });
  return lines;
}

/** Nome do mês em minúsculas ("novembro"), para o título do bloco. */
export function monthNameOf(d: Date): string {
  return d.toLocaleDateString('pt-BR', { month: 'long' });
}
