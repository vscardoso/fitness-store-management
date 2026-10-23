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
