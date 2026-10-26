/**
 * Etiqueta do verso da tag (adesivo 50x60 mm) em PDF, gerada no servidor.
 * Web: abre o PDF numa aba (ou baixa, se o navegador bloquear). Celular: grava e abre o compartilhar.
 */
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import api from './api';

export type TagLabelLayout = 'a4' | 'roll';

export interface TagLabelOptions {
  layout: TagLabelLayout;
  startPosition?: number; // 1 a 12, só na folha A4
}

export const TAG_LABELS_PER_A4 = 12;

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
    layout: options.layout,
    start_position: options.startPosition ?? 1,
  };
  await openPdf('/labels/pdf', body, 'etiquetas.pdf');
}

/** PDF com uma etiqueta por peça recebida na entrada. */
export async function printEntryTagLabels(entryId: number, options: TagLabelOptions): Promise<void> {
  const body = { layout: options.layout, start_position: options.startPosition ?? 1 };
  await openPdf(`/labels/pdf/entry/${entryId}`, body, `etiquetas-entrada-${entryId}.pdf`);
}
