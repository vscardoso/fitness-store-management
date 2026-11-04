// Testes de data DD/MM/AAAA e data sem hora. Rodar: node scripts/test-date-br.mts
import assert from 'node:assert/strict';
import { brToIso, dateToIso, maskDate, todayBr } from '../utils/dateBr.ts';
import { formatDateOnly } from '../utils/dateOnly.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('DD/MM/AAAA vira ISO e data que não existe vira vazio', () => {
  assert.equal(brToIso('02/11/2026'), '2026-11-02');
  assert.equal(brToIso('29/02/2028'), '2028-02-29');
  assert.equal(brToIso('29/02/2026'), '');
  assert.equal(brToIso('31/04/2026'), '');
  assert.equal(brToIso('15/13/2026'), '');
  assert.equal(brToIso('2/11/2026'), '');
  assert.equal(brToIso(''), '');
});
t('máscara digitada', () => {
  assert.equal(maskDate('0'), '0');
  assert.equal(maskDate('021'), '02/1');
  assert.equal(maskDate('02112026'), '02/11/2026');
  assert.equal(maskDate('02/11/20269999'), '02/11/2026');
  assert.equal(maskDate('ab02cd11'), '02/11');
});
t('hoje no formato BR', () => {
  assert.equal(todayBr(new Date(2026, 10, 2)), '02/11/2026');
  assert.equal(todayBr(new Date(2026, 0, 9)), '09/01/2026');
});
t('data sem hora não volta um dia (bug do 01/11)', () => {
  assert.equal(formatDateOnly('2026-11-02'), '02/11/2026');
  assert.equal(formatDateOnly('2026-01-01'), '01/01/2026');
  assert.equal(formatDateOnly('2026-11-02T00:00:00Z'), null);   // com hora segue o caminho antigo
  assert.equal(formatDateOnly('lixo'), null);
});
t('dia local não pula para amanhã à noite (despesa das 23h)', () => {
  assert.equal(dateToIso(new Date(2026, 10, 4, 23, 30)), '2026-11-04');
  assert.equal(dateToIso(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});
console.log(`${n} testes ok`);
