/**
 * Regras da tela Início que não dependem de tela: as frases e as escolhas por papel ficam aqui para serem testadas
 * sem abrir o app (`node scripts/test-home-logic.mts`). Sem imports, como `saleRefund.ts` (o node dos testes não resolve `./format`).
 */

/**
 * Frase do dia dentro do cartão "Nova venda". Sem venda vira convite, nunca um zero solto. Com devolução no dia, a frase diz o que foi
 * VENDIDO (`gross`) e o que foi DEVOLVIDO, em palavras: "Hoje: -R$ 262,14 em 1 venda" parecia uma venda negativa.
 */
export function todayLine(total: number, count: number, money: (v: number) => string, gross?: number, refunds?: number): string {
  const back = (refunds ?? 0) > 0 ? ` · devolveu ${money(refunds as number)}` : '';
  if (!(count > 0)) return `Hoje: nenhuma venda${back || ' ainda'}`;
  const shown = back && gross !== undefined ? gross : total;
  return `Hoje: ${money(shown)} em ${count.toLocaleString('pt-BR')} ${count === 1 ? 'venda' : 'vendas'}${back}`;
}

/**
 * Linha de baixo do cartão: lucro e margem do dia (a margem só existe com venda líquida positiva). Dia com devolução não mostra lucro nem
 * margem (a conta do dia mistura vendas de hoje com peças de outros dias) e a devolução já está na frase de cima.
 */
export function todaySub(
  o: { net: number; refunds: number; profit: number; margin: number; count: number; trend: number },
  money: (v: number) => string, pct: (v: number) => string, signedPct: (v: number) => string,
): string | null {
  if (o.refunds > 0) return null;
  if (!(o.count > 0)) return null;
  const margin = o.net > 0 ? ` · margem ${pct(o.margin)}` : '';
  const trend = o.trend !== 0 ? ` · ${signedPct(o.trend)} vs ontem` : '';
  return `Lucro de hoje ${money(o.profit)}${margin}${trend}`;
}

/**
 * Atalhos fixos da Início, por papel (quatro, todos à vista). Nova venda não entra: é o cartão principal.
 * Quem gerencia vê o que muda no dia a dia da compra e do dinheiro; quem vende vê o que usa no balcão.
 */
export type ShortcutId = 'entries' | 'finance' | 'labels' | 'consult' | 'products' | 'customers' | 'conditional';
export function shortcutIds(manager: boolean): ShortcutId[] {
  return manager ? ['products', 'entries', 'finance', 'consult'] : ['consult', 'products', 'customers', 'conditional'];
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

/**
 * Leitura do giro do estoque. Com poucas vendas a taxa é pequena só porque a loja é nova ou acabou de comprar,
 * então não vira "Crítico" nem recebe conselho de promoção agressiva: fica "Poucas vendas ainda".
 */
export type StockPace = 'few' | 'excellent' | 'moderate' | 'critical';
export const PACE_MIN_SOLD = 10;
export function stockPace(rate: number, totalSold: number): StockPace {
  if (!(totalSold >= PACE_MIN_SOLD)) return 'few';
  if (rate >= 70) return 'excellent';
  if (rate >= 40) return 'moderate';
  return 'critical';
}
export function paceLabel(p: StockPace): string {
  return p === 'excellent' ? 'Excelente' : p === 'moderate' ? 'Moderado' : p === 'critical' ? 'Baixo' : 'Poucas vendas';
}
export function paceAdvice(p: StockPace): string {
  return p === 'excellent' ? 'Seu estoque está girando bem.'
    : p === 'moderate' ? 'Giro moderado. Veja se vale uma promoção nos produtos parados.'
    : p === 'critical' ? 'Giro baixo. Revise os preços dos produtos parados.'
    : 'Ainda há poucas vendas para avaliar o giro.';
}

/** "1 un vendida" / "3 un vendidas". */
export function soldUnitsText(qty: number): string {
  return `${qty} un ${qty === 1 ? 'vendida' : 'vendidas'}`;
}
