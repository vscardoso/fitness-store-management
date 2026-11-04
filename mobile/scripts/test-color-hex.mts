// Bolinha da cor pelo nome. Rodar: node scripts/test-color-hex.mts
import assert from 'node:assert/strict';
import { colorNameToHex } from '../utils/colorHex.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
t('lavanda e nomes de moda têm cor', () => {
  for (const c of ['Lavanda', 'Azul Petróleo', 'Azul Royal', 'Pérola', 'Verde Água', 'Caqui']) assert.ok(colorNameToHex(c), c);
});
t('Cinza Médio não fica igual ao cinza neutro', () => {
  assert.ok(colorNameToHex('Cinza Médio'));
  assert.notEqual(colorNameToHex('Cinza Médio'), colorNameToHex('Cinza'));
});
t('o termo específico vence: Azul Petróleo é petróleo, não azul', () => assert.equal(colorNameToHex('Azul Petróleo'), '#1d5e6e'));
t('nome desconhecido devolve null', () => assert.equal(colorNameToHex('Xyzzy'), null));
console.log(`${n} testes ok`);
