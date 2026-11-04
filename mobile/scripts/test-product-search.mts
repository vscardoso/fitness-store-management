// Busca de produtos por código (#054, 054, 54, #054-1), SKU, nome, cor e tamanho. Rodar: node scripts/test-product-search.mts
import assert from 'node:assert/strict';
import { matchesProduct, productCode } from '../utils/productSearch.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

const p = {
  name: 'Agasalho Com Dedinho', brand: 'Genérico',
  variants: [
    { sku: 'AGA-PRE-M', color: 'Preto', size: 'M', display_code: '#054-1', product_code: 54 },
    { sku: 'AGA-BEG-G', color: 'Bege', size: 'G', display_code: '#054-2', product_code: 54 },
  ],
};
const outro = { name: 'Bermuda Ciclista', brand: 'Genérico', variants: [{ sku: 'BER-540', size: '38', display_code: '#540-1' }] };

t('código do produto como na etiqueta', () => assert.equal(productCode(p), '#054'));
t('#054, 054, 54 e #54 acham o produto 54', () => {
  for (const q of ['#054', '054', '54', '#54', ' #054 ']) assert.ok(matchesProduct(p, q), q);
});
t('código da peça acha o produto: #054-1, 054-2, 54-1', () => {
  for (const q of ['#054-1', '054-2', '54-1']) assert.ok(matchesProduct(p, q), q);
  assert.equal(matchesProduct(p, '#054-9'), false);
});
t('#054 não acha o produto 540', () => assert.equal(matchesProduct(outro, '#054'), false));
t('número sem # também procura no resto (tamanho 38, SKU BER-540)', () => {
  assert.ok(matchesProduct(outro, '38'));
  assert.ok(matchesProduct(outro, 'ber-540'));
});
t('nome sem acento, cor e várias palavras', () => {
  assert.ok(matchesProduct(p, 'agasalho preto'));
  assert.ok(matchesProduct(p, 'GENERICO'));
  assert.equal(matchesProduct(p, 'agasalho azul'), false);
});
t('busca vazia mostra tudo', () => assert.ok(matchesProduct(p, '   ')));
console.log(`${n} testes ok`);
