// Testes do desconto por peça (conta em centavos). Rodar: node scripts/test-item-discount.mts
import assert from 'node:assert/strict';
import {
  discountFromInput, lineDiscount, lineNet, parseTypedNumber, percentLabel, percentOf, unitNet,
} from '../utils/itemDiscount.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('lê o que a pessoa digita: vírgula, ponto de milhar, R$ e %', () => {
  assert.equal(parseTypedNumber('15'), 15);
  assert.equal(parseTypedNumber('12,5'), 12.5);
  assert.equal(parseTypedNumber('12.5'), 12.5);
  assert.equal(parseTypedNumber('1.234,50'), 1234.5);
  assert.equal(parseTypedNumber('R$ 10,00'), 10);
  assert.equal(parseTypedNumber(' 30 % '), 30);
  for (const bad of ['', '  ', 'abc', '-5', '1,2,3', '10x', '--']) assert.equal(parseTypedNumber(bad), null, bad);
});

t('porcentagem: cada valor que a pessoa digita vale (sem número pronto)', () => {
  for (const [pct, price, net] of [[10, 100, 90], [30, 100, 70], [50, 100, 50], [17, 129.9, 107.82], [12.5, 80, 70], [1, 59.9, 59.3], [99, 100, 1]] as const) {
    const r = discountFromInput('percent', String(pct), price);
    assert.ok(r.ok, `${pct}%`);
    if (r.ok) assert.equal(unitNet(price, r.unitDiscount), net, `${pct}% de ${price}`);
  }
});

t('preço com desconto é arredondado por peça e a linha é desconto x quantidade (nada de centavo perdido)', () => {
  // R$ 99,90 com 33%: 66,933 -> 66,93 por peça; desconto 32,97 por peça
  const r = discountFromInput('percent', '33', 99.9);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.unitDiscount, 32.97);
  assert.equal(lineDiscount(r.unitDiscount, 3), 98.91);
  assert.equal(lineNet(99.9, 3, r.unitDiscount), 200.79);      // 3 x 66,93
  assert.equal(r.percent, 33);
});

t('valor em R$ por peça', () => {
  const r = discountFromInput('value', '20,50', 120);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.unitDiscount, 20.5);
  assert.equal(lineDiscount(r.unitDiscount, 4), 82);
  assert.equal(percentOf(20.5, 120), 17.1);
});

t('recusa: vazio, zero, maior que a peça e peça de graça', () => {
  for (const [kind, raw] of [['percent', ''], ['percent', '0'], ['percent', 'x'], ['value', '0'], ['value', '-3']] as const) {
    assert.equal(discountFromInput(kind, raw, 100).ok, false, `${kind} ${raw}`);
  }
  const maior = discountFromInput('value', '150', 100);
  assert.equal(maior.ok, false);
  if (!maior.ok) assert.match(maior.message, /maior que o preço/);
  for (const [kind, raw] of [['percent', '100'], ['value', '100']] as const) {
    const r = discountFromInput(kind, raw, 100);
    assert.equal(r.ok, false, `${kind} ${raw}`);
    if (!r.ok) assert.match(r.message, /Brindes/);
  }
  // valor em reais digitado com o % marcado (caso real da troca de 24/11/2026): a frase manda tocar em R$
  const emReais = discountFromInput('percent', '468,45', 859.9);
  assert.equal(emReais.ok, false);
  if (!emReais.ok) assert.match(emReais.message, /toque em R\$/);
});

t('peça sem preço e desconto menor que 1 centavo', () => {
  assert.equal(discountFromInput('percent', '10', 0).ok, false);
  assert.equal(discountFromInput('percent', '0,01', 0.5).ok, false);   // 0,01% de R$ 0,50 = menos de 1 centavo
});

t('soma da venda da Black Friday: 5 peças, cada uma com um desconto, bate com o servidor', () => {
  // mesmas contas do teste do servidor: linhas (preço 100) com R$ 10, R$ 30 por peça (2 peças), R$ 50 e R$ 20
  const linhas: [number, number, number][] = [[1, 100, 10], [2, 100, 30], [1, 100, 50], [1, 100, 20]];
  const liquido = linhas.reduce((s, [q, p, d]) => s + lineNet(p, q, d), 0);
  const descontos = linhas.reduce((s, [q, , d]) => s + lineDiscount(d, q), 0);
  assert.equal(liquido, 360);
  assert.equal(descontos, 140);
});

t('rótulo de porcentagem', () => {
  assert.equal(percentLabel(30), '30%');
  assert.equal(percentLabel(12.5), '12,5%');
  assert.equal(percentLabel(7.04), '7%');
});

t('com custo (gerente e admin): desconto que leva a peça abaixo do custo é recusado e diz o máximo', () => {
  // peça de R$ 89,90 com custo de R$ 40,00: o máximo é R$ 49,90 por peça (a peça sai por R$ 40,00, no custo)
  const r = discountFromInput('percent', '60', 89.9, 40);        // 60% = R$ 35,96 a peça: abaixo do custo
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.message.includes('abaixo do custo') && r.message.includes('R$ 49,90'), r.message);
  assert.equal(discountFromInput('value', '49,90', 89.9, 40).ok, true);    // no custo ainda vende
  assert.equal(discountFromInput('value', '49,91', 89.9, 40).ok, false);   // um centavo abaixo não
  assert.equal(discountFromInput('percent', '30', 89.9, 40).ok, true);
});
t('sem custo conhecido (vendedor, caixa) a tela não recusa: o servidor decide', () => {
  assert.equal(discountFromInput('percent', '60', 89.9).ok, true);
  assert.equal(discountFromInput('percent', '60', 89.9, 0).ok, true);
});
t('peça que já está no custo não aceita desconto nenhum', () => {
  const r = discountFromInput('value', '1', 40, 40);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.message.includes('já está no custo'), r.message);
});
console.log(`${n} testes passaram`);
