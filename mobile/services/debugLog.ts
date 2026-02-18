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

/**
 * Envia log para o backend (não bloqueia, fire-and-forget)
 */
async function sendLog(entry: LogEntry): Promise<void> {
  if (!__DEV__) return;

  try {
    await fetch(`${API_CONFIG.BASE_URL}/debug/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Silencioso - não queremos logs de logs falhando
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

  try {
    await fetch(`${API_CONFIG.BASE_URL}/debug/clear`, { method: 'POST' });
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
