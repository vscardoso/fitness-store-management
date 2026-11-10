/**
 * Receber compra: lógica pura do rascunho (sem React, testável com node). A tela só desenha o que sai daqui.
 *
 * Uma compra tem vários produtos (novos e já cadastrados), de vários fornecedores, cada um com a grade de cores e
 * tamanhos. Nada vai para o servidor até "Lançar no estoque": o app monta UM envio (`buildPayload`) e o servidor grava
 * tudo ou nada (POST /stock-entries/receive).
 */

export interface SupplierRef {
  /** presente quando o fornecedor já está cadastrado */
  id?: number;
  name: string;
  phone?: string;
  doc?: string;
}

export interface ReceiveLine {
  /** variação que o produto já tem; sem isso, cor e tamanho criam (ou reaproveitam) a variação no servidor */
  variantId?: number;
  color: string | null;
  size: string | null;
  quantity: number;
}

export interface ReceiveItem {
  key: string;
  /** produto já cadastrado */
  productId?: number;
  /** produto novo: nasce junto com a entrada */
  newProduct?: { name: string; categoryId: number; categoryName?: string; basePrice: number };
  name: string;
  supplier: SupplierRef;
  unitCost: number;
  /** preço de venda das variações NOVAS (as que já existem mantêm o preço do cadastro) */
  price?: number;
  lines: ReceiveLine[];
  addedBy?: string;
  /** só na tela: o que o produto cadastrado já tem (para reabrir a grade ao editar) */
  variants?: VariantInfo[];
  categoryName?: string;
}

export interface ReceiveDraft {
  requestId: string;
  supplier: SupplierRef;
  /** AAAA-MM-DD (dia local) */
  date: string;
  items: ReceiveItem[];
  freight: number;
  /** desconto por fornecedor, pela chave de `supplierKey` */
  discounts: Record<string, number>;
  labels: boolean;
  savedAt?: number;
}

export type Quantities = Record<string, Record<string, number>>;

export interface VariantInfo {
  id: number;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  cost_price?: number | null;
}

// ───────────────────────────── texto ─────────────────────────────
export const norm = (s: string | null | undefined): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function lev(a: string, b: string): number {
  const m: number[][] = [];
  for (let i = 0; i <= a.length; i++) m[i] = [i];
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return m[a.length][b.length];
}

/** Produtos que a busca encontra: toda palavra digitada começa (ou aparece) no nome. */
export function matchesName<T extends { name: string }>(query: string, list: T[]): T[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  return list.filter((p) => {
    const n = norm(p.name);
    const nw = n.split(' ');
    return words.every((w) => nw.some((x) => x.startsWith(w)) || n.includes(w));
  });
}

/** Erro de digitação: palavra quase igual ao começo de uma palavra do nome (legin x legging). */
export function similarByTypo<T extends { name: string }>(query: string, list: T[]): T[] {
  const words = norm(query).split(' ').filter((w) => w.length >= 4);
  if (!words.length) return [];
  return list.filter((p) => norm(p.name).split(' ').some((x) =>
    words.some((w) => lev(w, x.slice(0, w.length + 1)) <= (w.length >= 6 ? 2 : 1))));
}

// ───────────────────────────── cores e tamanhos ─────────────────────────────
export const COLORS = ['Preto', 'Branco', 'Rosa', 'Cinza', 'Azul', 'Vermelho', 'Verde', 'Bege', 'Marrom', 'Lilás'];
export const SIZES_APPAREL = ['P', 'M', 'G', 'GG'];
export const SIZES_SHOE = ['35', '36', '37', '38', '39', '40'];

