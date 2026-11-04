/**
 * Busca de produtos da lista (celular e computador usam a mesma regra).
 * Cada palavra digitada precisa aparecer no produto: nome, marca, categoria, SKU, cor, tamanho ou código.
 * Código da etiqueta com ou sem "#" e com ou sem zeros à esquerda: "#054", "054", "54" e "#054-1" acham o produto 54.
 * Número sozinho é código (ou tamanho exato, como "38"): não procura pedaço de SKU, senão "001" acha todo SKU terminado em 001.
 */
export interface SearchableVariant {
  sku?: string | null;
  color?: string | null;
  size?: string | null;
  display_code?: string | null;
  product_code?: number | null;
}

export interface SearchableProduct {
  name?: string | null;
  brand?: string | null;
  variants?: SearchableVariant[];
}

const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Número do produto na etiqueta ("#101-1" -> 101), ou 0 se não tiver. */
export function productCodeNumber(p: SearchableProduct): number {
  for (const v of p.variants ?? []) {
    const m = v.display_code?.match(/^#(\d+)-/);
    if (m) return Number(m[1]);
    if (v.product_code) return v.product_code;
  }
  return 0;
}

/** Código do produto como na etiqueta: "#054". */
export function productCode(p: SearchableProduct): string {
  const n = productCodeNumber(p);
  return n ? `#${String(n).padStart(3, '0')}` : '';
}

/** "#054-01" -> "54-1": sem #, sem zeros à esquerda em cada parte. */
function codeKey(code: string): string {
  return code.replace(/^#/, '').split('-').map((part) => String(Number(part))).join('-');
}

export function matchesProduct(p: SearchableProduct, query: string, extra: (string | null | undefined)[] = []): boolean {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const variants = p.variants ?? [];
  const hay = norm([p.name, p.brand, productCode(p), ...extra,
    ...variants.flatMap((v) => [v.sku, v.color, v.size, v.display_code])].filter(Boolean).join(' '));
  const number = productCodeNumber(p);
  const pieceKeys = variants.map((v) => v.display_code).filter((c): c is string => !!c && /^#\d+(-\d+)?$/.test(c)).map(codeKey);

  return tokens.every((tk) => {
    if (/^#?\d+(-\d+)?$/.test(tk)) {
      const key = codeKey(tk);
      const isCode = key.includes('-') ? pieceKeys.includes(key) : number > 0 && Number(key) === number;
      if (isCode) return true;
      if (tk.startsWith('#') || key.includes('-')) return false;
      return variants.some((v) => norm(v.size) === tk || norm(v.sku) === tk);
    }
    return hay.includes(tk.replace(/^#/, ''));
  });
}
