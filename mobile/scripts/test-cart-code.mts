// Testes do código mostrado no carrinho. Rodar: node scripts/test-cart-code.mts
import assert from 'node:assert/strict';
import { cartItemCodeText } from '../utils/cartCode.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('mostra o código da etiqueta no lugar do SKU', () => {
  assert.equal(cartItemCodeText({ display_code: '#041-11', sku: 'CAMISE001-PRE-GG-001' }), '#041-11');
});
t('carrinho antigo (sem código) mostra o SKU', () => {
  assert.equal(cartItemCodeText({ sku: 'CAMISE001-PRE-GG-001' }), 'SKU: CAMISE001-PRE-GG-001');
  assert.equal(cartItemCodeText({ display_code: '  ', sku: 'X1' }), 'SKU: X1');
  assert.equal(cartItemCodeText({ display_code: null, sku: 'X1' }), 'SKU: X1');
});
t('sem nada não mostra nada', () => {
  assert.equal(cartItemCodeText({}), '');
  assert.equal(cartItemCodeText(null), '');
});
console.log(`${n} testes passaram`);
