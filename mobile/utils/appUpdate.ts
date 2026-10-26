/**
 * Decisão de atualização do app web (PWA), sem depender de tela: fácil de testar.
 * - `current`: versão carregada no aparelho (window.__APP_BUILD__);
 * - `remote`: versão publicada hoje (/version.json).
 */
export const AUTO_RELOAD_AFTER_HIDDEN_MS = 60_000;

export function hasNewVersion(current: string | undefined | null, remote: string | undefined | null): boolean {
  if (!current || !remote) return false; // sem informação (dev, rede fora): não incomoda
  return current !== remote;
}

/**
 * Recarrega sozinho só quando o app voltou de ficar escondido por um tempo (ninguém está digitando);
 * com o app em uso, só mostra o aviso e deixa a pessoa escolher o momento.
 */
export function shouldAutoReload(updateAvailable: boolean, hiddenForMs: number): boolean {
  return updateAvailable && hiddenForMs >= AUTO_RELOAD_AFTER_HIDDEN_MS;
}

/** Sem mexer no app por este tempo (toque, tecla ou digitação), a versão nova pode entrar sozinha. */
export const IDLE_BEFORE_RELOAD_MS = 30_000;
export const IDLE_CHECK_EVERY_MS = 15_000;

/** Telas em que se perde trabalho se a página recarregar: nunca atualiza sozinho nelas, só mostra o aviso. */
const PROTECTED_PATH_PARTS = [
  'pdv', 'checkout', 'payment', 'wizard', 'add', 'edit', 'create', 'new', 'login', 'signup', 'cadastro', 'aceite-termos', 'conferencia', 'stock-check',
];

export interface IdleState {
  /** Gravações do React Query em andamento. */
  mutating: number;
  /** Chamadas à API em andamento (as que mostram carregamento). */
  requests: number;
  /** Quanto tempo desde o último toque/tecla/digitação. */
  msSinceInput: number;
  /** Caminho atual do app, ex.: '/entries/12'. */
  pathname: string;
  /** Há um campo de texto com o cursor (alguém digitando). */
  typing: boolean;
  /** App na tela (não escondido). */
  visible: boolean;
}

export function isProtectedPath(pathname: string): boolean {
  const parts = pathname.toLowerCase().split('/').filter(Boolean);
  return parts.some((p) => PROTECTED_PATH_PARTS.includes(p));
}

/**
 * O app só se atualiza sozinho quando não há nada sendo gravado, ninguém está digitando, a pessoa parou
 * de mexer há um tempo e a tela aberta não é de venda, cadastro ou edição. Fora isso, fica o aviso.
 */
export function canReloadNow(state: IdleState): boolean {
  return (
    state.visible &&
    state.mutating === 0 &&
    state.requests === 0 &&
    !state.typing &&
    state.msSinceInput >= IDLE_BEFORE_RELOAD_MS &&
    !isProtectedPath(state.pathname)
  );
}
