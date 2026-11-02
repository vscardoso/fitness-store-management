/**
 * Quanto do rodapé o teclado cobre no app web. No iPhone o teclado não diminui a janela, só a área visível
 * (visualViewport), e a barra de campos do iOS (setas e visto) flutua por cima do teclado sem entrar nessa conta:
 * sem a folga dela o campo de texto fica escondido atrás da barra.
 */
// Medido no print do iPhone (2026-11-02): a faixa da barra vai de 482 a 544 pt, ~62 pt; 48 deixava a borda do campo por baixo.
export const IOS_ACCESSORY_BAR = 64;

export function computeKeyboardInset(innerHeight: number, vvHeight: number, vvOffsetTop: number, iosWeb: boolean): number {
  const covered = Math.round(innerHeight - vvHeight - vvOffsetTop);
  if (covered <= 80) return 0;   // barra de endereço ou pequena variação: não é teclado
  return covered + (iosWeb ? IOS_ACCESSORY_BAR : 0);
}

export function isIosWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
}
