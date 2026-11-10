/**
 * Etiquetas só das peças que acabaram de ser lançadas numa entrada.
 * Vai no endereço da tela de etiquetas como "variação:quantidade,variação:quantidade" (ex.: "12:3,15:2").
 */
export interface LaunchedLine {
  variantId: number;
  quantity: number;
}

/** Junta linhas repetidas da mesma variação e descarta o que não é número válido. */
export function mergeLaunched(lines: LaunchedLine[]): LaunchedLine[] {
  const sum = new Map<number, number>();
  for (const l of lines) {
    const id = Number(l.variantId);
    const q = Math.floor(Number(l.quantity));
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(q) || q <= 0) continue;
    sum.set(id, (sum.get(id) ?? 0) + q);
  }
  return [...sum.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}

export function encodeLaunched(lines: LaunchedLine[]): string {
  return mergeLaunched(lines).map((l) => `${l.variantId}:${l.quantity}`).join(',');
}

export function decodeLaunched(raw?: string | string[] | null): LaunchedLine[] {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text) return [];
  return mergeLaunched(
    text.split(',').map((part) => {
      const [id, qty] = part.split(':');
      return { variantId: Number(id), quantity: Number(qty) };
    }),
  );
}
