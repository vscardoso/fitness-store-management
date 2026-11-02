// Testes da altura coberta pelo teclado. Rodar: node scripts/test-keyboard-inset.mts
import assert from 'node:assert/strict';
import { computeKeyboardInset, IOS_ACCESSORY_BAR } from '../utils/keyboardInset.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('sem teclado: 0', () => {
  assert.equal(computeKeyboardInset(800, 800, 0, true), 0);
  assert.equal(computeKeyboardInset(800, 770, 0, true), 0);   // barra de endereço do Safari encolhendo: não é teclado
});
t('iPhone: teclado + barra de campos', () => {
  assert.equal(computeKeyboardInset(800, 480, 0, true), 320 + IOS_ACCESSORY_BAR);
});
t('fora do iPhone: só o teclado', () => {
  assert.equal(computeKeyboardInset(800, 480, 0, false), 320);
});
t('página rolada pelo Safari (offsetTop) não conta como teclado', () => {
  assert.equal(computeKeyboardInset(800, 480, 320, true), 0);
});
console.log(`${n} testes ok`);
