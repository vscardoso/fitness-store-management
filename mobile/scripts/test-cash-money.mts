// Testes dos valores digitados no caixa. Rodar: node scripts/test-cash-money.mts
import assert from 'node:assert/strict';
import { differenceText, moneyInput, parseMoneyBr } from '../utils/cashMoney.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

t('texto digitado vira número', () => {
  assert.equal(parseMoneyBr('100'), 100);
  assert.equal(parseMoneyBr('100,5'), 100.5);
  assert.equal(parseMoneyBr('100,50'), 100.5);
  assert.equal(parseMoneyBr('1.234,56'), 1234.56);
  assert.equal(parseMoneyBr('R$ 12,00'), 12);
  assert.equal(parseMoneyBr('12.50'), 12.5);
  assert.equal(parseMoneyBr('1.500'), 1500);
  assert.equal(parseMoneyBr('0'), 0);
  assert.equal(parseMoneyBr('0,10'), 0.1);
});
t('vazio, lixo, negativo e centavos demais são inválidos', () => {
  for (const bad of ['', '   ', 'abc', '-5', '1,234', '12,3,4', ',', '1..2']) assert.equal(parseMoneyBr(bad), null, bad);
});
t('0,1 + 0,2 não vira 0,30000000000000004', () => {
  assert.equal(parseMoneyBr('0,30'), 0.3);
  assert.equal(parseMoneyBr('19,99'), 19.99);
});
t('máscara enquanto digita', () => {
  assert.equal(moneyInput('1a2b'), '12');
  assert.equal(moneyInput('12,345'), '12,34');
  assert.equal(moneyInput('1,2,3'), '1,23');
  assert.equal(moneyInput('12.5'), '12,5');
  assert.equal(moneyInput('007'), '7');
  assert.equal(moneyInput('0'), '0');
  assert.equal(moneyInput(','), ',');
  assert.equal(moneyInput('R$ 9'), '9');
});
t('diferença do fechamento', () => {
  assert.deepEqual(differenceText(0, brl), { text: 'Bateu certinho', kind: 'ok' });
  assert.deepEqual(differenceText(2.34, brl), { text: 'Sobrou R$ 2,34', kind: 'over' });
  assert.deepEqual(differenceText(-4.5, brl), { text: 'Faltou R$ 4,50', kind: 'short' });
  assert.deepEqual(differenceText(0.004, brl), { text: 'Bateu certinho', kind: 'ok' });
});
console.log(`${n} testes ok`);
