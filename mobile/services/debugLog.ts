/**
 * Debug Log Service
 *
 * Envia logs para o backend em tempo real.
 * O backend salva em DEBUG_LOG.txt na raiz do projeto.
 *
 * APENAS EM DESENVOLVIMENTO (__DEV__)
 */

import { API_CONFIG } from '@/constants/Config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  source: string;
  category: string;
  message: string;
  data?: any;
}

// ── Circuit Breaker ──────────────────────────────────────────────────────────
// Evita travar o app quando o backend está inacessível (ex: tunnel caído)
let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;
const MAX_FAILURES = 3;       // Após 3 falhas consecutivas, abre o circuito
const CIRCUIT_COOLDOWN = 30000; // 30s antes de tentar novamente
const LOG_TIMEOUT_MS = 2000;   // Timeout de 2s por requisição de log

/**
 * Fetch com timeout para não bloquear o app
 */
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Envia log para o backend (não bloqueia, fire-and-forget)
 */
async function sendLog(entry: LogEntry): Promise<void> {
  if (!__DEV__) return;

  // Circuit breaker: se aberto, não tenta
  if (Date.now() < _circuitOpenUntil) return;

  try {
    await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/debug/log`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true',
        },
        body: JSON.stringify(entry),
      },
      LOG_TIMEOUT_MS
    );
    // Sucesso: resetar contador de falhas
    _consecutiveFailures = 0;
  } catch {
    // Falha: incrementar contador e abrir circuito se necessário
    _consecutiveFailures++;
    if (_consecutiveFailures >= MAX_FAILURES) {
      _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN;
      console.warn(`⚡ [debugLog] Backend inacessível — pausando logs por ${CIRCUIT_COOLDOWN / 1000}s`);
    }
  }
}

/**
 * Log de debug
 */
export function logDebug(category: string, message: string, data?: any) {
  if (!__DEV__) return;
  console.debug(`⚪ [${category}] ${message}`, data || '');
  sendLog({ level: 'debug', source: 'mobile', category, message, data });
}

/**
 * Log de informação
 */
export function logInfo(category: string, message: string, data?: any) {
  if (!__DEV__) return;
  console.log(`🔵 [${category}] ${message}`, data || '');
  sendLog({ level: 'info', source: 'mobile', category, message, data });
}

/**
 * Log de aviso
 */
export function logWarn(category: string, message: string, data?: any) {
  if (!__DEV__) return;
  console.warn(`🟡 [${category}] ${message}`, data || '');
  sendLog({ level: 'warn', source: 'mobile', category, message, data });
}

/**
 * Log de erro
 */
export function logError(category: string, message: string, error?: any) {
  if (!__DEV__) return;

  const data = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 3) }
    : error;

  console.error(`🔴 [${category}] ${message}`, data || '');
  sendLog({ level: 'error', source: 'mobile', category, message, data });
}

/**
 * Limpa o arquivo de log (nova sessão)
 */
export async function clearLog(): Promise<void> {
  if (!__DEV__) return;

  // Não tenta se circuito aberto
  if (Date.now() < _circuitOpenUntil) return;

  try {
    await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/debug/clear`,
      {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' },
      },
      LOG_TIMEOUT_MS
    );
    console.log('🗑️ Log limpo - nova sessão');
  } catch {
    // Silencioso
  }
}

export default {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  clear: clearLog,
};
