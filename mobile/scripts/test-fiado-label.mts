// Testes dos textos que ligam o Fiado do relatório de vendas à tela Fiado. Rodar: node scripts/test-fiado-label.mts
import assert from 'node:assert/strict';
import { FIADO_REPORT_NOTE, fiadoSituationText, fiadoSplitText } from '../utils/fiadoLabel.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const plain = (s: string | null) => (s === null ? null : s.replace(/ /g, ' '));   // o texto usa espaço que não quebra

t('caso real de 19/11: vendido 4.307,13 = 50,00 recebido + 94,90 devolvido + 4.162,23 que falta', () => {
  assert.equal(plain(fiadoSituationText({ received: 50, returned: 94.9, open: 4162.23 }, brl)),
    'Já recebido R$ 50,00 · Devolvido R$ 94,90 · Falta receber R$ 4162,23');
  assert.equal(Math.round((50 + 94.9 + 4162.23) * 100), 430713);
});
t('só mostra o que existe', () => {
  assert.equal(plain(fiadoSituationText({ received: 0, returned: 0, open: 120 }, brl)), 'Falta receber R$ 120,00');
  assert.equal(plain(fiadoSituationText({ received: 30, returned: 0, open: 90 }, brl)), 'Já recebido R$ 30,00 · Falta receber R$ 90,00');
  assert.equal(plain(fiadoSituationText({ received: 0, returned: 40, open: 0 }, brl)), 'Devolvido R$ 40,00 · Nada a receber');
  assert.equal(plain(fiadoSituationText({ received: 100, returned: 0, open: 0 }, brl)), 'Já recebido R$ 100,00 · Nada a receber');
});
t('centavo de arredondamento não vira "falta receber"', () => {
  assert.equal(plain(fiadoSituationText({ received: 100, returned: 0, open: 0.001 }, brl)), 'Já recebido R$ 100,00 · Nada a receber');
});
t('sem a situação (outras formas de pagamento) não mostra nada', () => {
  assert.equal(fiadoSituationText(null, brl), null);
  assert.equal(fiadoSituationText(undefined, brl), null);
});
t('tela Fiado: separa venda e fiado anterior ao app só quando há fiado anterior', () => {
  assert.equal(fiadoSplitText({ open_from_sales: 4162.23, open_from_opening: 1339.4 }, brl), 'Vendas no fiado R$ 4162,23 · Fiado anterior ao app R$ 1339,40');
  assert.equal(fiadoSplitText({ open_from_sales: 500, open_from_opening: 0 }, brl), null);
  assert.equal(fiadoSplitText(undefined, brl), null);
  assert.equal(fiadoSplitText({}, brl), null);   // servidor antigo, sem os campos novos
});
t('trechos não quebram no meio: só entre um e outro', () => {
  const x = fiadoSituationText({ received: 20, returned: 59.9, open: 99.8 }, brl)!;
  assert.ok(x.split(' · ').every((part) => !part.includes(' ')), 'cada trecho tem só espaço que não quebra');
  assert.equal(x.split(' · ').length, 3);
});
t('a nota do relatório diz o que o valor é e onde ver o que falta', () => {
  assert.ok(FIADO_REPORT_NOTE.includes('vendido no período'));
  assert.ok(FIADO_REPORT_NOTE.includes('tela Fiado'));
});
console.log(`${n} testes ok`);
