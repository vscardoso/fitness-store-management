/**
 * Lembra a última tela aberta (só no app web) para voltar a ela depois de recarregar ou de o iPhone fechar o app.
 * Sem isso o app instalado sempre reabre no início e a lojista perde onde estava.
 */
import { Platform } from 'react-native';

const KEY = '@provador:ultima_tela';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Telas a que nunca se volta sozinho: entrada, apresentação, termos e a própria raiz. */
const SKIP = ['/', '/(auth)', '/login', '/onboarding', '/signup', '/aceite-termos', '/termos', '/privacidade', '/index'];

export function isRestorable(path: string): boolean {
  if (!path || SKIP.includes(path)) return false;
  return !/^\/(\(auth\)|login|onboarding|signup|aceite-termos|termos|privacidade)(\/|$|\?)/.test(path);
}

export function saveLastRoute(path: string): void {
  if (Platform.OS !== 'web' || !isRestorable(path)) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // armazenamento bloqueado (aba privada): sem lembrar, nada quebra
  }
}

export function getLastRoute(): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw);
    if (typeof path !== 'string' || Date.now() - Number(at) > MAX_AGE_MS || !isRestorable(path)) return null;
    return path;
  } catch {
    return null;
  }
}

export function clearLastRoute(): void {
  if (Platform.OS !== 'web') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}
