// node scripts/test-home-logic.mts
import assert from 'node:assert/strict';
import { todayLine } from '../utils/homeLogic.ts';

let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok++; console.log('ok', nome); };
const money = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => s.replace(/ /g, ' ');

t('sem venda hoje vira convite, não um zero solto', () => {
  assert.equal(todayLine(0, 0, money), 'Hoje: nenhuma venda ainda');
});
t('1 venda no singular, várias no plural', () => {
  assert.equal(norm(todayLine(80, 1, money)), 'Hoje: R$ 80,00 em 1 venda');
  assert.equal(norm(todayLine(1234.5, 3, money)), 'Hoje: R$ 1.234,50 em 3 vendas');
});
t('contagem inválida não quebra', () => {
  assert.equal(todayLine(10, NaN as any, money), 'Hoje: nenhuma venda ainda');
});

console.log(`${ok} testes de regras da Home passaram`);
