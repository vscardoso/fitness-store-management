/**
 * Endereço só de vitrine (loja.provadorfit.com.br/{slug}/{id}): quem abre por ele nunca vê o sistema da lojista
 * (login, menus, barra lateral). O mesmo app web serve os dois endereços; aqui só se lê o endereço.
 * Teste: node scripts/test-vitrine-url.mts
 */
export interface VitrineRoute {
  slug: string | null;
  id: string | null;
}

/** Host de vitrine: começa com "loja." (produção) ou "loja.localhost" (teste local). */
export function isVitrineHost(hostname: string): boolean {
  return /^loja\./i.test(hostname || '');
}

/** "/wa-fitness-1/96" -> { slug: "wa-fitness-1", id: "96" }; caminho incompleto ou estranho -> campos nulos. */
export function parseVitrinePath(pathname: string): VitrineRoute {
  const parts = (pathname || '').split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return '';
    }
  });
  const slug = parts[0] && /^[a-z0-9][a-z0-9-]{0,80}$/i.test(parts[0]) ? parts[0] : null;
  const id = parts[1] && /^\d{1,10}$/.test(parts[1]) ? parts[1] : null;
  return { slug, id };
}

/** Rota de vitrine se o app foi aberto pelo endereço de vitrine; senão null (segue o app normal). */
export function vitrineFromLocation(): VitrineRoute | null {
  if (typeof window === 'undefined' || !window.location) return null;
  if (!isVitrineHost(window.location.hostname)) return null;
  return parseVitrinePath(window.location.pathname);
}