const SIZE_ORDER = ['UNICO', 'PP', 'P', 'P/M', 'M', 'M/G', 'G', 'G/GG', 'GG', 'XG', 'XGG'];
export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => {
    const i = SIZE_ORDER.indexOf(s.toUpperCase());
    if (i >= 0) return i;
    const n = Number(s);
    return Number.isFinite(n) ? 100 + n : 1000;
  };
  return [...new Set(sizes)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export const isShoeCategory = (name?: string | null) => /cal[cç]ad|t[eê]nis|sand[aá]lia|sapat/i.test(name ?? '');
export const defaultSizesFor = (categoryName?: string | null) => (isShoeCategory(categoryName) ? SIZES_SHOE : SIZES_APPAREL);

/** Grades fechadas (caixa que vem do fornecedor): uma quantidade por tamanho, na ordem dos tamanhos. */
export function gradePresets(sizes: string[]): { label: string; per: number[] }[] {
  const n = sizes.length;
  if (n === 4) return [{ label: '1·2·2·1', per: [1, 2, 2, 1] }, { label: '2·3·3·2', per: [2, 3, 3, 2] }];
  if (n === 6) return [{ label: '1·1·2·2·1·1', per: [1, 1, 2, 2, 1, 1] }];
  if (n === 5) return [{ label: '1·2·2·2·1', per: [1, 2, 2, 2, 1] }];
  if (n === 3) return [{ label: '1·2·1', per: [1, 2, 1] }];
  return [];
}

export function addGrade(q: Quantities, color: string, sizes: string[], per: number[]): Quantities {
  const row = { ...(q[color] ?? {}) };
  sizes.forEach((s, i) => { row[s] = (row[s] ?? 0) + (per[i] ?? 0); });
  return { ...q, [color]: row };
}

export const colorTotal = (q: Quantities, color: string): number =>
  Object.values(q[color] ?? {}).reduce((a, b) => a + (b || 0), 0);

export const quantitiesTotal = (q: Quantities): number => Object.keys(q).reduce((a, c) => a + colorTotal(q, c), 0);

export function setQuantity(q: Quantities, color: string, size: string, value: number): Quantities {
  const v = Math.max(0, Math.min(999, Math.floor(Number.isFinite(value) ? value : 0)));
  return { ...q, [color]: { ...(q[color] ?? {}), [size]: v } };
}

/** Cores e tamanhos de um produto já cadastrado: o que ele tem + os tamanhos padrão da categoria. */
export function gridOfProduct(variants: VariantInfo[], categoryName?: string | null): { colors: string[]; sizes: string[] } {
  const colors = [...new Set(variants.map((v) => v.color).filter(Boolean) as string[])];
  const sizes = sortSizes([...(variants.map((v) => v.size).filter(Boolean) as string[]), ...defaultSizesFor(categoryName)]);
  return { colors, sizes };
}

/** Quantidades da grade viram linhas do envio: peça que já existe leva o id da variação, a nova leva cor e tamanho. */
export function quantitiesToLines(q: Quantities, variants: VariantInfo[] = []): ReceiveLine[] {
  const lines: ReceiveLine[] = [];
  for (const color of Object.keys(q)) {
    for (const size of Object.keys(q[color])) {
      const quantity = q[color][size];
      if (!(quantity > 0)) continue;
      const found = variants.find((v) => norm(v.color) === norm(color) && norm(v.size) === norm(size));
      lines.push({ variantId: found?.id, color: found ? (found.color ?? null) : color, size: found ? (found.size ?? null) : size, quantity });
    }
  }
  return lines;
}

export function linesToQuantities(lines: ReceiveLine[]): Quantities {
  const q: Quantities = {};
  for (const l of lines) {
    const c = l.color ?? '';
    const s = l.size ?? '';
    q[c] = { ...(q[c] ?? {}), [s]: (q[c]?.[s] ?? 0) + l.quantity };
  }
  return q;
}

// ───────────────────────────── categoria sugerida pelo nome ─────────────────────────────
const KEYWORD_TO_CATEGORY: [RegExp, string[]][] = [
  [/t[eê]nis|sapatilha|sand[aá]lia|chinelo/i, ['calcad', 'tenis']],
  [/conjunto/i, ['conjunt']],
  [/camiseta|camisa|blusa|regata|cropped|croped/i, ['camiset', 'blus', 'regata']],
  [/legging|cal[cç]a/i, ['legging', 'calca']],
  [/short|bermuda/i, ['short']],
  [/\btop\b/i, ['top']],
  [/macac|jardineira/i, ['macac']],
  [/vestido/i, ['vestido']],
];

export function suggestCategory<C extends { id: number; name: string }>(productName: string, categories: C[]): C | null {
  for (const [re, parts] of KEYWORD_TO_CATEGORY) {
    if (!re.test(productName)) continue;
    for (const p of parts) {
      const hit = categories.find((c) => norm(c.name).includes(p));
      if (hit) return hit;
    }
  }
  return null;
}

// ───────────────────────────── rascunho ─────────────────────────────
export const supplierKey = (s: SupplierRef): string => (s.id ? `id:${s.id}` : `n:${norm(s.name)}`);
export const sameSupplier = (a: SupplierRef, b: SupplierRef): boolean => supplierKey(a) === supplierKey(b)
  || (!!a.name && norm(a.name) === norm(b.name));

export const itemPieces = (it: ReceiveItem): number => it.lines.reduce((a, l) => a + l.quantity, 0);
export const itemValue = (it: ReceiveItem): number => itemPieces(it) * it.unitCost;

export function totals(d: ReceiveDraft): { products: number; pieces: number; value: number } {
  return {
    products: d.items.length,
    pieces: d.items.reduce((a, it) => a + itemPieces(it), 0),
    value: d.items.reduce((a, it) => a + itemValue(it), 0),
  };
}

export interface SupplierGroup { supplier: SupplierRef; key: string; pieces: number; value: number }
export function groupsBySupplier(d: ReceiveDraft): SupplierGroup[] {
  const out: SupplierGroup[] = [];
  for (const it of d.items) {
    const k = supplierKey(it.supplier);
    let g = out.find((x) => x.key === k);
    if (!g) { g = { supplier: it.supplier, key: k, pieces: 0, value: 0 }; out.push(g); }
    g.pieces += itemPieces(it);
    g.value += itemValue(it);
  }
  return out;
}

export const discountTotal = (d: ReceiveDraft): number => Object.values(d.discounts).reduce((a, b) => a + (b || 0), 0);

/** Quanto o custo REAL de cada peça sobe (frete) ou cai (desconto), rateado nas peças da compra. */
export function extraPerPiece(d: ReceiveDraft): number {
  const t = totals(d);
  return t.pieces ? (d.freight - discountTotal(d)) / t.pieces : 0;
}

export function newRequestId(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

export function emptyDraft(supplier: SupplierRef, date: string): ReceiveDraft {
  return { requestId: newRequestId(), supplier, date, items: [], freight: 0, discounts: {}, labels: true };
}

// ───────────────────────────── folha da peça ─────────────────────────────
export interface SheetState {
  mode: 'existing' | 'new';
  name: string;
  categoryId?: number | null;
  q: Quantities;
  cost: number;
  price: number;
  supplier: SupplierRef;
}

/** O que falta para a peça poder entrar na compra (frase para o usuário), ou vazio. */
export function sheetProblem(s: SheetState): string {
  if (s.mode === 'new' && norm(s.name).length < 2) return 'Falta o nome da peça';
  if (s.mode === 'new' && !s.categoryId) return 'Escolha a categoria';
  if (quantitiesTotal(s.q) <= 0) return 'Digite a quantidade de pelo menos uma peça';
  if (!(s.cost > 0)) return 'Falta o custo por peça';
  if (s.mode === 'new' && !(s.price > 0)) return 'Falta o preço de venda';
  return '';
}

// ───────────────────────────── envio ─────────────────────────────
const refOf = (s: SupplierRef) => (s.id ? { id: s.id } : { name: s.name, phone: s.phone || undefined, doc: s.doc || undefined });

export function buildPayload(d: ReceiveDraft): Record<string, unknown> {
  return {
    client_request_id: d.requestId,
    entry_date: d.date,
    supplier: refOf(d.supplier),
    freight: d.freight > 0 ? d.freight.toFixed(2) : undefined,
    supplier_discounts: groupsBySupplier(d)
      .filter((g) => (d.discounts[g.key] ?? 0) > 0)
      .map((g) => ({ supplier: g.supplier.id ? { id: g.supplier.id } : { name: g.supplier.name }, amount: d.discounts[g.key].toFixed(2) })),
    items: d.items.map((it) => ({
      ...(it.productId
        ? { product_id: it.productId }
        : { new_product: { name: it.newProduct!.name, category_id: it.newProduct!.categoryId, base_price: it.newProduct!.basePrice.toFixed(2) } }),
      supplier: refOf(it.supplier),
      unit_cost: it.unitCost.toFixed(2),
      price: it.price && it.price > 0 ? it.price.toFixed(2) : undefined,
      lines: it.lines.map((l) => ({ variant_id: l.variantId, color: l.variantId ? undefined : l.color, size: l.variantId ? undefined : l.size, quantity: l.quantity })),
    })),
  };
}

/** Junta duas linhas do mesmo produto e fornecedor (a pessoa lançou o produto duas vezes). */
export function upsertItem(d: ReceiveDraft, item: ReceiveItem): ReceiveDraft {
  const i = d.items.findIndex((x) => x.key === item.key);
  const items = i >= 0 ? d.items.map((x, k) => (k === i ? item : x)) : [...d.items, item];
  return { ...d, items };
}

export function removeItem(d: ReceiveDraft, key: string): ReceiveDraft {
  return { ...d, items: d.items.filter((x) => x.key !== key) };
}
