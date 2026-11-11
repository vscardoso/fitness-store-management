// node scripts/test-label-focus.mts
import assert from 'node:assert/strict';
import { decodeLaunched, encodeLaunched, mergeLaunched } from '../utils/labelFocus.ts';

let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok++; console.log('ok', nome); };

t('ida e volta', () => {
  const lines = [{ variantId: 12, quantity: 3 }, { variantId: 15, quantity: 2 }];
  assert.equal(encodeLaunched(lines), '12:3,15:2');
  assert.deepEqual(decodeLaunched('12:3,15:2'), lines);
});
t('soma a mesma variação lançada duas vezes', () => {
  assert.deepEqual(mergeLaunched([{ variantId: 7, quantity: 1 }, { variantId: 7, quantity: 4 }]), [{ variantId: 7, quantity: 5 }]);
});
t('lixo no endereço vira lista vazia, nunca erro', () => {
  assert.deepEqual(decodeLaunched(undefined), []);
  assert.deepEqual(decodeLaunched(''), []);
  assert.deepEqual(decodeLaunched('abc,1:0,-2:3,5:x'), []);
  assert.deepEqual(decodeLaunched(['9:2']), [{ variantId: 9, quantity: 2 }]);
});
console.log(`${ok} testes de etiquetas das peças lançadas passaram`);
