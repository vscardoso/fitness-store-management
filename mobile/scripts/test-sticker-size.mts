// Testes das medidas do adesivo (utils/stickerSize.ts). Rodar: node scripts/test-sticker-size.mts
import assert from 'node:assert/strict';
import {
  cmText, customSticker, DEFAULT_STICKER, parseCm, sizeDims, stickerScale, stickersPerSheet,
} from '../utils/stickerSize.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('padrão é 5 x 4 cm (5 de largura, 4 de altura)', () => {
  assert.equal(DEFAULT_STICKER.widthMm, 50);
  assert.equal(DEFAULT_STICKER.heightMm, 40);
  assert.equal(sizeDims(50, 40), '5 de largura × 4 de altura');
  assert.equal(stickersPerSheet(50, 40), 18);
});
t('centímetros com vírgula ou ponto viram milímetros', () => {
  assert.equal(parseCm('6'), 60);
  assert.equal(parseCm('6,5'), 65);
  assert.equal(parseCm(' 5.5 '), 55);
});
t('fora de 3 a 10 cm ou texto inválido é recusado', () => {
  assert.equal(parseCm('2,9'), null);
  assert.equal(parseCm('10,1'), null);
  assert.equal(parseCm('abc'), null);
  assert.equal(parseCm(''), null);
  assert.equal(parseCm('3'), 30);
  assert.equal(parseCm('10'), 100);
});
t('texto da medida e etiqueta livre', () => {
  assert.equal(cmText(65), '6,5');
  assert.equal(cmText(60), '6');
  const c = customSticker(45, 35);
  assert.equal(c.name, '4,5 × 3,5 cm');
  assert.equal(sizeDims(47, 42), '4,7 de largura × 4,2 de altura');
});
t('quantas cabem na A4 igual ao servidor (a4_grid)', () => {
  assert.equal(stickersPerSheet(47, 42), 24);
  assert.equal(stickersPerSheet(50, 45), 18);
  assert.equal(stickersPerSheet(60, 50), 15);
  assert.equal(stickersPerSheet(50, 60), 12);
  assert.equal(stickersPerSheet(65, 55), 15);
  assert.equal(stickersPerSheet(55, 65), 12);
});
t('letras e QR acompanham a medida (igual ao scale_for do servidor)', () => {
  assert.equal(stickerScale(60, 50), 1);
  assert.equal(stickerScale(30, 30), 0.6);
  assert.equal(stickerScale(100, 100), 1.6);
});
console.log(`${n} testes ok`);
