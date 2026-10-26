/** Código curto da peça impresso na etiqueta: 123 -> "#0123" (QR leva "PV#0123"). */
export function formatShortCode(code?: number | null): string | null {
  if (code == null) return null;
  return `#${String(code).padStart(4, '0')}`;
}

/** Aceita "PV#0123", "#0123", "0123" ou "123" e devolve o número (ou null). */
export function parseShortCode(text: string): number | null {
  const m = text.trim().toUpperCase().match(/^(?:PV)?#?0*(\d{1,9})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}
