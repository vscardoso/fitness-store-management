// Teste de utils/stockLossNotes.ts: node scripts/test-stock-loss-notes.mts
import assert from 'node:assert/strict';
import { lossProductName, parseStockLoss } from '../utils/stockLossNotes.ts';

// lançamento avulso: texto livre primeiro, depois os dados técnicos (custo vem formatado em reais)
const a = parseStockLoss('Caiu da arara | Produto ID: 12 | SKU: LEG-PT-P | Quantidade perdida: 2 | Custo unitário: R$ 45,00');
assert.equal(a.observation, 'Caiu da arara');
assert.equal(a.quantity, '2');
assert.equal(a.unitCost, 'R$ 45,00');
assert.equal(a.sku, 'LEG-PT-P');
assert.equal(a.productId, '12');
console.log('ok avulso: observação separada dos dados técnicos');

// sem texto livre: não inventa observação
const b = parseStockLoss('Produto ID: 3 | Quantidade perdida: 1 | Custo unitário: R$ 10,00');
assert.equal(b.observation, null);
console.log('ok sem observação');

// vindo de envio condicional, custo numérico e observação com a chave
const c = parseStockLoss('Cliente: Ana | Item do envio: Top Azul M | Quantidade perdida: 1 | Custo unitário: 32.5 | Observações: não voltou');
assert.equal(c.customer, 'Ana');
assert.equal(c.shipmentItem, 'Top Azul M');
assert.equal(c.unitCost, 32.5);
assert.equal(c.observation, 'não voltou');
console.log('ok envio condicional');

// vazio
const d = parseStockLoss(null);
assert.deepEqual(d, { customer: null, shipmentItem: null, quantity: null, unitCost: null, productId: null, sku: null, observation: null });
console.log('ok vazio');

assert.equal(lossProductName('Prejuízo - Legging Preta'), 'Legging Preta');
assert.equal(lossProductName('Legging Preta'), 'Legging Preta');
console.log('ok nome do produto');
console.log('5 testes passaram');
