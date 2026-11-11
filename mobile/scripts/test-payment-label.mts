// Testes do nome da forma de pagamento. Rodar: node scripts/test-payment-label.mts
import assert from 'node:assert/strict';
import { PAYMENT_LABEL, paymentText } from '../utils/paymentLabel.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('Fiado aparece como Fiado (a venda #7D2 mostrava "-")', () => {
  assert.equal(paymentText({ payment_method: 'on_account', payments: [{ payment_method: 'on_account' }] }), 'Fiado');
  assert.equal(paymentText({ payment_method: 'ON_ACCOUNT' }), 'Fiado');
});
t('pagamento em dois meios mostra os dois', () => {
  assert.equal(paymentText({ payment_method: 'pix', payments: [{ payment_method: 'cash' }, { payment_method: 'pix' }] }), 'Dinheiro + PIX');
  assert.equal(paymentText({ payments: [{ method: 'cash' }, { method: 'cash' }] }), 'Dinheiro');
});
t('sem lista de pagamentos usa a forma principal', () => {
  assert.equal(paymentText({ payment_method: 'credit_card' }), 'Crédito');
});
t('toda forma do sistema tem nome', () => {
  for (const m of ['cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'installments', 'on_account', 'loyalty_points']) assert.ok(PAYMENT_LABEL[m], m);
});
console.log(`${n} testes passaram`);
