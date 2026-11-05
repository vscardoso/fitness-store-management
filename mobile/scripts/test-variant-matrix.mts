// Grade tamanho x cor: tamanho vazio e 'ÚNICO' gravado caem na mesma coluna "Único". Rodar: node scripts/test-variant-matrix.mts
import assert from 'node:assert/strict';
import { buildVariantMatrix } from '../utils/variantMatrix.ts';

const m = buildVariantMatrix({
  available_sizes: ['P', 'G', 'ÚNICO'], available_colors: ['Azul', 'Preto'],
  grid: [
    { variant_id: 1, color: 'Azul', size: null, stock: 1 },
    { variant_id: 2, color: 'Preto', size: 'ÚNICO', stock: 2 },
    { variant_id: 3, color: 'Preto', size: 'G', stock: 1 },
  ],
} as any);
assert.deepEqual(m.sizes.filter((s: string) => s === 'Único').length, 1);
assert.equal(m.sizes.includes('ÚNICO'), false);
assert.equal(m.cells['Azul']['Único'].stock, 1);
assert.equal(m.cells['Preto']['Único'].stock, 2);
console.log('ok grade com tamanho único numa coluna só');
