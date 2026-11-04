/**
 * Rotas da ajuda (puro, testado em node por scripts/test-help-coverage.mts).
 * O expo-router tira da URL os grupos "(tabs)" e "(auth)" e o "index"; a ajuda usa a mesma forma: '/sales/[id]'.
 */

/** Arquivo de app/ (ex.: "(tabs)/sales/index.tsx") para a rota como o navegador mostra ("/sales"). */
export function routeFromFile(file: string): string {
  const parts = file
    .replace(/\\/g, '/')
    .replace(/\.tsx?$/, '')
    .split('/')
    .filter((p) => p && !/^\(.*\)$/.test(p));
  if (parts[parts.length - 1] === 'index') parts.pop();
  return '/' + parts.join('/');
}

/** A rota de ajuda casa com o endereço atual? "[id]" casa com qualquer trecho; barra final é ignorada. */
export function routeMatches(pattern: string, pathname: string): boolean {
  const a = pattern.split('/').filter(Boolean);
  const b = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => /^\[[^\]]+\]$/.test(seg) || seg === decodeURIComponent(b[i]));
}

/** Rota fixa vence rota com "[id]" (ex.: '/conditional/create' antes de '/conditional/[id]'). */
export function routeSpecificity(pattern: string): number {
  return pattern.split('/').filter((s) => s && !s.startsWith('[')).length;
}
