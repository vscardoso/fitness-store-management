import { Keyboard, Platform } from 'react-native';

/**
 * Fecha o teclado e tira o foco do campo que estiver ativo.
 * No app web (iPhone/Android instalado) o `Keyboard.dismiss` do react-native não faz nada: é preciso dar blur no campo.
 */
export function dismissKeyboard() {
  Keyboard.dismiss();
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body && typeof el.blur === 'function') el.blur();
  }
}

/**
 * Ao abrir uma folha/janela: fecha o teclado do campo que ficou ATRÁS dela (ex.: nome do produto), sem mexer em
 * campo da própria janela que abre já focado. Só no app web; no celular nativo o KeyboardAvoidingView cuida disso.
 */
export function dismissKeyboardBehindModal() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  setTimeout(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || typeof el.blur !== 'function') return;
    if (el.closest('[role="dialog"]')) return;
    el.blur();
  }, 60);
}
