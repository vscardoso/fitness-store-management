// node scripts/test-home-logic.mts
import assert from 'node:assert/strict';
import { todayLine, shortcutIds, monthLines, monthNameOf, stockPace, paceLabel, paceAdvice, soldUnitsText } from '../utils/homeLogic.ts';

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

t('atalhos: quem gerencia vê Entradas, Financeiro, Etiquetas e Consultar; quem vende não vê dinheiro nem entrada', () => {
  assert.deepEqual(shortcutIds(true), ['entries', 'finance', 'labels', 'consult']);
  assert.deepEqual(shortcutIds(false), ['consult', 'products', 'customers', 'conditional']);
  assert.ok(!shortcutIds(false).includes('finance' as any) && !shortcutIds(false).includes('entries' as any));
});
t('são sempre quatro e sem repetir (cabem numa linha, sem rolar de lado)', () => {
  for (const m of [true, false]) { const l = shortcutIds(m); assert.equal(l.length, 4); assert.equal(new Set(l).size, 4); }
});

t('conta do mês: as linhas somam o "sobrou" (vendeu - custo - gastos - brindes)', () => {
  const r = { revenue: 1000, cmv: 400, total_expenses: 150.5, gifts_total: 20 };
  const l = monthLines(r);
  assert.deepEqual(l.map((x) => x.id), ['revenue', 'cmv', 'expenses', 'gifts']);
  const soma = l.reduce((s, x) => s + x.sign * x.value, 0);
  assert.equal(Math.round(soma * 100), Math.round((1000 - 400 - 150.5 - 20) * 100));
});
t('brinde zerado ou ausente não vira linha (só admin tem; para os outros o servidor já soma nos gastos)', () => {
  assert.equal(monthLines({ revenue: 10, cmv: 4, total_expenses: 1, gifts_total: 0 }).length, 3);
  assert.equal(monthLines({ revenue: 10, cmv: 4, total_expenses: 1, gifts_total: null }).length, 3);
  assert.equal(monthLines({ revenue: 10, cmv: 4, total_expenses: 1 }).length, 3);
});
t('valor que vem como texto do servidor é lido como número', () => {
  const l = monthLines({ revenue: '419.60' as any, cmv: '134.50' as any, total_expenses: '0.00' as any });
  assert.equal(l[0].value, 419.6);
});
t('nome do mês em português e minúsculo', () => {
  assert.equal(monthNameOf(new Date(2026, 10, 12)), 'novembro');
  assert.equal(monthNameOf(new Date(2026, 2, 3)), 'março');
});

t('giro com poucas vendas não vira "crítico" nem manda fazer promoção agressiva', () => {
  assert.equal(stockPace(12, 47), 'critical');
  assert.equal(stockPace(0.8, 3), 'few');
  assert.equal(stockPace(0, 0), 'few');
  assert.equal(paceLabel('few'), 'Poucas vendas');
  assert.ok(!/agressiv|cr[ií]tic/i.test(paceAdvice('few') + paceAdvice('critical') + paceLabel('critical')));
});
t('giro com vendas suficientes segue as faixas 70 e 40', () => {
  assert.equal(stockPace(80, 100), 'excellent');
  assert.equal(stockPace(40, 100), 'moderate');
  assert.equal(stockPace(39.9, 100), 'critical');
  assert.equal(stockPace(90, 9), 'few');
});
t('unidades vendidas no singular e no plural', () => {
  assert.equal(soldUnitsText(1), '1 un vendida');
  assert.equal(soldUnitsText(2), '2 un vendidas');
});

console.log(`${ok} testes de regras da Home passaram`);
