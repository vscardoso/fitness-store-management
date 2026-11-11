/**
 * Regras da sessão (puras, sem rede nem armazenamento: testadas em scripts/test-session-rules.mts).
 *
 * Contexto (10/11/2026): a dona da loja era derrubada várias vezes por hora. A renovação da sessão falhava por motivos que NÃO
 * significam "sessão acabou" (duas abas renovando juntas, limite de pedidos 429, rede) e o app apagava os tokens mesmo assim,
 * inclusive os da sessão nova que ela acabara de abrir.
 */

/** Sem nenhum toque do usuário por este tempo, a sessão acaba (regra do Victor: 2 horas de inatividade). */
export const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000;

/** Frase na tela de login quando a sessão acaba por falta de uso. */
export const IDLE_REASON = 'Sessão encerrada: ficou 2 horas sem uso. Entre de novo.';

/** Tentativas de renovar a sessão antes de desistir sem derrubá-la. */
export const REFRESH_ATTEMPTS = 3;

/** Passou o limite sem uso? `lastActivity` vazio ou inválido nunca derruba (sessão anterior a este controle). */
export const isIdleExpired = (now: number, lastActivity: number | null | undefined, limitMs: number = IDLE_LIMIT_MS): boolean =>
  typeof lastActivity === 'number' && Number.isFinite(lastActivity) && lastActivity > 0 && now - lastActivity > limitMs;

export type RefreshFailure = 'definitive' | 'transient';

/**
 * O que a falha da renovação significa. Só o servidor dizendo que o token não vale (400, 401, 403) encerra a sessão; limite de
 * pedidos (429), erro do servidor (5xx), rede e qualquer outra coisa são passageiros: a sessão continua e o pedido falha.
 */
export const refreshFailureKind = (status?: number | null): RefreshFailure =>
  status === 400 || status === 401 || status === 403 ? 'definitive' : 'transient';

/** Espera antes da próxima tentativa (ms): respeita `Retry-After` (segundos, no máximo 5) ou cresce 1 s, 2 s, 4 s. */
export const refreshRetryDelayMs = (attempt: number, retryAfter?: string | number | null): number => {
  const secs = typeof retryAfter === 'string' ? parseFloat(retryAfter) : retryAfter;
  if (typeof secs === 'number' && Number.isFinite(secs) && secs > 0) return Math.min(secs, 5) * 1000;
  return Math.min(1000 * 2 ** Math.max(0, attempt), 4000);
};

/**
 * O pedido que acabou de dar 401 foi enviado com um token que NÃO é mais o guardado? Então outra aba renovou ou a pessoa entrou
 * de novo no meio do caminho: o certo é repetir o pedido com o token de agora, não renovar nem derrubar nada.
 */
export const sentTokenIsStale = (sentAuthorization: unknown, currentAccessToken: string | null | undefined): boolean =>
  typeof sentAuthorization === 'string' && !!currentAccessToken && sentAuthorization !== `Bearer ${currentAccessToken}`;
