/**
 * Medidas do adesivo do verso da tag (mm) e contas puras usadas pelo Estúdio e pela prévia (sem rede).
 * Teste: node scripts/test-sticker-size.mts
 */
export interface StickerSize { id: string; name: string; note: string; widthMm: number; heightMm: number }

// 6 x 5 cm é a etiqueta que a W.A compra (2026-11-02); as outras ficam para quem já tem
export const STICKER_SIZES: StickerSize[] = [
  { id: '60x50', name: '6 × 5 cm', note: 'deitada', widthMm: 60, heightMm: 50 },
  { id: '50x60', name: '5 × 6 cm', note: 'em pé', widthMm: 50, heightMm: 60 },
  { id: '65x55', name: '6,5 × 5,5 cm', note: 'deitada', widthMm: 65, heightMm: 55 },
  { id: '55x65', name: '5,5 × 6,5 cm', note: 'em pé', widthMm: 55, heightMm: 65 },
];
export const DEFAULT_STICKER = STICKER_SIZES[0];
// mesmos limites do servidor (label_pdf_service.MIN_MM / MAX_MM)
export const STICKER_MIN_MM = 30;
export const STICKER_MAX_MM = 100;

/** Fator das letras e do QR (igual ao `scale_for` do servidor): 1 com o lado menor de 50 mm. */
export function stickerScale(widthMm: number, heightMm: number): number {
  return Math.max(0.6, Math.min(1.6, Math.min(widthMm, heightMm) / 50));
}

/** "6,5" ou "6.5" (cm) -> 65 (mm); fora de 3 a 10 cm ou texto inválido -> null */
export function parseCm(text: string): number | null {
  const v = Number(String(text).trim().replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const mm = Math.round(v * 10);
  return mm >= STICKER_MIN_MM && mm <= STICKER_MAX_MM ? mm : null;
}

/** 65 -> "6,5"; 60 -> "6" */
export function cmText(mm: number): string {
  return String(mm / 10).replace('.', ',');
}

export function customSticker(widthMm: number, heightMm: number): StickerSize {
  return {
    id: 'custom', name: `${cmText(widthMm)} × ${cmText(heightMm)} cm`,
    note: widthMm >= heightMm ? 'deitada' : 'em pé', widthMm, heightMm,
  };
}

/** Quantos adesivos cabem numa folha A4 (mesma conta do servidor, `a4_grid`): 60x50 = 15, 50x60 = 12, 65x55 = 8. */
export function stickersPerSheet(widthMm: number, heightMm: number): number {
  const cols = Math.max(1, Math.floor((210 - 16 + 4) / (widthMm + 4)));
  const rows = Math.max(1, Math.floor((297 - 16 + 4) / (heightMm + 4)));
  return cols * rows;
}
