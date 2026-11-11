/**
 * Etiqueta do verso da tag (adesivo 5 x 4 cm por padrão, medida livre de 3 a 10 cm) em PDF, gerada no servidor.
 * A ENTREGA do PDF (abrir, compartilhar, baixar) é do `pdfDelivery.ts`, igual para todo PDF do app.
 */
import api from './api';
import { pdfFromUrl, type PrintedPdf } from './pdfDelivery';

export {
  cmText, customSticker, DEFAULT_STICKER, parseCm, sizeDims, STICKER_MAX_MM, STICKER_MIN_MM, STICKER_SIZES, stickerScale,
  stickersPerSheet, stickersPerThermalSheet, type StickerSize,
} from '@/utils/stickerSize';
export { pdfFromUrl, type PdfDelivery, type PdfMode, type PrintedPdf } from './pdfDelivery';

export type TagLabelLayout = 'a4' | 'roll' | 'sheet';

/**
 * Salva a impressão (tira da fila e anda a folha) e devolve o link https do PDF, numa chamada só do servidor: gerar = imprimir.
 * Nada é gravado se o PDF falhar ou se a fila mudou (outra pessoa imprimiu): o servidor responde com a frase do motivo.
 */
export async function printLabelsSaved(input: {
  items: { variantId: number; quantity: number }[];
  layout: TagLabelLayout;
  startPosition: number;
  widthMm: number;
  heightMm: number;
  fromQueue: boolean;
  entryId?: number | null;
}): Promise<PrintedPdf> {
  const body = {
    items: input.items.filter((i) => i.quantity > 0).map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    layout: input.layout,
    start_position: input.layout === 'roll' ? 1 : input.startPosition,
    width_mm: input.widthMm,
    height_mm: input.heightMm,
    from_queue: input.fromQueue,
    entry_id: input.entryId ?? null,
  };
  const { data } = await api.post<{ url: string; filename: string }>('/labels/prints/pdf', body, {
    headers: { 'X-Loading-Message': 'Gerando etiquetas...' },
  });
  return pdfFromUrl(data.url, data.filename, 'Etiquetas');
}
