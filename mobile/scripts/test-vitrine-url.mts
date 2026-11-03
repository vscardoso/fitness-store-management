// Testes do endereço de vitrine (utils/vitrineUrl.ts). Rodar: node scripts/test-vitrine-url.mts
import assert from 'node:assert/strict';
import { isVitrineHost, parseVitrinePath } from '../utils/vitrineUrl.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('só o endereço loja. é vitrine', () => {
  assert.equal(isVitrineHost('loja.provadorfit.com.br'), true);
  assert.equal(isVitrineHost('loja.localhost'), true);
  assert.equal(isVitrineHost('app.provadorfit.com.br'), false);
  assert.equal(isVitrineHost('provadorfit.com.br'), false);
  assert.equal(isVitrineHost('minhaloja.com.br'), false);
});
t('loja e produto saem do caminho', () => {
  assert.deepEqual(parseVitrinePath('/wa-fitness-1/96'), { slug: 'wa-fitness-1', id: '96' });
  assert.deepEqual(parseVitrinePath('/wa-fitness-1/96/'), { slug: 'wa-fitness-1', id: '96' });
});
t('caminho incompleto ou estranho não vira consulta', () => {
  assert.deepEqual(parseVitrinePath('/'), { slug: null, id: null });
  assert.deepEqual(parseVitrinePath('/wa-fitness-1'), { slug: 'wa-fitness-1', id: null });
  assert.deepEqual(parseVitrinePath('/wa-fitness-1/abc'), { slug: 'wa-fitness-1', id: null });
  assert.deepEqual(parseVitrinePath('/../etc/96'), { slug: null, id: null });
  assert.deepEqual(parseVitrinePath('/%E0%A4%A/96'), { slug: null, id: '96' });
});
console.log(`${n} testes ok`);
