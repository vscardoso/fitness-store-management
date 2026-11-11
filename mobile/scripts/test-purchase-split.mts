// Testes da compra paga com Gaveta + banco. Rodar: node scripts/test-purchase-split.mts
import assert from 'node:assert/strict';
import { splitPurchase } from '../utils/purchaseSplit.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('a gaveta paga tudo o que tem e o banco paga o resto', () => {
  assert.deepEqual(splitPurchase(7963, 750, 8646.8), { cash: 750, bank: 7213, cashLeft: 0, bankLeft: 1433.8 });
});
t('compra menor que a gaveta sai toda da gaveta', () => {
  assert.deepEqual(splitPurchase(100, 150, 1000), { cash: 100, bank: 0, cashLeft: 50, bankLeft: 1000 });
});
t('gaveta zerada ou negativa: tudo do banco, a gaveta nunca "paga" valor negativo', () => {
  assert.deepEqual(splitPurchase(200, 0, 1000), { cash: 0, bank: 200, cashLeft: 0, bankLeft: 800 });
  assert.deepEqual(splitPurchase(200, -30, 1000), { cash: 0, bank: 200, cashLeft: -30, bankLeft: 800 });
});
t('centavos exatos (sem 0.1 + 0.2)', () => {
  const s = splitPurchase(100.1, 0.3, 50);
  assert.equal(s.cash + s.bank, 100.1);
  assert.equal(s.cash, 0.3);
  assert.equal(s.bank, 99.8);
});
t('a soma das duas partes sempre e o valor da compra', () => {
  for (const [a, c] of [[1, 0.5], [333.33, 111.11], [0, 50], [999.99, 1000]] as const) {
    const s = splitPurchase(a, c, 5000);
    assert.equal(Math.round((s.cash + s.bank) * 100), Math.round(a * 100));
  }
});
console.log(`${n} testes passaram`);
