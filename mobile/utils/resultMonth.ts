/**
 * Resultado do mês: as linhas da conta que chegam no lucro do mês.
 * Não calcula dinheiro: só ordena e dá o sinal aos valores que o servidor entregou (vendeu, custo das peças, gastos, brindes).
 * `linesSum` existe para o teste provar que o número do topo é a soma das linhas.
 */
export interface MonthlyLike {
  revenue: number | string;
  cmv: number | string;
  total_expenses: number | string;
  gifts_total?: number | string | null;
  net_profit: number | string;
}

export interface ResultLine { key: 'revenue' | 'cmv' | 'expenses' | 'gifts'; sign: '+' | '-'; value: number }

export function resultLines(d: MonthlyLike): ResultLine[] {
  const lines: ResultLine[] = [
    { key: 'revenue', sign: '+', value: Number(d.revenue) },
    { key: 'cmv', sign: '-', value: Number(d.cmv) },
    { key: 'expenses', sign: '-', value: Number(d.total_expenses) },
  ];
  const gifts = Number(d.gifts_total ?? 0);
  if (gifts !== 0) lines.push({ key: 'gifts', sign: '-', value: gifts });
  return lines;
}

/** Soma das linhas com o sinal (em centavos inteiros, sem erro de ponto flutuante). */
export function linesSum(lines: ResultLine[]): number {
  return lines.reduce((acc, l) => acc + (l.sign === '+' ? 1 : -1) * Math.round(l.value * 100), 0) / 100;
}
