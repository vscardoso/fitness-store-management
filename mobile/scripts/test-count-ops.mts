/**
 * Operações de contagem compartilhada (utils/countOps.ts): a mesma lógica da Conferência de estoque e do Conferir recebimento.
 */
import assert from 'node:assert/strict';
import { applyOp, newBatchId, overlayOps, sumCounts, type CountOp } from '../utils/countOps.ts';

let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok += 1; console.log('ok -', nome); };

t('bipar soma 1 e a seta para baixo nunca passa de zero', () => {
  let m = {};
  m = applyOp(m, { variant_id: 1, delta: 1 });
  m = applyOp(m, { variant_id: 1, delta: 1 });
  assert.deepEqual(m, { 1: 2 });
  m = applyOp(m, { variant_id: 1, delta: -1 });
  m = applyOp(m, { variant_id: 1, delta: -1 });
  m = applyOp(m, { variant_id: 1, delta: -1 });
  assert.deepEqual(m, { 1: 0 });
});

t('quantidade digitada troca o valor e limpar volta a peça para não lida', () => {
  let m = applyOp({ 1: 5 }, { variant_id: 1, set: 2 });
  assert.deepEqual(m, { 1: 2 });
  m = applyOp(m, { variant_id: 1, clear: true });
  assert.deepEqual(m, {});
  assert.deepEqual(applyOp({}, { variant_id: 3, set: -4 }), { 3: 0 });
  assert.deepEqual(applyOp({}, { variant_id: 3, set: 99999999 }), { 3: 1_000_000 });
});

t('não altera o mapa recebido', () => {
  const base = Object.freeze({ 1: 1 }) as Record<number, number>;
  const out = applyOp(base, { variant_id: 1, delta: 1 });
  assert.deepEqual(base, { 1: 1 });
  assert.deepEqual(out, { 1: 2 });
});

t('o aparelho mostra o servidor mais o que ainda não foi confirmado', () => {
  const server = { 1: 3, 2: 1 };
  const pending: CountOp[] = [{ variant_id: 1, delta: 1 }, { variant_id: 2, clear: true }, { variant_id: 9, delta: 1 }];
  assert.deepEqual(overlayOps(server, pending), { 1: 4, 9: 1 });
  assert.deepEqual(server, { 1: 3, 2: 1 });
  assert.deepEqual(overlayOps(server, []), server);
});

t('duas pessoas bipando a mesma peça: cada aparelho soma o que o servidor já tem com o seu', () => {
  // o servidor já tem 4 (outras pessoas); este aparelho bipou 2 ainda não enviadas
  assert.deepEqual(overlayOps({ 7: 4 }, [{ variant_id: 7, delta: 1 }, { variant_id: 7, delta: 1 }]), { 7: 6 });
});

t('cada lote tem um identificador diferente', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newBatchId()));
  assert.equal(ids.size, 200);
  assert.ok([...ids].every((i) => i.length >= 8 && i.length <= 64));
});

t('soma de peças', () => assert.equal(sumCounts({ 1: 2, 2: 3 }), 5));

console.log(`\n${ok} testes de contagem OK`);
