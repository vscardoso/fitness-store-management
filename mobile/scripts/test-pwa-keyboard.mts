// Testes do teclado no app instalado no iPhone (scripts/pwa-keyboard.js), com os números medidos no aparelho.
// Rodar: node scripts/test-pwa-keyboard.mts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('./pwa-keyboard.js', import.meta.url), 'utf8');
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

function boot(standalone: boolean, screenH = 956) {
  const timers: Array<() => void> = [];
  const listeners: Record<string, () => void> = {};
  const props: Record<string, string> = {};
  const vv = { height: screenH, offsetTop: 0, addEventListener: (e: string, f: () => void) => { listeners['vv:' + e] = f; } };
  const win: any = {
    visualViewport: vv, scrollY: 0,
    matchMedia: () => ({ matches: standalone }),
    scrollTo: () => { win.scrollY = 0; vv.offsetTop = 0; },
    addEventListener: (e: string, f: () => void) => { listeners['win:' + e] = f; },
  };
  const doc = { documentElement: { style: { setProperty: (k: string, v: string) => { props[k] = v; }, removeProperty: (k: string) => { delete props[k]; } } } };
  new Function('window', 'document', 'navigator', 'screen', 'setTimeout', code)(
    win, doc, { standalone }, { height: screenH }, (f: () => void) => timers.push(f));
  const flush = () => { while (timers.length) timers.shift()!(); };
  return { vv, win, props, listeners, flush };
}

t('teclado fechado: nada muda', () => {
  const b = boot(true);
  assert.deepEqual(b.props, {});
});
t('teclado abre com a página deslocada (541 / 353): app na altura visível e página no topo', () => {
  const b = boot(true);
  b.vv.height = 541; b.vv.offsetTop = 353; b.win.scrollY = 353;
  b.listeners['vv:resize']();
  assert.equal(b.props['--app-h'], '541px');
  assert.equal(b.vv.offsetTop, 0);
  assert.equal(b.win.scrollY, 0);
});
t('o iOS rola de novo durante a animação: os retornos atrasados voltam ao topo', () => {
  const b = boot(true);
  b.vv.height = 541; b.listeners['vv:resize']();
  b.win.scrollY = 415; b.vv.offsetTop = 353;
  b.flush();
  assert.equal(b.win.scrollY, 0);
});
t('teclado fecha com a página ainda deslocada: tira a altura e volta ao topo (header esbranquiçado)', () => {
  const b = boot(true);
  b.vv.height = 541; b.listeners['vv:resize']();
  b.vv.height = 956; b.vv.offsetTop = 120; b.win.scrollY = 120;
  b.listeners['vv:resize']();
  assert.deepEqual(b.props, {});
  assert.equal(b.win.scrollY, 0);
  assert.equal(b.vv.offsetTop, 0);
});
t('campo perde o foco: confere de novo depois', () => {
  const b = boot(true);
  b.vv.height = 541; b.listeners['vv:resize']();
  b.vv.height = 956; b.win.scrollY = 50;
  b.listeners['win:focusout'](); b.flush();
  assert.deepEqual(b.props, {});
  assert.equal(b.win.scrollY, 0);
});
t('Safari comum (não instalado): não mexe em nada', () => {
  const b = boot(false);
  assert.equal(b.listeners['vv:resize'], undefined);
});
t('só a barra do navegador (diferença pequena): não é teclado', () => {
  const b = boot(true);
  b.vv.height = 860; b.listeners['vv:resize']();
  assert.deepEqual(b.props, {});
});
console.log(`${n} testes ok`);
