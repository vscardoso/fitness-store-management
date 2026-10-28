/**
 * Estado do sistema para a pessoa que está usando: quando a API some (reinício da publicação, sinal fraco),
 * em vez de erros soltos o app mostra uma tela única "atualizando" e volta sozinho quando o servidor responde.
 *
 * Ninguém precisa decidir nada: cada aparelho confere sozinho se a API voltou (a cada 3 s) e retoma de onde estava.
 * Funciona igual para 1 ou 50 pessoas ao mesmo tempo, porque não depende de ninguém clicar.
 *
 * Uma falha isolada (uma rota com erro) não liga a tela: só liga se o endereço de saúde (/health) também não responde.
 */
import { API_CONFIG } from '@/constants/Config';

export type SystemState = 'ok' | 'updating' | 'offline' | 'slow';

const PROBE_EVERY_MS = 3000;
const PROBE_TIMEOUT_MS = 4000;
const SLOW_AFTER_MS = 150_000;

let state: SystemState = 'ok';
let probing = false;
let downSince = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(s: SystemState) => void>();
const recovered = new Set<() => void>();

const healthUrl = () => API_CONFIG.BASE_URL.replace(/\/api\/v1\/?$/, '') + '/health';

function set(next: SystemState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l(state));
}

export const getSystemState = () => state;

export function onSystemState(fn: (s: SystemState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Quem quiser reagir à volta do servidor (ex.: atualizar as telas). */
export function onSystemRecovered(fn: () => void): () => void {
  recovered.add(fn);
  return () => {
    recovered.delete(fn);
  };
}

async function ping(): Promise<boolean> {
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctrl?.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(healthUrl() + '?t=' + Date.now(), { cache: 'no-store', signal: ctrl?.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function loop() {
  const ok = await ping();
  if (ok) {
    const wasDown = state !== 'ok';
    probing = false;
    downSince = 0;
    set('ok');
    if (wasDown) recovered.forEach((fn) => fn());
    return;
  }
  if (!downSince) downSince = Date.now();
  const offline = typeof navigator !== 'undefined' && (navigator as any).onLine === false;
  set(offline ? 'offline' : Date.now() - downSince > SLOW_AFTER_MS ? 'slow' : 'updating');
  timer = setTimeout(loop, PROBE_EVERY_MS);
}

/** Chamado quando uma chamada à API falha por rede ou 502/503/504. Confere o /health antes de mostrar qualquer tela. */
export function reportApiFailure() {
  if (probing) return;
  probing = true;
  loop();
}

/** Botão "Tentar agora" da tela. */
export function retryNow() {
  if (timer) clearTimeout(timer);
  probing = true;
  loop();
}
