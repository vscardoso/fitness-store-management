// node scripts/test-sale-refund.mts
import assert from 'node:assert/strict';
import { saleRefundView } from '../utils/saleRefund.ts';

const f = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',');
let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok++; console.log('ok', nome); };

t('venda comum: valor positivo, sem selo', () => {
  assert.deepEqual(saleRefundView({ status: 'completed', total_amount: 59.8 }, f), { kind: 'normal', amount: 59.8, negative: false, tag: null, sub: null });
});
t('devolução PARCIAL mostra o que a loja ficou e conta o resto em palavras (caso real: venda R$ 59,80, devolveu R$ 39,89)', () => {
  const v = saleRefundView({ status: 'partially_refunded', total_amount: 59.8, refunded_amount: 39.89 }, f);
  assert.equal(v.kind, 'partial'); assert.equal(v.negative, false);
  assert.equal(Math.round(v.amount * 100), 1991);                       // R$ 19,91 ficou
  assert.equal(v.tag, 'Devolução parcial'); assert.equal(v.sub, 'Vendeu R$ 59.80 · devolveu R$ 39.89'.replace(/\./g, ',').replace('59,80', '59,80'));
});
t('devolvida por inteiro: a loja ficou com R$ 0,00', () => {
  const v = saleRefundView({ status: 'refunded', total_amount: 100, refunded_amount: 100 }, f);
  assert.equal(v.amount, 0); assert.equal(v.negative, true); assert.equal(v.tag, 'Devolvida');
  assert.equal(v.sub, 'Vendeu R$ 100,00 · devolveu R$ 100,00');
});
t('devolvida por inteiro sem o campo (servidor antigo): usa o total', () => {
  assert.equal(saleRefundView({ status: 'refunded', total_amount: 80 }, f).sub, 'Vendeu R$ 80,00 · devolveu R$ 80,00');
});
t('cancelada: R$ 0,00 e diz que foi cancelada', () => {
  const v = saleRefundView({ status: 'cancelled', total_amount: 50 }, f);
  assert.equal(v.amount, 0); assert.equal(v.tag, 'Cancelada'); assert.equal(v.sub, 'Venda cancelada (era R$ 50,00)');
});
t('parcial sem valor devolvido (servidor antigo): mostra o total e não inventa texto', () => {
  const v = saleRefundView({ status: 'partially_refunded', total_amount: 59.8 }, f);
  assert.equal(v.amount, 59.8); assert.equal(v.sub, null);
});
t('o que a loja ficou nunca fica negativo', () => {
  assert.equal(saleRefundView({ status: 'partially_refunded', total_amount: 10, refunded_amount: 12 }, f).amount, 0);
});
console.log(`${ok} testes OK`);
