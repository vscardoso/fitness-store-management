// Testes da grade de lançamento na entrada (cores x tamanhos). Rodar: node scripts/test-entry-grid.mts
import assert from 'node:assert/strict';
import { buildCells, cellKey, existingColors, gridSummary, gridText, suggestedSizes, toBatchLines } from '../utils/entryGrid.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

const V = [
  { id: 1, color: 'Rose', size: 'GG', display_code: '#032-1', current_stock: 1 },
  { id: 2, color: 'Azul Tifany', size: 'M', display_code: '#032-2', current_stock: 0 },
];

t('cores do produto sem repetir e sem diferenciar caixa', () => {
  assert.deepEqual(existingColors([...V, { id: 3, color: 'rose', size: 'M' }]), ['Rose', 'Azul Tifany']);
});

t('tamanhos: os do produto mais a grade padrão, em ordem natural', () => {
  assert.deepEqual(suggestedSizes(V), ['P', 'M', 'G', 'GG', 'PP', 'XG'].sort((a, b) => ['PP', 'P', 'M', 'G', 'GG', 'XG'].indexOf(a) - ['PP', 'P', 'M', 'G', 'GG', 'XG'].indexOf(b)));
  assert.deepEqual(suggestedSizes([{ id: 1, color: 'Preto', size: '38' }]).slice(0, 3), ['33', '34', '35']);   // numeração
});

t('combinação que o produto já tem usa a peça existente (mesmo SKU e código); a que não tem é nova', () => {
  const cells = buildCells(V, ['Rose', 'Rosa'], ['GG', 'M'], { [cellKey('Rose', 'GG')]: '2', [cellKey('Rosa', 'M')]: '3' });
  const rose = cells.find((c) => c.key === cellKey('Rose', 'GG'))!;
  assert.equal(rose.variantId, 1);
  assert.equal(rose.code, '#032-1');
  assert.equal(rose.qty, 2);
  const nova = cells.find((c) => c.key === cellKey('Rosa', 'M'))!;
  assert.equal(nova.variantId, null);
  assert.equal(nova.qty, 3);
  assert.equal(cells.length, 4);                       // 2 cores x 2 tamanhos
});

t('cor e tamanho casam sem diferenciar caixa nem espaços', () => {
  const cells = buildCells(V, ['  rose '], ['gg'], { [cellKey('rose', 'GG')]: '1' });
  assert.equal(cells[0].variantId, 1);
  assert.equal(cells[0].qty, 1);
});

t('só as combinações com quantidade vão ao servidor; existente por id, nova por cor e tamanho', () => {
  const cells = buildCells(V, ['Rose', 'Rosa'], ['GG', 'M'], { [cellKey('Rose', 'GG')]: '2', [cellKey('Rosa', 'M')]: '3', [cellKey('Rosa', 'GG')]: '0' });
  assert.deepEqual(toBatchLines(cells, 38, 0), [
    { variant_id: 1, quantity: 2, cost_price: 38 },
    { color: 'Rosa', size: 'M', quantity: 3, cost_price: 38 },
  ]);
  assert.deepEqual(toBatchLines(cells, 38, 45)[0], { variant_id: 1, quantity: 2, cost_price: 38, list_unit_cost: 45 });
});

t('quantidade vazia, zero, negativa ou texto não conta', () => {
  const cells = buildCells(V, ['Rose'], ['GG'], { [cellKey('Rose', 'GG')]: 'abc' });
  assert.equal(cells[0].qty, 0);
  assert.equal(buildCells(V, ['Rose'], ['GG'], { [cellKey('Rose', 'GG')]: '-3' })[0].qty, 0);
  assert.deepEqual(toBatchLines(cells, 10, 0), []);
});

t('resumo e texto: peças, variações e quantas são novas', () => {
  const cells = buildCells(V, ['Rose', 'Rosa'], ['GG', 'M'], { [cellKey('Rose', 'GG')]: '2', [cellKey('Rosa', 'M')]: '3', [cellKey('Rosa', 'GG')]: '1', [cellKey('Rose', 'M')]: '1' });
  const s = gridSummary(cells);
  assert.deepEqual(s, { pieces: 7, lines: 4, created: 3, reused: 1 });
  assert.equal(gridText(s), '7 peças em 4 variações (3 novas)');
  assert.equal(gridText({ pieces: 1, lines: 1, created: 0 }), '1 peça em 1 variação');
  assert.equal(gridText({ pieces: 0, lines: 0, created: 0 }), 'Informe a quantidade de ao menos uma combinação.');
});

t('produto sem cor e sem tamanho: uma combinação só, sem nome', () => {
  const cells = buildCells([{ id: 9, color: null, size: null }], [], [], { [cellKey('', '')]: '4' });
  assert.equal(cells.length, 1);
  assert.equal(cells[0].variantId, 9);
  assert.equal(cells[0].qty, 4);
});

t('produto com cores mas nenhuma escolhida ainda: nada na grade até a pessoa tocar', () => {
  assert.equal(buildCells(V, [], [], {}).length, 0);
  assert.equal(buildCells(V, ['Rose'], [], {}).length, 0);
});

t('mesma cor e tamanho de uma entrada anterior continua sendo a MESMA variação (nada novo)', () => {
  const cells = buildCells(V, ['Azul Tifany'], ['M'], { [cellKey('Azul Tifany', 'M')]: '5' });
  assert.equal(cells[0].variantId, 2);
  assert.equal(gridSummary(cells).created, 0);
});

console.log(`${n} testes ok`);
