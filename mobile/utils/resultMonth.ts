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

const cents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);

/** Lucro das vendas: vendeu menos o custo das peças, ANTES dos gastos da loja (em centavos inteiros). */
export function grossProfit(d: { revenue: number | string; cmv: number | string }): number {
  return (cents(d.revenue) - cents(d.cmv)) / 100;
}

/** Os dois dias estão no mesmo mês? Devolve ano e mês (1 a 12); senão nulo. Datas AAAA-MM-DD. */
export function sameMonth(startIso: string, endIso: string): { year: number; month: number } | null {
  const a = String(startIso ?? '').match(/^(\d{4})-(\d{2})-/);
  const b = String(endIso ?? '').match(/^(\d{4})-(\d{2})-/);
  if (!a || !b || a[1] !== b[1] || a[2] !== b[2]) return null;
  return { year: Number(a[1]), month: Number(a[2]) };
}

export interface MonthCompareRow { key: 'revenue' | 'gross' | 'expenses' | 'gifts' | 'net'; period: number; month: number }
export interface MonthCompare {
  rows: MonthCompareRow[];
  /** Gastos e brindes do mês que foram lançados fora das datas do período (não entram na conta dele). */
  outside: number;
  /** O lucro final do período saiu maior que o do mês inteiro (o que parece errado e não é). */
  periodHigher: boolean;
}

/**
 * Período dentro de um mês, lado a lado com o mês inteiro. Explica por que o lucro final de poucos dias pode sair maior
 * que o do mês: o gasto entra na conta no dia em que foi lançado, então o que foi lançado antes ou depois das datas fica de fora.
 * A diferença entre os dois lucros finais é sempre: (lucro das vendas que falta) menos (gastos e brindes que faltam).
 */
export function compareWithMonth(period: MonthlyLike, month: MonthlyLike): MonthCompare {
  const row = (key: MonthCompareRow['key'], p: number, m: number): MonthCompareRow => ({ key, period: p / 100, month: m / 100 });
  const gp = (d: MonthlyLike) => cents(d.revenue) - cents(d.cmv);
  const gifts = (d: MonthlyLike) => cents(d.gifts_total);
  const outside = Math.max(0, cents(month.total_expenses) + gifts(month) - cents(period.total_expenses) - gifts(period));
  return {
    rows: [
      row('revenue', cents(period.revenue), cents(month.revenue)),
      row('gross', gp(period), gp(month)),
      row('expenses', cents(period.total_expenses), cents(month.total_expenses)),
      row('gifts', gifts(period), gifts(month)),
      row('net', cents(period.net_profit), cents(month.net_profit)),
    ],
    outside: outside / 100,
    periodHigher: cents(period.net_profit) > cents(month.net_profit),
  };
}
