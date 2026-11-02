/**
 * Conta do teclado no app web. Medido no iPhone instalado (2026-11-02, iOS com tela de 956): com o teclado aberto
 * `innerHeight` = `visualViewport.height` = 541, que já termina ACIMA da barra de setas e visto. Ou seja, a área visível
 * já desconta o teclado e a barra; não há folga extra a somar.
 *
 * No app instalado (PWA) o `pwa-boot` encolhe o app inteiro para essa área visível (`--app-h`), então o rodapé já fica
 * acima do teclado e nenhuma tela deve somar o teclado de novo (`appSized`). No Safari comum e no Android o app não
 * encolhe: aí o rodapé sobe pela área coberta.
 */

// Diferença entre a tela e a área visível acima da qual consideramos o teclado aberto (barras do Safari mudam ~80 px)
export const KEYBOARD_MIN = 120;

export function computeKeyboardInset(innerHeight: number, vvHeight: number, vvOffsetTop: number, appSized: boolean): number {
  if (appSized) return 0;
  const covered = Math.round(innerHeight - vvHeight - vvOffsetTop);
  return covered <= 80 ? 0 : covered;   // barra de endereço ou pequena variação: não é teclado
}

export function isKeyboardOpen(screenHeight: number, vvHeight: number): boolean {
  return screenHeight - vvHeight > KEYBOARD_MIN;
}

/** App aberto pelo ícone da tela de início (PWA instalado), onde o `pwa-boot` ajusta a altura com o teclado. */
export function isInstalledWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
}
