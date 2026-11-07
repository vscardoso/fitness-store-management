// node scripts/test-sale-refund.mts
import assert from 'node:assert/strict';
import { saleRefundView } from '../utils/saleRefund.ts';

const f = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',');
let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok++; console.log('ok', nome); };

t('venda comum: valor positivo, sem selo', () => {
  assert.deepEqual(saleRefundView({ status: 'completed', total_amount: 59.8 }, f), { kind: 'normal', amount: 59.8, negative: false, tag: null, sub: null });
});
t('devolução PARCIAL mostra o total positivo e o estornado à parte (caso real: venda R$ 59,80, estorno R$ 39,89)', () => {
  const v = saleRefundView({ status: 'partially_refunded', total_amount: 59.8, refunded_amount: 39.89 }, f);
  assert.equal(v.kind, 'partial'); assert.equal(v.negative, false); assert.equal(v.amount, 59.8);
  assert.equal(v.tag, 'Estorno parcial'); assert.equal(v.sub, 'estornado −R$ 39,89 · líquido R$ 19,91');
});
t('devolvida por inteiro: negativo do que foi devolvido', () => {
  const v = saleRefundView({ status: 'refunded', total_amount: 100, refunded_amount: 100 }, f);
  assert.equal(v.negative, true); assert.equal(v.amount, 100); assert.equal(v.tag, 'Estorno total');
});
t('devolvida por inteiro sem o campo (servidor antigo): cai no total', () => {
  assert.equal(saleRefundView({ status: 'refunded', total_amount: 80 }, f).amount, 80);
});
t('cancelada: negativa, selo Cancelada', () => {
  const v = saleRefundView({ status: 'cancelled', total_amount: 50 }, f);
  assert.equal(v.negative, true); assert.equal(v.tag, 'Cancelada');
});
t('parcial sem valor devolvido (servidor antigo): não inventa texto', () => {
  assert.equal(saleRefundView({ status: 'partially_refunded', total_amount: 59.8 }, f).sub, null);
});
t('líquido nunca fica negativo', () => {
  assert.ok(saleRefundView({ status: 'partially_refunded', total_amount: 10, refunded_amount: 12 }, f).sub!.includes('líquido R$ 0,00'));
});
console.log(`${ok} testes OK`);
