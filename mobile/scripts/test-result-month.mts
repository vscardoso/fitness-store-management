// Resultado do mês: o número do topo é a soma das linhas da conta. Rodar: node scripts/test-result-month.mts
import assert from 'node:assert/strict';
import { linesSum, resultLines } from '../utils/resultMonth.ts';

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
console.log(`${n} testes ok`);
