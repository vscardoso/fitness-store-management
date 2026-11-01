// Testes da regra "peça já está nesta entrada". Rodar: node scripts/test-entry-line.mts
import assert from 'node:assert/strict';
import {
  findExistingLine, sumBlockReason, summedQuantity,
} from '../utils/entryLine.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

const line = (o: Record<string, unknown> = {}) => ({
  id: 7, is_active: true, product_id: 1, variant_id: 11, quantity_received: 5, quantity_sold: 0,
  unit_cost: 40, supplier_name: 'Fornecedor A', list_unit_cost: 60, ...o,
}) as any;
const input = (o: Record<string, unknown> = {}) => ({
  qty: 3, cost: 40, listPrice: 60, supplierName: 'Fornecedor A', entrySupplierName: null, ...o,
}) as any;

t('acha a linha pela variação; outra variação, outro produto e linha inativa não casam', () => {
  const items = [line(), line({ id: 8, variant_id: 12 }), line({ id: 9, product_id: 2 }), line({ id: 10, is_active: false })];
  assert.equal(findExistingLine(items, 1, 11)?.id, 7);
  assert.equal(findExistingLine(items, 1, 12)?.id, 8);
  assert.equal(findExistingLine(items, 1, 99), undefined);
  assert.equal(findExistingLine([line({ is_active: false })], 1, 11), undefined);
  assert.equal(findExistingLine(undefined, 1, 11), undefined);
});
t('produto sem variação: variant_id nulo e indefinido são a mesma coisa', () => {
  assert.equal(findExistingLine([line({ variant_id: null })], 1, undefined)?.id, 7);
  assert.equal(findExistingLine([line({ variant_id: undefined })], 1, null)?.id, 7);
});
t('mesmo custo, fornecedor e preço cheio: pode somar (motivo vazio)', () => {
  assert.equal(sumBlockReason(line(), input()), '');
});
t('sem linha ou quantidade menor que 1: sem motivo', () => {
  assert.equal(sumBlockReason(undefined, input()), '');
  assert.equal(sumBlockReason(line(), input({ qty: 0 })), '');
  assert.equal(sumBlockReason(line(), input({ qty: NaN })), '');
});
t('linha que já vendeu bloqueia, mesmo com tudo igual', () => {
  assert.match(sumBlockReason(line({ quantity_sold: 1 }), input()), /já vendeu/);
});
t('custo diferente bloqueia e mostra o custo atual; centavos contam', () => {
  assert.match(sumBlockReason(line(), input({ cost: 42 }), (v) => `R$ ${v}`), /mesmo custo.*R\$ 40/);
  assert.match(sumBlockReason(line(), input({ cost: 40.01 })), /mesmo custo/);
  assert.equal(sumBlockReason(line({ unit_cost: '40.00' }), input({ cost: 40 })), '');
});
t('fornecedor diferente bloqueia; vazio na linha vale o da entrada', () => {
  assert.match(sumBlockReason(line(), input({ supplierName: 'B' })), /fornecedor/);
  assert.equal(sumBlockReason(line({ supplier_name: null }), input({ supplierName: null, entrySupplierName: 'E' })), '');
  assert.match(sumBlockReason(line({ supplier_name: null }), input({ supplierName: 'B', entrySupplierName: 'E' })), /fornecedor/);
});
t('preço cheio diferente bloqueia; ausente nos dois lados é igual', () => {
  assert.match(sumBlockReason(line(), input({ listPrice: 70 })), /preço cheio/);
  assert.equal(sumBlockReason(line({ list_unit_cost: null }), input({ listPrice: 0 })), '');
  assert.match(sumBlockReason(line({ list_unit_cost: null }), input({ listPrice: 60 })), /preço cheio/);
});
t('quantidade somada (aceita número em texto, como a API devolve)', () => {
  assert.equal(summedQuantity(line({ quantity_received: 5 }), 3), 8);
  assert.equal(summedQuantity(line({ quantity_received: '5' }), 3), 8);
  assert.equal(summedQuantity(line({ quantity_received: 5 }), NaN), 5);
});
console.log(`${n} testes passaram`);
