// Testes da lógica de leitura. Rodar: node scripts/test-scan-logic.mts
import assert from 'node:assert/strict';
import { buildCodeIndex, codeKeys, createPresenceGate, createScanGate, createWedgeBuffer, findVariantLocal, normalizeScan } from '../utils/scanLogic.ts';

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n += 1;
  console.log('ok', name);
};

t('normaliza quebras de linha e controle', () => {
  assert.equal(normalizeScan('  PV#101-1\r\n'), 'PV#101-1');
  assert.equal(normalizeScan('\u0000AB\u001f'), 'AB');
  assert.equal(normalizeScan(''), '');
});

t('mesma leitura dentro da janela é ignorada, depois vale', () => {
  const g = createScanGate(1500);
  assert.equal(g.accept('PV#1-1', 0), true);
  assert.equal(g.accept('PV#1-1', 400), false);
  assert.equal(g.accept('PV#1-2', 500), true);   // outro código passa na hora
  assert.equal(g.accept('PV#1-2', 1999), false);
  assert.equal(g.accept('PV#1-2', 2100), true);
  assert.equal(g.accept('   ', 9999), false);
});

t('leitor tipo teclado: rápido + Enter vira leitura; devagar não', () => {
  const w = createWedgeBuffer({ maxGapMs: 50, minLength: 3 });
  let out: string | null = null;
  let now = 1000;
  for (const ch of 'PV#101-1') { w.feed(ch, now); now += 8; }
  out = w.feed('Enter', now);
  assert.equal(out, 'PV#101-1');
  // digitação humana (300 ms entre teclas)
  now += 5000;
  for (const ch of 'abc') { w.feed(ch, now); now += 300; }
  assert.equal(w.feed('Enter', now), null);   // só o último caractere ficou no buffer (menos que 3)
  // Enter sozinho não dá nada; teclas especiais são ignoradas
  assert.equal(w.feed('Enter', now + 10), null);
  assert.equal(w.feed('Shift', now + 20), null);
});

t('duas leituras seguidas não se misturam', () => {
  const w = createWedgeBuffer();
  let now = 0;
  const lerTudo = (texto: string) => {
    for (const ch of texto) { w.feed(ch, now); now += 5; }
    const r = w.feed('Enter', now);
    now += 400;
    return r;
  };
  assert.equal(lerTudo('PV#7-2'), 'PV#7-2');
  assert.equal(lerTudo('SKU-ABC-1'), 'SKU-ABC-1');
});

t('chaves de busca: etiqueta, SKU e código antigo, nessa ordem', () => {
  assert.deepEqual(codeKeys('PV#101-1'), ['P:101-1', 'SKU:PV#101-1']);
  assert.deepEqual(codeKeys('#007-02'), ['P:7-2', 'SKU:#007-02']);
  assert.deepEqual(codeKeys('PV#0123'), ['SKU:PV#0123', 'S:123']);
  assert.deepEqual(codeKeys('abc-1'), ['SKU:ABC-1']);
  assert.deepEqual(codeKeys(''), []);
  assert.deepEqual(codeKeys('0'), ['SKU:0']);      // zero não é código curto
});

t('índice local acha por #produto-variação, SKU e código antigo', () => {
  const idx = buildCodeIndex([
    { variant_id: 10, sku: 'NIKE-AZU-P', short_code: 165, display_code: '#002-7' },
    { variant_id: 11, sku: '12345', short_code: 166, display_code: null },
    { variant_id: 12, sku: null, short_code: null, display_code: '#101-1' },
  ]);
  assert.equal(findVariantLocal(idx, 'PV#002-7'), 10);
  assert.equal(findVariantLocal(idx, '#2-7'), 10);
  assert.equal(findVariantLocal(idx, 'nike-azu-p'), 10);          // SKU sem diferença de maiúscula
  assert.equal(findVariantLocal(idx, 'PV#0165'), 10);             // código antigo
  assert.equal(findVariantLocal(idx, '12345'), 11);               // SKU numérico ganha do código antigo 12345
  assert.equal(findVariantLocal(idx, 'PV#101-1'), 12);
  assert.equal(findVariantLocal(idx, 'PV#999-9'), null);
  assert.equal(findVariantLocal(idx, ''), null);
});

t('estresse: 500 leituras seguidas contam exatamente e a repetição rápida é ignorada', () => {
  const g = createScanGate(1500);
  const w = createWedgeBuffer();
  const codes = ['PV#1-1', 'PV#1-2', 'PV#2-1', 'PV#2-2', 'PV#3-1'];
  const counts: Record<string, number> = {};
  let now = 0;
  let aceitas = 0;
  for (let i = 0; i < 500; i += 1) {
    const code = codes[i % codes.length];
    // cada leitura chega como teclado rápido; 2 s entre peças diferentes ou iguais
    for (const ch of code) { w.feed(ch, now); now += 6; }
    const lido = w.feed('Enter', now);
    assert.equal(lido, code);
    if (g.accept(lido as string, now)) { counts[code] = (counts[code] ?? 0) + 1; aceitas += 1; }
    // leitura duplicada 300 ms depois (câmera lendo o mesmo QR de novo): tem que ser ignorada
    assert.equal(g.accept(code, now + 300), false);
    now += 2000;
  }
  assert.equal(aceitas, 500);
  assert.deepEqual(Object.values(counts), [100, 100, 100, 100, 100]);
});

t('estresse: índice com 30 mil variações acha qualquer uma rápido', () => {
  const rows = Array.from({ length: 30000 }, (_, i) => ({
    variant_id: i + 1,
    sku: 'SKU-' + (i + 1),
    short_code: i + 1,
    display_code: '#' + (Math.floor(i / 10) + 1) + '-' + ((i % 10) + 1),
  }));
  const idx = buildCodeIndex(rows);
  const t0 = Date.now();
  for (let i = 0; i < 2000; i += 1) {
    const id = 1 + ((i * 7919) % 30000);
    const r = rows[id - 1];
    assert.equal(findVariantLocal(idx, 'PV' + r.display_code), id);
    assert.equal(findVariantLocal(idx, r.sku), id);
  }
  assert.ok(Date.now() - t0 < 1500, 'busca lenta demais: ' + (Date.now() - t0) + ' ms');
});

t('câmera: QR parado na frente conta 1 só, mesmo por 20 segundos', () => {
  const g = createPresenceGate(800);
  let aceitas = 0;
  for (let now = 0; now <= 20000; now += 120) if (g.accept('PV#5-1', now)) aceitas += 1;   // ~8 quadros por segundo
  assert.equal(aceitas, 1);
});

t('câmera: tirou da vista (>800 ms) e mostrou de novo = conta mais 1; outra peça conta na hora', () => {
  const g = createPresenceGate(800);
  assert.equal(g.accept('PV#5-1', 0), true);
  assert.equal(g.accept('PV#5-1', 100), false);
  assert.equal(g.accept('PV#5-1', 1500), true);     // ficou 1,4 s sem ver: é outra peça igual
  assert.equal(g.accept('PV#5-2', 1600), true);     // código diferente
  assert.equal(g.accept('PV#5-1', 1700), true);     // voltou ao anterior depois de outro
  assert.equal(g.accept('  ', 1800), false);
});

console.log(`\n${n} testes passaram`);
