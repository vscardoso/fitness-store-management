/**
 * Comprovante da venda para a cliente: texto e link do WhatsApp e PDF gerado no servidor (58 mm, 80 mm ou A6).
 * O servidor monta tudo (nunca sai custo nem lucro). Web: compartilhar do aparelho, senão abre ou baixa.
 */
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export type ReceiptSize = '58' | '80' | 'a6';

export const RECEIPT_SIZES: { key: ReceiptSize; label: string; hint: string }[] = [
  { key: '80', label: '80 mm', hint: 'Impressora térmica comum' },
  { key: '58', label: '58 mm', hint: 'Impressora térmica pequena' },
  { key: 'a6', label: 'A6', hint: 'Folha pequena ou para mandar' },
];

const SIZE_KEY = '@provador:comprovante_tamanho';

export interface ReceiptInfo {
  text: string;
  whatsapp_url: string | null;
  receipt: { sale_number: string; customer: string | null; customer_phone: string | null; total: number };
}

const q = (change?: number) => (change && change > 0 ? `?change=${change}` : '');

export async function getReceipt(saleId: number, change?: number): Promise<ReceiptInfo> {
  const { data } = await api.get<ReceiptInfo>(`/sales/${saleId}/receipt${q(change)}`, { headers: { 'X-Skip-Loading': 'true' } });
  return data;
}

export async function getSavedReceiptSize(): Promise<ReceiptSize> {
  try {
    const v = await AsyncStorage.getItem(SIZE_KEY);
    if (v === '58' || v === '80' || v === 'a6') return v;
  } catch { /* sem armazenamento: usa o padrão */ }
  return '80';
}

export async function saveReceiptSize(size: ReceiptSize): Promise<void> {
  try { await AsyncStorage.setItem(SIZE_KEY, size); } catch { /* só uma conveniência */ }
}

/** Link do WhatsApp: direto na cliente quando há telefone válido; senão abre o WhatsApp para escolher o contato. */
export function receiptWhatsappUrl(info: ReceiptInfo): string {
  return info.whatsapp_url || `https://wa.me/?text=${encodeURIComponent(info.text)}`;
}

export async function openReceiptPdf(saleId: number, saleNumber: string, size: ReceiptSize, change?: number): Promise<void> {
  const sep = change && change > 0 ? `&change=${change}` : '';
  const url = `/sales/${saleId}/receipt/pdf?size=${size}${sep}`;
  const filename = `comprovante-${saleNumber}.pdf`;
  if (Platform.OS === 'web') {
    const res = await api.get(url, { responseType: 'blob', headers: { 'X-Loading-Message': 'Gerando comprovante...' } });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(nav.userAgent || '')) {
        await nav.share({ files: [file], title: `Comprovante ${saleNumber}` });
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // a pessoa fechou o compartilhar
    }
    const href = URL.createObjectURL(blob);
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
  const res = await api.get(url, { responseType: 'arraybuffer', headers: { 'X-Loading-Message': 'Gerando comprovante...' } });
  const bytes = new Uint8Array(res.data as ArrayBuffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const path = `${LegacyFileSystem.cacheDirectory}${filename}`;
  await LegacyFileSystem.writeAsStringAsync(path, globalThis.btoa(bin), { encoding: 'base64' as any });
  await Sharing.shareAsync(path, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Comprovante ${saleNumber}` });
}
