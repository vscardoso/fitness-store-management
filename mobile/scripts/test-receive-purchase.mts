// Receber compra: lógica pura do rascunho. Rodar: node scripts/test-receive-purchase.mts
import assert from 'node:assert/strict';
import {
  visibleCells, visibleQuantities, quantitiesToFlat, zeroLeftovers, zeroNotice,
  addGrade, buildPayload, cleanSize, colorTotal, discountTotal, emptyDraft, extraPerPiece, gradePresets, gridOfProduct, groupsBySupplier,
  itemPieces, linesToQuantities, matchesName, quantitiesToLines, quantitiesTotal, removeItem, setQuantity, sheetProblem,
  similarByTypo, sortSizes, suggestCategory, totals, upsertItem, supplierKey, type ReceiveItem,
} from '../utils/receivePurchase.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

const CATALOG = [{ name: 'Legging Cós Alto' }, { name: 'Tênis New Balance 9060' }, { name: 'Camiseta Dry Fit' }];

t('busca: início de palavra, sem acento', () => {
  assert.deepEqual(matchesName('tenis', CATALOG).map((p) => p.name), ['Tênis New Balance 9060']);
  assert.deepEqual(matchesName('cos alto', CATALOG).map((p) => p.name), ['Legging Cós Alto']);
  assert.equal(matchesName('', CATALOG).length, 0);
});
t('erro de digitação avisa a peça parecida (legin x Legging), vestido não acha nada', () => {
  assert.deepEqual(similarByTypo('legin', CATALOG).map((p) => p.name), ['Legging Cós Alto']);
  assert.equal(similarByTypo('vestido', CATALOG).length, 0);
});
t('categoria sugerida pelo nome', () => {
  const cats = [{ id: 1, name: 'Calçados' }, { id: 2, name: 'Conjuntos' }, { id: 3, name: 'Camisetas' }];
  assert.equal(suggestCategory('Tênis Nike', cats)?.id, 1);
  assert.equal(suggestCategory('Conjunto Seamless', cats)?.id, 2);
  assert.equal(suggestCategory('Regata Tule', cats)?.id, 3);
  assert.equal(suggestCategory('Objeto estranho', cats), null);
});
t('tamanhos em ordem natural e grade do produto cadastrado', () => {
  assert.deepEqual(sortSizes(['GG', 'P', 'M', 'G']), ['P', 'M', 'G', 'GG']);
  assert.deepEqual(sortSizes(['38', '36', 'P']), ['P', '36', '38']);
  const g = gridOfProduct([{ id: 1, color: 'Preto', size: 'M' }, { id: 2, color: 'Rosa', size: 'XG' }], 'Conjuntos');
  assert.deepEqual(g.colors, ['Preto', 'Rosa']);
  assert.deepEqual(g.sizes, ['P', 'M', 'G', 'GG', 'XG']);
});
t('a família de tamanhos vem do produto, não da categoria (M em Calçados não vira 35 a 40)', () => {
  // caso real do teste na tela: produto com tamanho M cadastrado na categoria Calçados
  assert.deepEqual(gridOfProduct([{ id: 1, color: 'Preto', size: 'M' }], 'Calçados').sizes, ['P', 'M', 'G', 'GG']);
  assert.equal(gradePresets(gridOfProduct([{ id: 1, color: 'Preto', size: 'M' }], 'Calçados').sizes).length, 2);
  // produto numerado fica com os números dele (calça 38 e 42 não ganha 35 a 40)
  assert.deepEqual(gridOfProduct([{ id: 1, color: 'Azul', size: '42' }, { id: 2, color: 'Azul', size: '38' }], 'Calças').sizes, ['38', '42']);
  // produto ainda sem variação com tamanho usa a categoria
  assert.deepEqual(gridOfProduct([], 'Calçados').sizes, ['35', '36', '37', '38', '39', '40']);
  assert.equal(cleanSize('  xg '), 'XG');
  assert.equal(cleanSize('44'), '44');
});
t('produto cadastrado sem cor e sem tamanho: grade "Sem cor" x "Único" e a peça entra na variação que já existe', () => {
  const variants = [{ id: 7, color: null, size: null }];
  const g = gridOfProduct(variants, 'Camisetas');
  assert.deepEqual(g, { colors: [''], sizes: [''] });
  assert.deepEqual(quantitiesToLines({ '': { '': 3 } }, variants), [{ variantId: 7, color: null, size: null, quantity: 3 }]);
  // produto com cor mas tamanho único continua só com "Único"
  assert.deepEqual(gridOfProduct([{ id: 8, color: 'Preto', size: null }], 'Camisetas'), { colors: ['Preto'], sizes: [''] });
  // peça nova de tamanho único: cor escolhida, sem tamanho
  assert.deepEqual(quantitiesToLines({ Preto: { '': 2 } }, []), [{ variantId: undefined, color: 'Preto', size: null, quantity: 2 }]);
  assert.deepEqual(sortSizes(['M', '', 'P']), ['', 'P', 'M']);
});
t('grade fechada soma uma caixa por toque, por cor', () => {
  const sizes = ['P', 'M', 'G', 'GG'];
  const pre = gradePresets(sizes)[0];
  assert.deepEqual(pre.per, [1, 2, 2, 1]);
  let q = addGrade({}, 'Preto', sizes, pre.per);
  q = addGrade(q, 'Preto', sizes, pre.per);
  assert.equal(colorTotal(q, 'Preto'), 12);
  assert.equal(colorTotal(q, 'Rosa'), 0);
  assert.equal(gradePresets(['35', '36', '37', '38', '39', '40'])[0].per.length, 6);
});
t('setas e digitação nunca passam de 0 a 999', () => {
  let q = setQuantity({}, 'Preto', 'P', -3);
  assert.equal(q.Preto.P, 0);
  q = setQuantity(q, 'Preto', 'P', 5000);
  assert.equal(q.Preto.P, 999);
  q = setQuantity(q, 'Preto', 'P', 2.9);
  assert.equal(q.Preto.P, 2);
  assert.equal(quantitiesTotal(q), 2);
});
t('quantidades viram linhas: variação existente leva o id, a nova leva cor e tamanho', () => {
  const variants = [{ id: 10, color: 'Preto', size: 'P' }, { id: 11, color: 'Lilás', size: 'M' }];
  const lines = quantitiesToLines({ Preto: { P: 2, M: 1, G: 0 }, Lilas: { M: 3 } }, variants);
  assert.deepEqual(lines, [
    { variantId: 10, color: 'Preto', size: 'P', quantity: 2 },
    { variantId: undefined, color: 'Preto', size: 'M', quantity: 1 },
    { variantId: 11, color: 'Lilás', size: 'M', quantity: 3 },   // "Lilas" sem acento acha a variação "Lilás"
  ]);
  assert.deepEqual(linesToQuantities(lines).Preto, { P: 2, M: 1 });
});
t('o botão explica o que falta, na ordem em que a pessoa preenche', () => {
  const base = { mode: 'new' as const, name: '', categoryId: null, q: {}, cost: 0, price: 0, supplier: { name: 'A' } };
  assert.equal(sheetProblem(base), 'Falta o nome da peça');
  assert.equal(sheetProblem({ ...base, name: 'Vestido' }), 'Escolha a categoria');
  assert.equal(sheetProblem({ ...base, name: 'Vestido', categoryId: 3 }), 'Digite a quantidade de pelo menos uma peça');
  assert.equal(sheetProblem({ ...base, name: 'Vestido', categoryId: 3, q: { Preto: { P: 1 } } }), 'Falta o custo por peça');
  assert.equal(sheetProblem({ ...base, name: 'Vestido', categoryId: 3, q: { Preto: { P: 1 } }, cost: 30 }), 'Falta o preço de venda');
  assert.equal(sheetProblem({ ...base, name: 'Vestido', categoryId: 3, q: { Preto: { P: 1 } }, cost: 30, price: 90 }), '');
  // produto já cadastrado não pede nome, categoria nem preço
  assert.equal(sheetProblem({ ...base, mode: 'existing', name: '', q: { Preto: { P: 1 } }, cost: 10 }), '');
});

