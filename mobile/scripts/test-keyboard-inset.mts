// Testes da conta do teclado. Rodar: node scripts/test-keyboard-inset.mts
import assert from 'node:assert/strict';
import { computeKeyboardInset, isKeyboardOpen } from '../utils/keyboardInset.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('sem teclado: 0', () => {
  assert.equal(computeKeyboardInset(800, 800, 0, false), 0);
  assert.equal(computeKeyboardInset(800, 770, 0, false), 0);   // barra de endereço do Safari encolhendo: não é teclado
});
t('navegador comum: sobe pela área coberta, sem folga extra', () => {
  assert.equal(computeKeyboardInset(800, 480, 0, false), 320);
});
t('página rolada pelo Safari (offsetTop) não conta como teclado', () => {
  assert.equal(computeKeyboardInset(800, 480, 320, false), 0);
});
t('app instalado: o app já encolhe, nenhuma tela soma o teclado (números medidos no iPhone)', () => {
  assert.equal(computeKeyboardInset(541, 541, 353, true), 0);
  assert.equal(computeKeyboardInset(956, 541, 0, true), 0);   // iOS que não encolhe a janela: o pwa-boot encolhe o app
});
t('teclado aberto pela diferença entre tela e área visível', () => {
  assert.equal(isKeyboardOpen(956, 541), true);
  assert.equal(isKeyboardOpen(956, 956), false);
  assert.equal(isKeyboardOpen(956, 860), false);   // barra do Safari, não teclado
});
console.log(`${n} testes ok`);
