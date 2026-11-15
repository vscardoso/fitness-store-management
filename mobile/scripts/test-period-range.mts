// Testes dos períodos de datas. Rodar: node scripts/test-period-range.mts
import assert from 'node:assert/strict';
import { checkRange, isoToBr, parseBr, rangeFor } from '../utils/periodRange.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const hoje = new Date(2026, 10, 15, 22, 30);   // 15/11/2026 às 22:30 (depois das 21h: o UTC já seria dia 16)

t('atalhos: hoje, ontem, 7 dias contando hoje, 30 dias, este mês', () => {
  assert.deepEqual(rangeFor('today', hoje), { start: '2026-11-15', end: '2026-11-15' });
  assert.deepEqual(rangeFor('yesterday', hoje), { start: '2026-11-14', end: '2026-11-14' });
  assert.deepEqual(rangeFor('last_7_days', hoje), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(rangeFor('last_30_days', hoje), { start: '2026-10-17', end: '2026-11-15' });
  assert.deepEqual(rangeFor('this_month', hoje), { start: '2026-11-01', end: '2026-11-15' });
});
t('virada de mês e de ano', () => {
  assert.deepEqual(rangeFor('yesterday', new Date(2026, 0, 1)), { start: '2025-12-31', end: '2025-12-31' });
  assert.deepEqual(rangeFor('last_7_days', new Date(2026, 2, 3)), { start: '2026-02-25', end: '2026-03-03' });
});
t('data digitada: existe ou vira vazio', () => {
  assert.equal(parseBr('01/11/2026'), '2026-11-01');
  assert.equal(parseBr('29/02/2028'), '2028-02-29');
  assert.equal(parseBr('29/02/2026'), '');
  assert.equal(parseBr('1/11/2026'), '');
  assert.equal(parseBr(''), '');
  assert.equal(isoToBr('2026-11-05'), '05/11/2026');
});
t('período digitado: certo, invertido, no futuro, longo demais', () => {
  assert.deepEqual(checkRange('01/11/2026', '10/11/2026', hoje), { ok: true, start: '2026-11-01', end: '2026-11-10' });
  assert.deepEqual(checkRange('01/11/2026', '30/11/2026', hoje), { ok: true, start: '2026-11-01', end: '2026-11-15' });   // final no futuro vira hoje
  assert.deepEqual(checkRange('15/11/2026', '15/11/2026', hoje), { ok: true, start: '2026-11-15', end: '2026-11-15' });
  assert.equal(checkRange('10/11/2026', '01/11/2026', hoje).ok, false);
  assert.equal(checkRange('20/11/2026', '25/11/2026', hoje).ok, false);
  assert.equal(checkRange('01/01/2025', '15/11/2026', hoje).ok, false);
  assert.equal(checkRange('31/02/2026', '10/11/2026', hoje).ok, false);
  assert.equal(checkRange('01/11/2026', '', hoje).ok, false);
  const longo = checkRange('01/01/2025', '15/11/2026', hoje);
  assert.ok(!longo.ok && /1 ano/.test(longo.error));
});
console.log(`${n} testes passaram`);
