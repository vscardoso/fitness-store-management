// Testes das parcelas do fiado no checkout. Rodar: node scripts/test-fiado-plan.mts
import assert from 'node:assert/strict';
import { defaultFirstDue, dueDates, maxFiadoInstallments, splitAmount } from '../utils/fiadoPlan.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

t('parcelas em centavos com a sobra na última (igual ao servidor)', () => {
  assert.deepEqual(splitAmount(100, 3), [33.33, 33.33, 33.34]);
  assert.deepEqual(splitAmount(429.7, 2), [214.85, 214.85]);
  assert.deepEqual(splitAmount(0.05, 3), [0.01, 0.01, 0.03]);
  assert.equal(splitAmount(1234.56, 7).reduce((a, b) => a + Math.round(b * 100), 0), 123456);
});
t('limite de vezes: cada parcela fica com pelo menos R$ 1,00', () => {
  assert.equal(maxFiadoInstallments(0.5), 1);
  assert.equal(maxFiadoInstallments(1), 1);
  assert.equal(maxFiadoInstallments(3.99), 3);
  assert.equal(maxFiadoInstallments(7), 7);
  assert.equal(maxFiadoInstallments(500), 12);
  for (const total of [1, 2.5, 5, 11.99, 12, 100]) {
    const k = maxFiadoInstallments(total);
    assert.ok(Math.min(...splitAmount(total, k)) >= 1);
  }
});
t('vencimento mensal no dia 31 cai no último dia do mês', () => {
  assert.deepEqual(dueDates(new Date(2026, 0, 31), 3, 30).map(iso), ['2026-01-31', '2026-02-28', '2026-03-31']);
});
t('semanal e quinzenal somam dias', () => {
  assert.deepEqual(dueDates(new Date(2026, 10, 6), 3, 7).map(iso), ['2026-11-06', '2026-11-13', '2026-11-20']);
  assert.deepEqual(dueDates(new Date(2026, 11, 25), 2, 15).map(iso), ['2026-12-25', '2027-01-09']);
});
t('primeiro vencimento padrão', () => {
  const hoje = new Date(2026, 10, 6, 21, 30);
  assert.equal(iso(defaultFirstDue(7, hoje)), '2026-11-13');
  assert.equal(iso(defaultFirstDue(30, hoje)), '2026-12-06');
});

console.log(`\n${n} testes OK`);
