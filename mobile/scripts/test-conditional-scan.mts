// Testes da leitura de etiqueta no envio condicional. Rodar: node scripts/test-conditional-scan.mts
import assert from 'node:assert/strict';
import { addScannedPiece, keepTheRest, markReturnedPiece } from '../utils/conditionalScan.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

const variant = (o: Record<string, unknown> = {}) => ({
  id: 11, sku: 'A-P', size: 'P', color: 'Preto', price: 99.9, current_stock: 2, short_code: null, display_code: '#10-1', ...o,
}) as any;
const found = (o: Record<string, unknown> = {}, v: Record<string, unknown> = {}, siblings?: any[]) => {
  const vv = variant(v);
  return {
    match: 'label', variant: vv, siblings: siblings ?? [vv], product_stock: 2,
    product: { id: 1, name: 'Legging', brand: null, image_url: null, category_id: null, category_name: null, base_price: 99.9 },
    ...o,
  } as any;
};

t('montar: 1ª leitura entra com 1, a 2ª soma, a 3ª passa do estoque e é recusada', () => {
  let r = addScannedPiece([], found());
  assert.equal(r.outcome.kind, 'ok');
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].quantity_sent, 1);
  assert.equal(r.list[0].variant_id, 11);
  assert.equal(r.list[0].price, 99.9);
  r = addScannedPiece(r.list, found());
  assert.equal(r.list[0].quantity_sent, 2);
  const before = r.list;
  r = addScannedPiece(r.list, found());
  assert.equal(r.outcome.kind, 'warn');
  assert.equal(r.list, before);
  assert.equal(r.list[0].quantity_sent, 2);
});
t('montar: sem estoque não entra', () => {
  const r = addScannedPiece([], found({}, { current_stock: 0 }));
  assert.equal(r.outcome.kind, 'warn');
  assert.equal(r.list.length, 0);
});
t('montar: outra variação do mesmo produto vira outra linha', () => {
  let r = addScannedPiece([], found());
  r = addScannedPiece(r.list, found({}, { id: 12, size: 'M' }));
  assert.equal(r.list.length, 2);
});
t('montar: número sozinho de produto com várias variações pede a etiqueta', () => {
  const r = addScannedPiece([], found({ match: 'product' }, {}, [variant(), variant({ id: 12 })]));
  assert.equal(r.outcome.kind, 'warn');
  assert.equal(r.list.length, 0);
});
t('montar: número sozinho de produto com uma variação entra', () => {
  const r = addScannedPiece([], found({ match: 'product' }));
  assert.equal(r.outcome.kind, 'ok');
  assert.equal(r.list.length, 1);
});

const items = [
  { id: 100, product_id: 1, variant_id: 11, quantity_sent: 2 },
  { id: 101, product_id: 1, variant_id: 12, quantity_sent: 1 },
];
const empty = () => ({ quantity_kept: 0, quantity_returned: 0, quantity_damaged: 0, quantity_lost: 0 });

t('receber: cada leitura soma 1 devolvida no item da cor/tamanho', () => {
  const drafts: any = { 100: empty(), 101: empty() };
  let r = markReturnedPiece(items, drafts, found());
  assert.equal(r.itemId, 100);
  assert.deepEqual(r.updates, { quantity_returned: 1 });
  drafts[100] = { ...drafts[100], ...r.updates };
  r = markReturnedPiece(items, drafts, found());
  assert.deepEqual(r.updates, { quantity_returned: 2 });
  drafts[100] = { ...drafts[100], ...r.updates };
  r = markReturnedPiece(items, drafts, found());
  assert.equal(r.itemId, null);
  assert.equal(r.outcome.kind, 'warn');
});
t('receber: peça marcada como comprada que aparece na leitura passa a devolvida', () => {
  const drafts: any = { 100: { ...empty(), quantity_kept: 2 }, 101: empty() };
  const r = markReturnedPiece(items, drafts, found());
  assert.equal(r.itemId, 100);
  assert.deepEqual(r.updates, { quantity_kept: 1, quantity_returned: 1 });
});
t('receber: peça que não está no envio é erro', () => {
  const r = markReturnedPiece(items, { 100: empty(), 101: empty() } as any, found({}, { id: 99 }));
  assert.equal(r.itemId, null);
  assert.equal(r.outcome.kind, 'error');
});
t('receber: número sozinho só vale se uma variação do produto foi enviada', () => {
  const multi = found({ match: 'product' }, {}, [variant(), variant({ id: 12 })]);
  assert.equal(markReturnedPiece(items, { 100: empty(), 101: empty() } as any, multi).itemId, null);
  const one = [{ id: 100, product_id: 1, variant_id: 12, quantity_sent: 1 }];
  const r = markReturnedPiece(one, { 100: empty() } as any, multi);
  assert.equal(r.itemId, 100);
});
t('o resto ela ficou: só o que falta vira comprado, nada passa do enviado', () => {
  const drafts: any = { 100: { ...empty(), quantity_returned: 1 }, 101: { ...empty(), quantity_returned: 1 } };
  assert.deepEqual(keepTheRest(items, drafts), [{ itemId: 100, quantity_kept: 1 }]);
  assert.deepEqual(keepTheRest(items, {}), [{ itemId: 100, quantity_kept: 2 }, { itemId: 101, quantity_kept: 1 }]);
});

console.log(`\n${n} testes OK`);
