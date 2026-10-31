// Teste da busca por início de palavra. Rodar: node mobile/scripts/test-search-match.mts
import assert from 'node:assert/strict';
import { buildSearchIndex, matchesSearch } from '../utils/searchMatch.ts';

let ok = 0;
const t = (nome: string, fn: () => void) => {
  fn();
  ok += 1;
  console.log('ok', nome);
};

const peca = buildSearchIndex(['Blusa Dryfit Tampa Bumbum', 'Preto', 'M', 'Blusa Avulsa'], ['#101-1', 'WA-0165-PRE-M']);
const outra = buildSearchIndex(['Top Poliamida', 'Rosa Chá', 'P', 'Top'], ['#102-3', 'WA-0170-ROS-P']);

t('1 letra já filtra: "b" acha Blusa, não acha Top', () => {
  assert.equal(matchesSearch(peca, 'b'), true);
  assert.equal(matchesSearch(outra, 'b'), false);
});
t('início de palavra, não meio: "ato" não acha Preto', () => assert.equal(matchesSearch(peca, 'eto'), false));
t('sem acento e sem caixa: "cha" acha Chá', () => assert.equal(matchesSearch(outra, 'CHA'), true));
t('várias palavras afinam: "blusa pre" acha, "blusa ros" não', () => {
  assert.equal(matchesSearch(peca, 'blusa pre'), true);
  assert.equal(matchesSearch(peca, 'blusa ros'), false);
});
t('1 número já filtra: "1" acha #101-1 e #102-3 (começam com 1), "101" só o primeiro', () => {
  assert.equal(matchesSearch(peca, '1'), true);
  assert.equal(matchesSearch(outra, '1'), true);
  assert.equal(matchesSearch(outra, '101'), false);
});
t('código com e sem #: "#101", "101", "101-1" acham; "101-2" não', () => {
  assert.equal(matchesSearch(peca, '#101'), true);
  assert.equal(matchesSearch(peca, '101'), true);
  assert.equal(matchesSearch(peca, '101-1'), true);
  assert.equal(matchesSearch(peca, '101-2'), false);
});
t('SKU pelo começo: "wa-0165" e "0165" acham', () => {
  assert.equal(matchesSearch(peca, 'wa-0165'), true);
  assert.equal(matchesSearch(peca, '0165'), true);
  assert.equal(matchesSearch(peca, '0170'), false);
});
t('vazio mostra tudo', () => {
  assert.equal(matchesSearch(peca, ''), true);
  assert.equal(matchesSearch(peca, '   '), true);
});
console.log(`${ok} testes passaram`);
