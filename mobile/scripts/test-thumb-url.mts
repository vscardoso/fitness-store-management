// Testes da URL de miniatura. Rodar: node scripts/test-thumb-url.mts
import assert from 'node:assert/strict';
import { thumbUrlFrom } from '../utils/thumbUrl.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const U = 'https://api.provadorfit.com.br/uploads/products/12.jpg';

t('foto do backend ganha ?w= na medida da tela (caixa x densidade, teto de 3x)', () => {
  assert.equal(thumbUrlFrom(U, 52, 1), `${U}?w=52`);
  assert.equal(thumbUrlFrom(U, 52, 2), `${U}?w=104`);
  assert.equal(thumbUrlFrom(U, 52, 3), `${U}?w=156`);
  assert.equal(thumbUrlFrom(U, 52, 4.5), `${U}?w=156`);
  assert.equal(thumbUrlFrom(U, 52, 2.625), `${U}?w=137`);
});
t('densidade absurda ou zero não quebra', () => {
  assert.equal(thumbUrlFrom(U, 40, 0), `${U}?w=40`);
  assert.equal(thumbUrlFrom(U, 40, NaN), `${U}?w=40`);
});
t('vazio, Cloudinary, arquivo local e data: ficam como vieram', () => {
  assert.equal(thumbUrlFrom(undefined, 52, 2), undefined);
  assert.equal(thumbUrlFrom('', 52, 2), '');
  for (const u of ['https://res.cloudinary.com/x/image/upload/v1/a.jpg', 'file:///tmp/a.jpg', 'data:image/png;base64,AAA'])
    assert.equal(thumbUrlFrom(u, 52, 2), u);
});
t('GIF animado e URL que já tem query não são mexidos', () => {
  const g = 'https://api.provadorfit.com.br/uploads/product_media/a.gif';
  assert.equal(thumbUrlFrom(g, 52, 2), g);
  assert.equal(thumbUrlFrom(`${U}?w=800`, 52, 2), `${U}?w=800`);
});
console.log(`${n} testes passaram`);
