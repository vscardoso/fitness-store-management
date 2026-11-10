/**
 * Etiqueta do verso da tag (adesivo 6 x 5 cm por padrão, medida livre de 3 a 10 cm) em PDF, gerada no servidor.
 * Web: abre o PDF numa aba (ou baixa, se o navegador bloquear). Celular: grava e abre o compartilhar.
 */
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import api from './api';
import { DEFAULT_STICKER } from '@/utils/stickerSize';

export {
  cmText, customSticker, DEFAULT_STICKER, parseCm, sizeDims, STICKER_MAX_MM, STICKER_MIN_MM, STICKER_SIZES, stickerScale,
  stickersPerSheet, stickersPerThermalSheet, type StickerSize,
} from '@/utils/stickerSize';

export type TagLabelLayout = 'a4' | 'roll' | 'sheet';

export interface TagLabelOptions {
  layout: TagLabelLayout;
  startPosition?: number; // só na folha A4: de 1 até o total da folha
  widthMm?: number;
  heightMm?: number;
}

function sizeBody(options: TagLabelOptions) {
  return {
    layout: options.layout,
    start_position: options.startPosition ?? 1,
    width_mm: options.widthMm ?? DEFAULT_STICKER.widthMm,
    height_mm: options.heightMm ?? DEFAULT_STICKER.heightMm,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

async function detailFromBinary(data: unknown): Promise<string | null> {
  try {
    let text: string | null = null;
    if (typeof Blob !== 'undefined' && data instanceof Blob) text = await data.text();
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    const detail = text ? JSON.parse(text)?.detail : null;
    return typeof detail === 'string' ? detail : null;
  } catch {
    return null; // resposta não era JSON
  }
}

/** Busca o PDF; erro do servidor vira mensagem legível (o corpo vem em binário). */
async function fetchPdf<T>(url: string, body: object, responseType: 'blob' | 'arraybuffer'): Promise<T> {
  const res = await api.post(url, body, {
    responseType,
    headers: { 'X-Loading-Message': 'Gerando etiquetas...' },
    // 401 continua no interceptor (renova o token); o resto tratamos aqui para ler o "detail"
    validateStatus: (status) => status !== 401,
  });
  if (res.status !== 200) {
    const detail = await detailFromBinary(res.data);
    throw new Error(detail || 'Não foi possível gerar o PDF das etiquetas.');
  }
  return res.data as T;
}

async function openPdf(url: string, body: object, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    const data = await fetchPdf<Blob>(url, body, 'blob');
    const href = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
    const win = window.open(href, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
    return;
  }

  const data = await fetchPdf<ArrayBuffer>(url, body, 'arraybuffer');
  const path = `${LegacyFileSystem.cacheDirectory}${filename}`;
  await LegacyFileSystem.writeAsStringAsync(path, arrayBufferToBase64(data), { encoding: 'base64' as any });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartilhamento não disponível neste aparelho.');
  }
  await Sharing.shareAsync(path, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Etiquetas' });
}

/** O que aconteceu ao entregar o PDF: compartilhado, aberto/baixado, a pessoa fechou, ou o iPhone exigiu um toque novo. */
export type PdfDelivery = 'shared' | 'opened' | 'cancelled' | 'blocked';

/** open = abre o PDF no visualizador do navegador (dali o compartilhar manda o PDF de verdade); share = manda o arquivo direto para outro app. */
export type PdfMode = 'open' | 'share';

export interface PrintedPdf {
  filename: string;
  /** Link https do PDF (assinado, vale 24 horas). Nunca um endereço blob: do navegador. */
  url: string;
  /** Entrega o PDF (de novo). Chamar de dentro de um toque: o iPhone só abre janela e compartilhar assim. */
  deliver: (mode?: PdfMode) => Promise<PdfDelivery>;
}

/**
 * PDF a partir do link https do servidor. Abrir um endereço blob: do navegador e compartilhar mandava para o WhatsApp o TEXTO
 * "blob:https://app..." (só existe no aparelho); com o link https o visualizador do iPhone compartilha o arquivo PDF.
 */
export function pdfFromUrl(url: string, filename: string): PrintedPdf {
  if (Platform.OS === 'web') {
    let cached: Blob | null = null;   // o 2º toque em "compartilhar" já usa o arquivo baixado (o iPhone exige um toque novo)
    const deliver = async (mode: PdfMode = 'open'): Promise<PdfDelivery> => {
      if (mode === 'share') {
        try {
          if (!cached) cached = await (await fetch(url)).blob();
          const file = new File([cached], filename, { type: 'application/pdf' });
          const nav: any = navigator;
          if (nav.canShare && nav.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(nav.userAgent || '')) {
            await nav.share({ files: [file], title: 'Etiquetas' });
            return 'shared';
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') return 'cancelled';      // a pessoa fechou o compartilhar
          if (e?.name === 'NotAllowedError') return 'blocked';   // passou o tempo do toque: precisa de um toque novo
        }
      }
      const win = window.open(url, '_blank');
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return 'opened';
    };
    return { filename, url, deliver };
  }

  const deliver = async (_mode: PdfMode = 'open'): Promise<PdfDelivery> => {
    const path = `${LegacyFileSystem.cacheDirectory}${filename}`;
    await LegacyFileSystem.downloadAsync(url, path);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento não disponível neste aparelho.');
    await Sharing.shareAsync(path, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Etiquetas' });
    return 'shared';
  };
  return { filename, url, deliver };
}

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
  return pdfFromUrl(data.url, data.filename);
}

/** PDF com as etiquetas das peças escolhidas (variante x quantidade). */
export async function printTagLabels(
  items: { variantId: number; quantity: number }[],
  options: TagLabelOptions,
): Promise<void> {
  const body = {
    items: items.filter((i) => i.quantity > 0).map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    ...sizeBody(options),
  };
  const total = body.items.reduce((sum, i) => sum + i.quantity, 0);
  const tag = options.layout === 'roll' ? 'grafica' : 'folha-a4';
  await openPdf('/labels/pdf', body, `etiquetas-${body.width_mm}x${body.height_mm}-${tag}-${total}un.pdf`);
}

/** PDF com uma etiqueta por peça recebida na entrada. */
export async function printEntryTagLabels(entryId: number, options: TagLabelOptions): Promise<void> {
  const body = sizeBody(options);
  await openPdf(`/labels/pdf/entry/${entryId}`, body, `etiquetas-entrada-${entryId}.pdf`);
}