const A = { id: 1, name: 'Fornecedor A' };
const R = { name: 'Rua 25', phone: '(11) 90000-0000' };
const item = (key: string, p: Partial<ReceiveItem>): ReceiveItem => ({
  key, name: 'X', supplier: A, unitCost: 10, lines: [{ color: 'Preto', size: 'P', quantity: 2 }], ...p,
});

t('totais por produto, por fornecedor e custo real com frete e desconto', () => {
  let d = emptyDraft(A, '2026-11-10');
  d = upsertItem(d, item('a', { productId: 5, unitCost: 20, lines: [{ variantId: 1, color: 'Preto', size: 'P', quantity: 3 }] }));
  d = upsertItem(d, item('b', { supplier: R, newProduct: { name: 'Conjunto', categoryId: 2, basePrice: 90 }, unitCost: 30, lines: [{ color: 'Preto', size: 'P', quantity: 2 }, { color: 'Preto', size: 'M', quantity: 3 }] }));
  assert.deepEqual(totals(d), { products: 2, pieces: 8, value: 3 * 20 + 5 * 30 });
  const gs = groupsBySupplier(d);
  assert.deepEqual(gs.map((g) => [g.supplier.name, g.pieces, g.value]), [['Fornecedor A', 3, 60], ['Rua 25', 5, 150]]);
  d = { ...d, freight: 25.5, discounts: { [supplierKey(R)]: 10 } };
  assert.equal(discountTotal(d), 10);
  assert.ok(Math.abs(extraPerPiece(d) - 15.5 / 8) < 1e-9);
  assert.equal(extraPerPiece({ ...d, freight: 0, discounts: {} }), 0);
});
t('envio: produto cadastrado leva o id, produto novo leva os dados, fornecedor novo leva o nome e o telefone', () => {
  let d = emptyDraft(A, '2026-11-10');
  d = upsertItem(d, item('a', { productId: 5, unitCost: 22, lines: [{ variantId: 1, color: 'Preto', size: 'P', quantity: 1 }, { color: 'Rosa', size: 'M', quantity: 2 }] }));
  d = upsertItem(d, item('b', { supplier: R, newProduct: { name: 'Conjunto', categoryId: 2, basePrice: 90 }, unitCost: 30, price: 95, lines: [{ color: 'Preto', size: 'P', quantity: 2 }] }));
  d = { ...d, freight: 25.5, discounts: { [supplierKey(R)]: 10 } };
  const p = buildPayload(d) as any;
  assert.equal(p.client_request_id, d.requestId);
  assert.deepEqual(p.supplier, { id: 1 });
  assert.equal(p.freight, '25.50');
  assert.deepEqual(p.supplier_discounts, [{ supplier: { name: 'Rua 25' }, amount: '10.00' }]);
  assert.equal(p.items[0].product_id, 5);
  assert.equal(p.items[0].unit_cost, '22.00');
  assert.deepEqual(p.items[0].lines[0], { variant_id: 1, color: undefined, size: undefined, quantity: 1 });
  assert.deepEqual(p.items[0].lines[1], { variant_id: undefined, color: 'Rosa', size: 'M', quantity: 2 });
  assert.deepEqual(p.items[1].new_product, { name: 'Conjunto', category_id: 2, base_price: '90.00' });
  assert.deepEqual(p.items[1].supplier, { name: 'Rua 25', phone: '(11) 90000-0000', doc: undefined });
  assert.equal(p.items[1].price, '95.00');
  assert.equal((buildPayload({ ...d, freight: 0 }) as any).freight, undefined);
});
t('identificador do envio é único por compra e vem no formato que o servidor aceita', () => {
  const a = emptyDraft(A, '2026-11-10').requestId;
  const b = emptyDraft(A, '2026-11-10').requestId;
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9-]{8,64}$/);
});
t('trocar e apagar peça da compra', () => {
  let d = emptyDraft(A, '2026-11-10');
  d = upsertItem(d, item('a', {}));
  d = upsertItem(d, item('b', {}));
  d = upsertItem(d, item('a', { lines: [{ color: 'Preto', size: 'M', quantity: 7 }] }));
  assert.equal(d.items.length, 2);
  assert.equal(itemPieces(d.items[0]), 7);
  d = removeItem(d, 'a');
  assert.deepEqual(d.items.map((x) => x.key), ['b']);
});
t('a mesma peça de dois fornecedores é UM produto (duas linhas) e as peças somam', () => {
  let d = emptyDraft(A, '2026-11-10');
  d = upsertItem(d, item('a', { productId: 7, name: 'Legging', supplier: A, lines: [{ color: 'Preto', size: 'M', quantity: 8 }], unitCost: 10 }));
  d = upsertItem(d, item('b', { productId: 7, name: 'Legging', supplier: { name: 'Rua 25' }, lines: [{ color: 'Preto', size: 'M', quantity: 1 }], unitCost: 12 }));
  d = upsertItem(d, item('c', { name: 'Vestido', lines: [{ color: 'Preto', size: 'P', quantity: 7 }], unitCost: 30 }));
  assert.equal(d.items.length, 3);
  assert.deepEqual({ p: totals(d).products, n: totals(d).pieces }, { p: 2, n: 16 });
  assert.equal(groupsBySupplier(d).length, 2);
});
t('células visíveis: cada cor com os tamanhos dela; sem cor e sem tamanho viram uma célula só', () => {
  assert.deepEqual(visibleCells(['Preto', 'Rosa'], { Preto: ['P', 'M'], Rosa: ['M'] }, ['P', 'M', 'G']), [
    { color: 'Preto', size: 'P' }, { color: 'Preto', size: 'M' }, { color: 'Rosa', size: 'M' },
  ]);
  // cor sem tamanhos próprios usa os do modelo; sem tamanho nenhum é a peça única (tamanho vazio)
  assert.deepEqual(visibleCells(['Preto'], {}, ['P', 'M']), [{ color: 'Preto', size: 'P' }, { color: 'Preto', size: 'M' }]);
  assert.deepEqual(visibleCells(['Preto'], { Preto: [] }, []), [{ color: 'Preto', size: '' }]);
  assert.deepEqual(visibleCells([], {}, []), [{ color: '', size: '' }]);
  assert.deepEqual(visibleCells([], {}, ['P', '—']), [{ color: '', size: 'P' }, { color: '', size: '' }]);
});
t('só o que está visível conta: quantidade de tamanho desmarcado fica de fora', () => {
  const cells = visibleCells(['Preto'], { Preto: ['P', 'M'] }, ['P', 'M', 'G']);
  const flat = { 'Preto-P': 2, 'Preto-M': 0, 'Preto-G': 9, 'Rosa-P': 4 };   // G foi desmarcado; Rosa saiu da lista
  const q = visibleQuantities(cells, flat);
  assert.deepEqual(q, { Preto: { P: 2, M: 0 } });
  assert.equal(quantitiesTotal(q), 2);
  assert.deepEqual(quantitiesToFlat({ Preto: { P: 2 }, '': { '': 3 } }), { 'Preto-P': 2, '-': 3 });
});
t('zerados: o que sai da compra e a frase que avisa por quê', () => {
  const left = zeroLeftovers({ Preto: { P: 2, M: 0, G: 0 }, Rosa: { P: 0, M: 0 }, Azul: { M: 1 } });
  assert.deepEqual(left.colors, ['Rosa']);
  assert.deepEqual(left.sizes, [{ color: 'Preto', size: 'M' }, { color: 'Preto', size: 'G' }]);
  const msg = zeroNotice(left);
  assert.match(msg, /Rosa \(cor inteira\)/);
  assert.match(msg, /Preto M, G/);
  assert.match(msg, /O sistema não aceita estoque zerado/);
  assert.equal(zeroNotice(zeroLeftovers({ Preto: { P: 1, M: 1 } })), '');   // nada zerado: nenhum aviso
  assert.match(zeroNotice(zeroLeftovers({ '': { '': 0, P: 3 } })), /Sem cor Único/);
  // cor que ninguém escolheu de propósito não gera aviso
  assert.deepEqual(zeroLeftovers({ Preto: { P: 0 }, Rosa: { P: 1 } }, ['Preto']).colors, []);
});
console.log(`${n} testes ok`);
