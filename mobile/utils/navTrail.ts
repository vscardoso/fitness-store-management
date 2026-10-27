/**
 * Trilha de navegação: as últimas telas e gestos (voltar do iPhone, travas de "cadastro concluído") ficam
 * guardados na memória e, quando uma trava age ou algo estranho acontece, seguem para o registro do servidor
 * (`POST /client-logs`, nível info). O trace de desenvolvimento (`debugLog`) só existe em __DEV__; no app que a
 * lojista usa nada era gravado, e "voltou para a tela errada" ficava sem pista.
 *
 * Ler no VPS: select created_at, path, message, detail from error_logs where error_type='client' and level='info'
 * order by id desc limit 20  (a trilha vem em `detail.trilha`, da mais antiga para a mais nova).
 */
import { Platform } from 'react-native';

interface TrailEntry {
  /** milissegundos desde a abertura do app */
  t: number;
  e: string;
  d?: Record<string, unknown>;
}

const MAX = 40;
const opened = Date.now();
let trail: TrailEntry[] = [];
let lastSentAt = 0;
let currentRoute = '';

export function trailMark(event: string, data?: Record<string, unknown>): void {
  trail.push({ t: Date.now() - opened, e: event, ...(data ? { d: data } : {}) });
  if (trail.length > MAX) trail = trail.slice(-MAX);
}

export function trailRoute(pathname: string): void {
  if (pathname === currentRoute) return;
  currentRoute = pathname;
  trailMark('rota', { p: pathname });
}

/** Manda a trilha ao servidor (no máximo 1 por 10 s; nunca derruba a tela, erro de rede é ignorado). */
export async function trailReport(reason: string, data?: Record<string, unknown>): Promise<void> {
  trailMark(reason, data);
  const now = Date.now();
  if (now - lastSentAt < 10_000) return;
  lastSentAt = now;
  try {
    const { default: api } = await import('@/services/api');
    await api.post(
      '/client-logs',
      {
        message: `Navegação: ${reason}`,
        level: 'info',
        route: currentRoute || undefined,
        context: { trilha: trail.slice(-MAX), plataforma: Platform.OS },
      },
      { headers: { 'X-Skip-Loading': 'true' } },
    );
  } catch {
    // sem rede ou sem sessão: a trilha continua na memória para o próximo aviso
  }
}

/** No navegador/PWA, registra os gestos de voltar/avançar do histórico (o arrastar do iPhone dispara popstate). */
export function startHistoryTrail(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  const onPop = () => trailMark('popstate', { url: window.location.pathname + window.location.search.slice(0, 80) });
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}
