/**
 * Lógica pura da leitura de códigos (sem React, sem tela): normalizar o texto lido, ignorar leitura repetida,
 * reconhecer leitor tipo teclado (digita rápido e termina com Enter) e achar a peça numa lista já carregada.
 * Testada por `scripts/test-scan-logic.mts` (node scripts/test-scan-logic.mts).
 */

/** Tira quebras de linha, espaços nas pontas e caracteres de controle que alguns leitores mandam. */
export function normalizeScan(raw: string): string {
  return (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

/** Ignora o mesmo código lido de novo dentro da janela (câmera lê o mesmo QR várias vezes por segundo). */
export function createScanGate(windowMs = 1500) {
  let lastCode = '';
  let lastAt = -Infinity;
  return {
    accept(code: string, now: number): boolean {
      const c = normalizeScan(code);
      if (!c) return false;
      if (c === lastCode && now - lastAt < windowMs) return false;
      lastCode = c;
      lastAt = now;
      return true;
    },
    reset() {
      lastCode = '';
      lastAt = -Infinity;
    },
  };
}

/**
 * Leitor USB/Bluetooth que age como teclado: manda os caracteres colados (poucos ms entre eles) e termina com Enter.
 * Digitação humana é bem mais lenta que `maxGapMs` e nunca vira leitura.
 */
export function createWedgeBuffer(opts: { maxGapMs?: number; minLength?: number } = {}) {
  const maxGapMs = opts.maxGapMs ?? 50;
  const minLength = opts.minLength ?? 3;
  let buf = '';
  let lastAt = -Infinity;
  return {
    /** Devolve o código quando a leitura termina (Enter); senão null. */
    feed(key: string, now: number): string | null {
      if (key === 'Enter') {
        const code = buf;
        buf = '';
        lastAt = -Infinity;
        return code.length >= minLength ? normalizeScan(code) : null;
      }
      if (key.length !== 1) return null; // Shift, Tab, setas...
      if (now - lastAt > maxGapMs) buf = ''; // pausa longa: começou outra coisa
      buf += key;
      lastAt = now;
      return null;
    },
    reset() {
      buf = '';
      lastAt = -Infinity;
    },
  };
}

export interface CodedRow {
  variant_id: number;
  sku?: string | null;
  short_code?: number | null;
  display_code?: string | null;
}

/** Chaves de busca de um texto lido, na mesma ordem do servidor: etiqueta (101-1), SKU, código antigo (número). */
export function codeKeys(code: string): string[] {
  const t = normalizeScan(code).toUpperCase();
  if (!t) return [];
  const keys: string[] = [];
  const pair = t.match(/^(?:PV)?#?(\d{1,9})-(\d{1,9})$/);
  if (pair) keys.push(`P:${Number(pair[1])}-${Number(pair[2])}`);
  keys.push(`SKU:${t}`);
  const old = t.match(/^(?:PV)?#?0*(\d{1,9})$/);
  if (old && Number(old[1]) > 0) keys.push(`S:${Number(old[1])}`);
  return keys;
}

/** Índice para achar a peça NA HORA, sem ir ao servidor (a lista da conferência já está no aparelho). */
export function buildCodeIndex(rows: CodedRow[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (const r of rows) {
    if (r.display_code) {
      const pair = r.display_code.toUpperCase().match(/^#?(\d{1,9})-(\d{1,9})$/);
      if (pair) idx.set(`P:${Number(pair[1])}-${Number(pair[2])}`, r.variant_id);
    }
    if (r.sku) idx.set(`SKU:${r.sku.toUpperCase()}`, r.variant_id);
    if (r.short_code) idx.set(`S:${r.short_code}`, r.variant_id);
  }
  return idx;
}

export function findVariantLocal(index: Map<string, number>, code: string): number | null {
  for (const k of codeKeys(code)) {
    const hit = index.get(k);
    if (hit !== undefined) return hit;
  }
  return null;
}
