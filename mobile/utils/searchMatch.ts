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

/** Todas as palavras digitadas precisam começar alguma palavra (ou um código inteiro) da peça. */
export function matchesSearch(index: SearchIndex, query: string): boolean {
  const tokens = normalizeText(query).split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((tk) => index.words.some((w) => w.startsWith(tk)) || index.codes.some((c) => c.startsWith(tk)));
}
