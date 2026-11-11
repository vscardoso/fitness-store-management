/**
 * Busca por início de palavra: filtra já no primeiro caractere (letra ou número) e vai afinando a cada toque.
 * "p" acha "Preto" e "P", mas não "Top" nem "Legging"; "pre mi" acha "Preto / M" do produto "Mini ...".
 * Sem acento e sem diferenciar maiúscula. Código da peça: "#101-1", "101-1", "101" e "0165" funcionam (o # é opcional).
 */
export function normalizeText(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Palavras de um texto: quebra em tudo que não é letra ou número. "Blusa De Frio" vira [blusa, de, frio]. */
function words(t: string): string[] {
  return normalizeText(t).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Texto de busca de uma peça já preparado (faça uma vez por linha, não a cada toque). */
export interface SearchIndex {
  words: string[];
  /** Códigos inteiros (sku, #101-1) sem o # e sem espaço, para "101-1" casar com o código completo */
  codes: string[];
}

export function buildSearchIndex(text: string[], codes: (string | null | undefined)[] = []): SearchIndex {
  const w: string[] = [];
  text.forEach((t) => w.push(...words(t)));
  const c: string[] = [];
  codes.forEach((code) => {
    if (!code) return;
    const n = normalizeText(code).replace(/^#/, '').replace(/\s+/g, '');
    c.push(n);
    w.push(...words(code));
  });
  return { words: w, codes: c };
}

/** "043-01" -> "43-1": sem zeros à esquerda em cada parte (o código digitado "43" acha a etiqueta "#043-1"). */
function codeKey(code: string): string {
  return code.split('-').map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p)).join('-');
}

/** Palavras de ligação que a pessoa digita mas que não ajudam a achar a peça. */
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em']);

/** Palavras da busca sem as de ligação ("conjunto M de meia" -> conjunto, m, meia). Só ligação digitada: usa elas mesmas. */
export function searchTokens(query: string): string[] {
  const all = normalizeText(query).split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return meaningful.length ? meaningful : all;
}

/** Todas as palavras digitadas precisam começar alguma palavra (ou um código inteiro) da peça. */
export function matchesSearch(index: SearchIndex, query: string): boolean {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  return tokens.every((tk) => {
    if (index.words.some((w) => w.startsWith(tk)) || index.codes.some((c) => c.startsWith(tk))) return true;
    // código digitado sem os zeros: "43" acha "043-1" (o produto) e "43-1" acha a peça
    if (/^\d+(-\d+)?$/.test(tk)) {
      const key = codeKey(tk);
      return index.codes.some((c) => {
        if (!/^\d+(-\d+)?$/.test(c)) return false;
        const ck = codeKey(c);
        return key.includes('-') ? ck === key : ck.split('-')[0] === key;
      });
    }
    return false;
  });
}

// ── Busca de produto no PDV: por palavras, olhando nome, marca, material, cor, tamanho e código da peça ──
// "conjunto M de meia" acha o conjunto de meia no tamanho M, e só as variações que combinam aparecem.

export interface SearchableVariant {
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  display_code?: string | null;
  short_code?: number | string | null;
}

export interface SearchableProduct<V extends SearchableVariant = SearchableVariant> {
  name: string;
  brand?: string | null;
  material?: string | null;
  variants: V[];
}

/**
 * Produtos que combinam com o que foi digitado, cada um só com as variações que combinam.
 * Sem texto: devolve tudo como veio. As palavras do produto valem para todas as variações; as de cor, tamanho e código
 * restringem as variações.
 */
export function filterProductsBySearch<V extends SearchableVariant, P extends SearchableProduct<V>>(products: P[], query: string): P[] {
  if (!query.trim()) return products;
  const tokens = searchTokens(query);
  const out: P[] = [];
  for (const p of products) {
    const base = buildSearchIndex([p.name, p.brand ?? '', p.material ?? '']);
    const idx = (p.variants ?? []).map((v) => ({
      v, own: buildSearchIndex([v.color ?? '', v.size ?? ''], [v.sku, v.display_code, v.short_code != null ? String(v.short_code) : null]),
    }));
    let keep = idx;
    let ok = true;
    for (const tk of tokens) {
      const hits = keep.filter((x) => matchesSearch(x.own, tk));
      if (hits.length) { keep = hits; continue; }          // bate com cor, tamanho ou código: restringe as variações ("M" -> só as M)
      if (!matchesSearch(base, tk)) { ok = false; break; }   // só bate com o nome/marca: vale para o produto todo
    }
    if (ok && keep.length) out.push({ ...p, variants: keep.map((x) => x.v) });
  }
  return out;
}
