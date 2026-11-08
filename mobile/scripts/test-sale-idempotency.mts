// Testes da chave de idempotência da venda. Rodar: node scripts/test-sale-idempotency.mts
import assert from 'node:assert/strict';
import { saleKeyFor, finishSaleKey } from '../utils/saleIdempotency.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const venda = { items: [{ product_id: 1, quantity: 2 }], payments: [{ method: 'cash', amount: 50 }] };

t('mesma venda (duplo clique ou nova tentativa) usa a mesma chave', () => {
  finishSaleKey();
  const a = saleKeyFor(venda);
  assert.equal(saleKeyFor({ ...venda }), a);
  assert.equal(saleKeyFor(JSON.parse(JSON.stringify(venda))), a);
});
t('carrinho mudou: chave nova', () => {
  const a = saleKeyFor(venda);
  assert.notEqual(saleKeyFor({ ...venda, items: [{ product_id: 1, quantity: 3 }] }), a);
});
t('depois do sucesso a próxima venda igual recebe chave nova', () => {
  const a = saleKeyFor(venda);
  finishSaleKey();
  assert.notEqual(saleKeyFor(venda), a);
});
t('chave tem formato de uuid', () => {
  assert.match(saleKeyFor(venda), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
console.log(`${n} testes ok`);
