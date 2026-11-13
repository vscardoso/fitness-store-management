/**
 * Regras da tela Início que não dependem de tela: as frases e as escolhas por papel ficam aqui para serem testadas
 * sem abrir o app (`node scripts/test-home-logic.mts`). Sem imports, como `saleRefund.ts` (o node dos testes não resolve `./format`).
 */

/** Frase do dia dentro do cartão "Nova venda". Sem venda vira convite, nunca um zero solto. */
export function todayLine(total: number, count: number, money: (v: number) => string): string {
  if (!(count > 0)) return 'Hoje: nenhuma venda ainda';
  return `Hoje: ${money(total)} em ${count.toLocaleString('pt-BR')} ${count === 1 ? 'venda' : 'vendas'}`;
}
