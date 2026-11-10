/**
 * Grade de lançamento na entrada: cores x tamanhos de um produto JÁ cadastrado, com a quantidade de cada combinação.
 * Cada combinação é uma peça que o produto já tem (usa o SKU e o código dela) ou uma NOVA (ganha SKU e o próximo código).
 * Sem React nem tela (testada por `scripts/test-entry-grid.mts`).
 */

export interface GridVariant {
  id: number;
  color?: string | null;
  size?: string | null;
  display_code?: string | null;
  current_stock?: number | null;
}

export interface GridCell {
  key: string;
  color: string;
  size: string;
  qty: number;
  /** Peça que o produto já tem; null = combinação nova (vai criar a variação). */
  variantId: number | null;
  code: string | null;
  stock: number | null;
}

export interface BatchLine {
  variant_id?: number;
  color?: string;
  size?: string;
  quantity: number;
  cost_price: number;
  list_unit_cost?: number;
}

const ORDER = ['ÚNICO', 'PP', 'P', 'P/M', 'M', 'M/G', 'G', 'G/GG', 'GG', 'XG', 'XGG'];

const norm = (s?: string | null) => (s ?? '').trim();
const colorKey = (s?: string | null) => norm(s).toLowerCase();
const sizeKey = (s?: string | null) => norm(s).toUpperCase();

/** Chave de uma combinação: cor sem diferenciar caixa, tamanho em maiúsculas. */
export const cellKey = (color?: string | null, size?: string | null) => `${colorKey(color)}|${sizeKey(size)}`;

export function sizeRank(s: string): number {
  const v = sizeKey(s);
  if (/^\d+$/.test(v)) return Number(v);
  const i = ORDER.indexOf(v);
  return 1000 + (i >= 0 ? i : 99);
}

/** Cores que o produto já tem, na ordem em que aparecem (sem repetir, sem diferenciar caixa). */
export function existingColors(variants: GridVariant[]): string[] {
  const seen = new Map<string, string>();
  for (const v of variants) {
    const c = norm(v.color);
    if (c && !seen.has(colorKey(c))) seen.set(colorKey(c), c);
  }
  return [...seen.values()];
}

/** Tamanhos para escolher: os que o produto já tem + a grade padrão (letras ou numeração, conforme o produto). */
export function suggestedSizes(variants: GridVariant[]): string[] {
  const own = variants.map((v) => sizeKey(v.size)).filter(Boolean);
  const numeric = own.some((s) => /^\d+$/.test(s));
  const base = numeric ? ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42'] : ['PP', 'P', 'M', 'G', 'GG', 'XG'];
  return [...new Set([...own, ...base])].sort((a, b) => sizeRank(a) - sizeRank(b));
}

/** Produto sem cor (todas as variações sem cor) usa uma linha só, sem nome; o mesmo vale para tamanho. */
function effective(selected: string[], variantsValues: (string | null | undefined)[]): string[] {
  if (selected.length) return selected;
  return variantsValues.some((v) => norm(v)) ? [] : [''];
}

/** Monta as combinações cor x tamanho escolhidas, achando a peça que já existe para cada uma. */
export function buildCells(variants: GridVariant[], colors: string[], sizes: string[], qty: Record<string, string>): GridCell[] {
  const byKey = new Map<string, GridVariant>();
  for (const v of variants) byKey.set(cellKey(v.color, v.size), v);
  const cs = effective(colors, variants.map((v) => v.color));
  const ss = effective(sizes, variants.map((v) => v.size));
  const out: GridCell[] = [];
  for (const c of cs) {
    for (const s of ss) {
      const key = cellKey(c, s);
      const v = byKey.get(key);
      const n = parseInt(qty[key] ?? '', 10);
      out.push({
        key, color: c, size: s, qty: Number.isFinite(n) && n > 0 ? n : 0,
        variantId: v ? v.id : null, code: v?.display_code ?? null, stock: v?.current_stock ?? null,
      });
    }
  }
  return out;
}

/** Linhas para o servidor: só as combinações com quantidade. Peça existente vai por id; combinação nova vai por cor e tamanho. */
export function toBatchLines(cells: GridCell[], cost: number, listCost: number): BatchLine[] {
  return cells.filter((c) => c.qty > 0).map((c) => {
    const base = { quantity: c.qty, cost_price: cost, ...(listCost > 0 ? { list_unit_cost: listCost } : {}) };
    if (c.variantId) return { variant_id: c.variantId, ...base };
    return { ...(c.color ? { color: c.color } : {}), ...(c.size ? { size: c.size } : {}), ...base };
  });
}

export function gridSummary(cells: GridCell[]) {
  const used = cells.filter((c) => c.qty > 0);
  return {
    pieces: used.reduce((n, c) => n + c.qty, 0),
    lines: used.length,
    created: used.filter((c) => c.variantId == null).length,
    reused: used.filter((c) => c.variantId != null).length,
  };
}

/** Texto do botão e da conferência: "6 peças em 4 variações (3 novas)". */
export function gridText(sum: { pieces: number; lines: number; created: number }): string {
  if (sum.pieces === 0) return 'Informe a quantidade de ao menos uma combinação.';
  const pecas = `${sum.pieces} peça${sum.pieces !== 1 ? 's' : ''}`;
  const vars = `${sum.lines} variaç${sum.lines !== 1 ? 'ões' : 'ão'}`;
  return sum.created > 0 ? `${pecas} em ${vars} (${sum.created} nova${sum.created !== 1 ? 's' : ''})` : `${pecas} em ${vars}`;
}
