/**
 * Última vez que a pessoa mexeu no app (toque, clique, tecla, leitor de código). A sessão só acaba por INATIVIDADE (2 horas),
 * nunca com a pessoa usando. Os pedidos em segundo plano (alertas, contadores) NÃO contam como uso: só gesto de verdade.
 *
 * Guardado no aparelho para valer entre abas e ao reabrir o app. Se o armazenamento falhar, vale o que está na memória e,
 * sem nenhum dado, a sessão não é derrubada (fail-open).
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IDLE_LIMIT_MS, isIdleExpired } from '@/utils/sessionRules';

const KEY = '@fitness_store:last_activity';
const WRITE_EVERY_MS = 15_000;
const CACHE_MS = 10_000;

let lastInMemory = 0;
let lastWrite = 0;
let cachedAt = 0;
let cachedStored = 0;

/** Registra que a pessoa está usando o app agora (barato: grava no máximo a cada 15 s). */
export const markActivity = (): void => {
  const now = Date.now();
  lastInMemory = now;
  if (now - lastWrite < WRITE_EVERY_MS) return;
  lastWrite = now;
  AsyncStorage.setItem(KEY, String(now)).catch(() => {});
};

/** Zera a contagem (login e cadastro novos): começa a valer a partir de agora. */
export const resetActivity = (): void => {
  lastWrite = 0;
  cachedAt = 0;
  markActivity();
};

const readStored = async (): Promise<number> => {
  const now = Date.now();
  if (now - cachedAt < CACHE_MS) return cachedStored;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cachedStored = raw ? Number(raw) || 0 : 0;
  } catch {
    cachedStored = 0;
  }
  cachedAt = now;
  return cachedStored;
};

/** Momento do último uso (0 = nunca registrado). Outra aba também conta: vale o mais recente. */
export const getLastActivity = async (): Promise<number> => Math.max(lastInMemory, await readStored());

/** Passou o prazo de inatividade? Sessão sem nenhum registro (anterior a este controle) começa a contar agora. */
export const isSessionIdle = async (): Promise<boolean> => {
  const last = await getLastActivity();
  if (!last) {
    markActivity();
    return false;
  }
  return isIdleExpired(Date.now(), last, IDLE_LIMIT_MS);
};

let tracking = false;

/** Liga a escuta de gestos no app web. No celular o toque é registrado pelo `onTouchStart` da raiz (ver `_layout.tsx`). */
export const startActivityTracking = (): (() => void) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || tracking) return () => {};
  tracking = true;
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  const handler = () => markActivity();
  events.forEach((e) => document.addEventListener(e, handler, { capture: true, passive: true }));
  return () => {
    events.forEach((e) => document.removeEventListener(e, handler, { capture: true } as EventListenerOptions));
    tracking = false;
  };
};
