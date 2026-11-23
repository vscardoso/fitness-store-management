// node scripts/test-reconciliation-view.mts
import assert from 'node:assert/strict';
import { buildReconView, reconRowsSum } from '../utils/reconciliationView.ts';

const f = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',');
let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok++; console.log('ok', nome); };

// caso real da tela de 22/11/2026: começou 8.711,80, entrou 12.085,54, saiu 12.166,79, 6 correções (-692,01), contas 7.938,54, sobra sem explicação 299,85
const real: any = {
  started: true, status: 'adjusted', end: '2026-11-22', opening: 8711.80, entered: 12085.54, left: 12166.79, cash_net: 0,
  should_have: 8630.55, have: 7938.54, difference: -692.01, adjustments_total: -692.01, adjustments: [{}, {}, {}, {}, {}, {}],
  bridge: { status: 'unexplained', residual: 299.85 },
};

t('caso real: o título diz o valor sem explicação e a soma das linhas chega no que as contas mostram', () => {
  const v = buildReconView(real, f)!;
  assert.equal(v.status, 'unexplained');
  assert.equal(v.title, 'R$ 299,85 sem explicação');
  assert.equal(reconRowsSum(v.rows), 7938.54);
  assert.equal(v.rows.at(-1)!.value, 7938.54);
  assert.ok(v.rows.some((r) => r.key === 'adjustments' && r.value === -692.01));
  assert.ok(!v.rows.some((r) => r.key === 'other'));            // a diferença toda é correção à mão: não aparece "outras diferenças"
});
t('só correção à mão: título neutro, sem aviso de sobra', () => {
  const v = buildReconView({ ...real, bridge: { status: 'ok', residual: 0 } }, f)!;
  assert.equal(v.status, 'adjusted'); assert.equal(v.hint, null); assert.equal(v.tone, 'warn');
});
t('tudo bate: sem linha de correção e título de que bate', () => {
  const v = buildReconView({ ...real, have: 8630.55, difference: 0, adjustments_total: 0, adjustments: [], bridge: { status: 'ok', residual: 0 } }, f)!;
  assert.equal(v.status, 'ok'); assert.equal(v.tone, 'ok'); assert.equal(v.title, 'O dinheiro do mês bate');
  assert.ok(!v.rows.some((r) => r.key === 'adjustments'));
  assert.equal(reconRowsSum(v.rows), 8630.55);
});
t('diferença que não é correção à mão aparece como "outras diferenças" e a conta ainda fecha', () => {
  const v = buildReconView({ ...real, difference: -700.01, have: 7930.54, bridge: { status: 'ok', residual: 0 } }, f)!;
  const other = v.rows.find((r) => r.key === 'other')!;
  assert.equal(other.value, -8);
  assert.equal(reconRowsSum(v.rows), 7930.54);
});
t('caixa entra como linha e a conta fecha; zero não aparece', () => {
  const v = buildReconView({ ...real, cash_net: -100, should_have: 8530.55, have: 7838.54, difference: -692.01, bridge: { status: 'ok', residual: 0 } }, f)!;
  assert.ok(v.rows.some((r) => r.key === 'cash' && r.value === -100));
  assert.equal(reconRowsSum(v.rows), 7838.54);
});
t('mês sem dados ou loja sem financeiro: nada para mostrar', () => {
  assert.equal(buildReconView({ started: false } as any, f), null);
  assert.equal(buildReconView({ started: true, status: 'empty' } as any, f), null);
});
console.log(`${ok} testes ok`);
