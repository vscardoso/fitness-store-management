// Resultado do mês: o número do topo é a soma das linhas da conta. Rodar: node scripts/test-result-month.mts
import assert from 'node:assert/strict';
import { compareWithMonth, grossProfit, linesSum, resultLines, sameMonth } from '../utils/resultMonth.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const fecha = (d: any) => assert.equal(linesSum(resultLines(d)), Math.round(Number(d.net_profit) * 100) / 100);

t('mês normal: vendeu - custo - gastos', () => fecha({ revenue: 1498.8, cmv: 530.02, total_expenses: 0, gifts_total: 0, net_profit: 968.78 }));
t('com gastos e brinde (admin): brinde é linha própria', () => {
  const d = { revenue: 180, cmv: 80, total_expenses: 55.5, gifts_total: 40, net_profit: 4.5 };
  assert.equal(resultLines(d).length, 4);
  fecha(d);
});
t('sem brinde a linha não existe (zero não aparece)', () => {
  assert.equal(resultLines({ revenue: 10, cmv: 4, total_expenses: 1, gifts_total: 0, net_profit: 5 }).length, 3);
  assert.equal(resultLines({ revenue: 10, cmv: 4, total_expenses: 1, net_profit: 5 }).length, 3);
});
t('mês sem venda e prejuízo (gastou mais do que vendeu)', () => {
  fecha({ revenue: 0, cmv: 0, total_expenses: 0, net_profit: 0 });
  fecha({ revenue: 100, cmv: 60, total_expenses: 300, gifts_total: 0, net_profit: -260 });
});
t('valores em texto (Decimal do servidor) e seis dígitos', () => {
  fecha({ revenue: '1234567.89', cmv: '400000.10', total_expenses: '33333.33', gifts_total: '0.00', net_profit: '801234.46' });
});
t('centavos sem erro de ponto flutuante', () => fecha({ revenue: 0.3, cmv: 0.2, total_expenses: 0.1, net_profit: 0 }));
// Caso real da loja (18/11/2026): 7 dias deu lucro final MAIOR que o mês porque R$ 1.963,45 de gastos foram lançados em 11/11,
// um dia antes da janela de 7 dias (12 a 18). A tela precisa mostrar isso lado a lado.
const MES = { revenue: '13759.20', cmv: '7455.99', total_expenses: '2374.08', gifts_total: '309.00', net_profit: '3620.13' };
const SETE = { revenue: '10355.20', cmv: '6052.09', total_expenses: '410.63', gifts_total: '246.00', net_profit: '3646.48' };
t('lucro das vendas = vendeu - custo, em centavos', () => {
  assert.equal(grossProfit(MES), 6303.21);
  assert.equal(grossProfit(SETE), 4303.11);
  assert.equal(grossProfit({ revenue: 0.3, cmv: 0.2 }), 0.1);
});
t('7 dias x mês: o lucro final do período é maior, e o que falta é gasto e brinde lançados fora das datas', () => {
  const c = compareWithMonth(SETE, MES);
  assert.equal(c.periodHigher, true);
  assert.equal(c.outside, 2026.45);   // (2374,08 + 309,00) - (410,63 + 246,00)
  const by = (k: string) => c.rows.find((r) => r.key === k)!;
  assert.equal(by('gross').period, 4303.11);
  assert.equal(by('gross').month, 6303.21);
  assert.equal(by('net').period, 3646.48);
  assert.equal(by('net').month, 3620.13);
});
t('a diferença entre os dois lucros finais sempre fecha: lucro das vendas que falta - gastos e brindes que faltam', () => {
  const c = compareWithMonth(SETE, MES);
  const g = (k: string) => c.rows.find((r) => r.key === k)!;
  const falta = Math.round((g('gross').month - g('gross').period) * 100) - Math.round(c.outside * 100);
  assert.equal(falta, Math.round((g('net').month - g('net').period) * 100));
});
t('período com todos os gastos do mês dentro: nada fica de fora e o lucro do período não é maior', () => {
  const c = compareWithMonth({ revenue: 100, cmv: 40, total_expenses: 10, gifts_total: 0, net_profit: 50 }, { revenue: 300, cmv: 120, total_expenses: 10, gifts_total: 0, net_profit: 170 });
  assert.equal(c.outside, 0);
  assert.equal(c.periodHigher, false);
});
t('sameMonth: só compara com o mês quando o período inteiro está nele', () => {
  assert.deepEqual(sameMonth('2026-11-12', '2026-11-18'), { year: 2026, month: 11 });
  assert.deepEqual(sameMonth('2026-11-01', '2026-11-30'), { year: 2026, month: 11 });
  assert.equal(sameMonth('2026-10-20', '2026-11-18'), null);
  assert.equal(sameMonth('2025-11-10', '2026-11-18'), null);
  assert.equal(sameMonth('', '2026-11-18'), null);
});
console.log(`${n} testes ok`);
