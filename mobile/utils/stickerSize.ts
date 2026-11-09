/**
 * Medidas do adesivo do verso da tag (mm) e contas puras usadas pelo Estúdio e pela prévia (sem rede).
 * Teste: node scripts/test-sticker-size.mts
 */
export interface StickerSize { id: string; name: string; note: string; widthMm: number; heightMm: number }

// a tag da W.A tem 5 x 4,5 cm; o padrão é 4,7 x 4,2 para sobrar borda na colagem (Victor, 05/11/2026); as outras ficam para quem já tem
export const STICKER_SIZES: StickerSize[] = [
  { id: '47x42', name: '4,7 × 4,2 cm', note: 'para a tag de 5 × 4,5', widthMm: 47, heightMm: 42 },
  { id: '50x45', name: '5 × 4,5 cm', note: '', widthMm: 50, heightMm: 45 },
  { id: '60x50', name: '6 × 5 cm', note: '', widthMm: 60, heightMm: 50 },
  { id: '50x60', name: '5 × 6 cm', note: '', widthMm: 50, heightMm: 60 },
  { id: '65x55', name: '6,5 × 5,5 cm', note: '', widthMm: 65, heightMm: 55 },
  { id: '55x65', name: '5,5 × 6,5 cm', note: '', widthMm: 55, heightMm: 65 },
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
    id: 'custom', name: `${cmText(widthMm)} × ${cmText(heightMm)} cm`, note: '', widthMm, heightMm,
  };
}

/** "4,7 de largura × 4,2 de altura": deixa claro que a largura vem primeiro */
export function sizeDims(widthMm: number, heightMm: number): string {
  return `${cmText(widthMm)} de largura × ${cmText(heightMm)} de altura`;
}

const A4_GAP_MM = 2; // espaço mínimo entre etiquetas no corte (igual ao servidor)

/** Quantos adesivos cabem numa folha A4 (mesma conta do servidor, `a4_grid`: borda 5 mm e no mínimo 2 mm entre elas): 47x42 = 24, 50x45 = 18, 60x50 = 15, 50x60 = 12, 65x55 = 15. */
/** Folha térmica de 10 x 15 cm (igual ao servidor, `sheet_grid`: borda 1,5 mm, 2 mm entre etiquetas): 47x42 = 6, 60x50 = 2. */
export function stickersPerThermalSheet(widthMm: number, heightMm: number): number {
  const cols = Math.floor((100 - 3 + 2) / (widthMm + 2));
  const rows = Math.floor((150 - 3 + 2) / (heightMm + 2));
  return Math.max(0, cols) * Math.max(0, rows);
}

export function stickersPerSheet(widthMm: number, heightMm: number): number {
  const cols = Math.max(1, Math.floor((210 - 10 + A4_GAP_MM) / (widthMm + A4_GAP_MM)));
  const rows = Math.max(1, Math.floor((297 - 10 + A4_GAP_MM) / (heightMm + A4_GAP_MM)));
  return cols * rows;
}
