/**
 * Etiqueta do verso da tag (adesivo 50x60 mm) em PDF, gerada no servidor.
 * Web: abre o PDF numa aba (ou baixa, se o navegador bloquear). Celular: grava e abre o compartilhar.
 */
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import api from './api';

export type TagLabelLayout = 'a4' | 'roll';

/** Medidas do adesivo do verso da tag (mm). 6x5 é a etiqueta que a loja usa hoje; 5x6 é a mesma em pé. */
export const STICKER_SIZES = [
  { id: '6x5', name: '6 × 5 cm', note: 'deitada', widthMm: 60, heightMm: 50 },
  { id: '5x6', name: '5 × 6 cm', note: 'em pé', widthMm: 50, heightMm: 60 },
] as const;
export type StickerSize = (typeof STICKER_SIZES)[number];

export interface TagLabelOptions {
  layout: TagLabelLayout;
  startPosition?: number; // só na folha A4: de 1 até o total da folha
  widthMm?: number;
  heightMm?: number;
}

/** Quantos adesivos cabem numa folha A4 (mesma conta do servidor, `a4_grid`): 6x5 = 15, 5x6 = 12. */
export function stickersPerSheet(widthMm: number, heightMm: number): number {
  const cols = Math.max(1, Math.floor((210 - 16 + 4) / (widthMm + 4)));
  const rows = Math.max(1, Math.floor((297 - 16 + 4) / (heightMm + 4)));
  return cols * rows;
}

function sizeBody(options: TagLabelOptions) {
  return {
    layout: options.layout,
    start_position: options.startPosition ?? 1,
    width_mm: options.widthMm ?? 60,
    height_mm: options.heightMm ?? 50,
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
