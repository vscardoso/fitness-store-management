// Filtros sugeridos da lista de Vendas (node scripts/test-sales-filters.mts)
import assert from 'node:assert/strict';
import { FLAG_CHIPS, NO_FLAGS, flagsToParams, hasFlags, isChipOn, toggleChip } from '../utils/salesFilters.ts';

let passed = 0;
function t(name: string, fn: () => void) { fn(); passed++; console.log('ok', name); }
const chip = (id: string) => FLAG_CHIPS.find((c) => c.id === id)!;

t('sem filtro: nada ligado e nenhum parâmetro vai ao servidor', () => {
  assert.equal(hasFlags(NO_FLAGS), false);
  assert.deepEqual(flagsToParams(NO_FLAGS), {});
  assert.ok(FLAG_CHIPS.every((c) => !isChipOn(NO_FLAGS, c)));
});
t('fiado tem um estado só: tocar em outro troca, tocar no mesmo desliga', () => {
  let f = toggleChip(NO_FLAGS, chip('fiado-overdue'));
  assert.deepEqual(flagsToParams(f), { fiado: 'overdue' });
  f = toggleChip(f, chip('fiado-paid'));
  assert.deepEqual(flagsToParams(f), { fiado: 'paid' });
  assert.equal(isChipOn(f, chip('fiado-overdue')), false);
  f = toggleChip(f, chip('fiado-paid'));
  assert.equal(hasFlags(f), false);
});
t('forma de pagamento é uma só, e desligar uma não mexe nas outras', () => {
  let f = toggleChip(NO_FLAGS, chip('pay-pix'));
  f = toggleChip(f, chip('refunded'));
  f = toggleChip(f, chip('pay-card'));
  assert.deepEqual(flagsToParams(f), { payment: 'card', refunded: true });
  f = toggleChip(f, chip('pay-card'));
  assert.deepEqual(flagsToParams(f), { refunded: true });
});
t('devolvidas e sem cliente combinam com fiado e pagamento', () => {
  let f = NO_FLAGS;
  for (const id of ['fiado-open', 'pay-pix', 'refunded', 'no-customer']) f = toggleChip(f, chip(id));
  assert.deepEqual(flagsToParams(f), { fiado: 'open', payment: 'pix', refunded: true, no_customer: true });
  assert.equal(hasFlags(f), true);
});
t('cada chip tem nome, ícone e id únicos (nome em português, sem termo técnico)', () => {
  assert.equal(new Set(FLAG_CHIPS.map((c) => c.id)).size, FLAG_CHIPS.length);
  assert.ok(FLAG_CHIPS.every((c) => c.label && c.icon && !/on_account|refunded|overdue/.test(c.label)));
});
console.log(`${passed} testes passaram`);
