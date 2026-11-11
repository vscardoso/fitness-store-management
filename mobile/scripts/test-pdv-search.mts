// Testes da busca de produto no PDV. Rodar: node scripts/test-pdv-search.mts
import assert from 'node:assert/strict';
import { filterProductsBySearch } from '../utils/searchMatch.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

const produtos = [
  { name: 'Conjunto Meia Fitness', brand: 'Lupo', variants: [
    { sku: 'CM-P', size: 'P', color: 'Preto', display_code: '#010-1' }, { sku: 'CM-M', size: 'M', color: 'Preto', display_code: '#010-2' },
    { sku: 'CM-MR', size: 'M', color: 'Rosa', display_code: '#010-3' }] },
  { name: 'Conjunto Alô Poliamida', variants: [{ sku: 'CA-M', size: 'M', color: 'Azul', display_code: '#011-1' }] },
  { name: 'Camiseta Dry Fit', variants: [{ sku: 'CT-G', size: 'G', color: 'Preto', display_code: '#012-1' }] },
  { name: 'Tênis New Balance', variants: [{ sku: 'NB-38', size: '38', color: 'Branco', display_code: '#013-1' }] },
];
const nomes = (q: string) => filterProductsBySearch(produtos, q).map((p) => p.name);

t('"conjunto M de meia" acha o conjunto de meia (o "de" não atrapalha) só nas variações M', () => {
  const r = filterProductsBySearch(produtos, 'conjunto M de meia');
  assert.deepEqual(r.map((p) => p.name), ['Conjunto Meia Fitness']);
  assert.deepEqual(r[0].variants.map((v) => v.sku), ['CM-M', 'CM-MR']);
});
t('tamanho e cor juntos afinam as variações', () => {
  const r = filterProductsBySearch(produtos, 'conjunto meia M rosa');
  assert.deepEqual(r[0].variants.map((v) => v.sku), ['CM-MR']);
});
t('só "conjunto" acha os dois conjuntos com todas as variações', () => {
  assert.deepEqual(nomes('conjunto'), ['Conjunto Meia Fitness', 'Conjunto Alô Poliamida']);
  assert.equal(filterProductsBySearch(produtos, 'conjunto')[0].variants.length, 3);
});
t('sem acento e sem diferenciar maiúscula', () => {
  assert.deepEqual(nomes('ALO poliamida'), ['Conjunto Alô Poliamida']);
  assert.deepEqual(nomes('tenis'), ['Tênis New Balance']);
});
t('código da etiqueta e SKU', () => {
  assert.deepEqual(nomes('#010-2'), ['Conjunto Meia Fitness']);
  assert.deepEqual(nomes('010-2').length, 1);
  assert.deepEqual(nomes('ct-g'), ['Camiseta Dry Fit']);
});
t('marca e número do tênis', () => {
  assert.deepEqual(nomes('lupo'), ['Conjunto Meia Fitness']);
  assert.deepEqual(nomes('tenis 38'), ['Tênis New Balance']);
});
t('palavra que não existe não acha nada; vazio devolve tudo', () => {
  assert.deepEqual(nomes('xyz'), []);
  assert.equal(filterProductsBySearch(produtos, '  ').length, 4);
});
t('só ligação digitada ("de") ainda filtra pelo que foi digitado', () => {
  assert.deepEqual(nomes('de'), []);
});
console.log(`${n} testes passaram`);
