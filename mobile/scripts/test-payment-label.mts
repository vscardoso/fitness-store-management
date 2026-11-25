// Testes do nome da forma de pagamento. Rodar: node scripts/test-payment-label.mts
import assert from 'node:assert/strict';
import { PAYMENT_LABEL, fiadoPaymentText, paymentLine, paymentSummary, paymentText } from '../utils/paymentLabel.ts';

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
t('linha de pagamento: nome, parcelas e valor separados (a venda de 2 meios passava da tela)', () => {
  const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  assert.deepEqual(paymentLine({ method: 'credit_card', amount: 700, installments: 6 }, brl), { label: 'Cartão de crédito', detail: '6x de R$ 116,67', amount: 'R$ 700,00' });
  assert.deepEqual(paymentLine({ method: 'credit_card', amount: 50, installments: 1 }, brl), { label: 'Cartão de crédito', detail: 'à vista', amount: 'R$ 50,00' });
  assert.deepEqual(paymentLine({ method: 'pix', amount: '228.34' }, brl), { label: 'PIX', detail: null, amount: 'R$ 228,34' });
  assert.deepEqual(paymentLine({ payment_method: 'ON_ACCOUNT', amount: 10 }, brl), { label: 'Fiado', detail: null, amount: 'R$ 10,00' });
  assert.equal(paymentLine({ method: 'cash', amount: 5, installments: 6 }, brl).detail, null);   // parcela só vale no crédito
  assert.equal(paymentLine({ amount: 1 }, brl).label, 'Não informado');
});
t('resumo do pagamento no cartão da lista: PIX, cartão, dinheiro, fiado', () => {
  assert.deepEqual(paymentSummary({ payment_method: 'pix', payments: [{ payment_method: 'pix' }] }), { text: 'PIX', kind: 'pix' });
  assert.deepEqual(paymentSummary({ payments: [{ payment_method: 'credit_card', installments: 3 }] }), { text: 'Cartão de crédito · 3x', kind: 'card' });
  assert.deepEqual(paymentSummary({ payments: [{ payment_method: 'credit_card', installments: 1 }] }), { text: 'Cartão de crédito', kind: 'card' });
  assert.deepEqual(paymentSummary({ payments: [{ payment_method: 'debit_card' }] }), { text: 'Cartão de débito', kind: 'card' });
  assert.deepEqual(paymentSummary({ payments: [{ payment_method: 'cash' }] }), { text: 'Dinheiro', kind: 'cash' });
  assert.deepEqual(paymentSummary({ payment_method: 'ON_ACCOUNT', payments: [{ payment_method: 'on_account' }] }), { text: 'Fiado', kind: 'fiado' });
});
t('fiado: o cartão diz se já foi pago, quanto falta ou se venceu (Concluída não quer dizer paga)', () => {
  const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
  assert.deepEqual(fiadoPaymentText('Fiado', 'paid', 0, brl), { text: 'Fiado pago', tone: 'paid' });
  assert.deepEqual(fiadoPaymentText('Fiado', 'open', 60, brl), { text: 'Fiado · falta R$ 60,00', tone: 'open' });
  assert.deepEqual(fiadoPaymentText('Fiado', 'overdue', 100, brl), { text: 'Fiado vencido · falta R$ 100,00', tone: 'overdue' });
  assert.deepEqual(fiadoPaymentText('Dinheiro + Fiado', 'paid', 0, brl), { text: 'Dinheiro + Fiado pago', tone: 'paid' });
  assert.deepEqual(fiadoPaymentText('Fiado', null, null, brl), { text: 'Fiado', tone: null });      // sem parcela ativa: como veio
  assert.deepEqual(fiadoPaymentText('PIX', 'paid', 0, brl), { text: 'PIX', tone: null });           // sem fiado na forma de pagamento
  assert.deepEqual(fiadoPaymentText('', 'paid', 0, brl), { text: '', tone: null });
});
t('resumo com duas formas junta as duas; a mesma forma repetida aparece uma vez', () => {
  assert.deepEqual(paymentSummary({ payments: [{ payment_method: 'cash' }, { payment_method: 'pix' }] }), { text: 'Dinheiro + PIX', kind: 'mixed' });
  assert.deepEqual(paymentSummary({ payments: [{ method: 'pix' }, { method: 'pix' }] }), { text: 'PIX', kind: 'pix' });
});
t('resumo sem lista de pagamentos usa a forma principal; venda sem pagamento fica sem texto', () => {
  assert.deepEqual(paymentSummary({ payment_method: 'credit_card' }), { text: 'Cartão de crédito', kind: 'card' });
  assert.deepEqual(paymentSummary({ payments: [] }), { text: '', kind: null });
  assert.deepEqual(paymentSummary({ payment_method: 'pending' }), { text: '', kind: null });
});
console.log(`${n} testes passaram`);
