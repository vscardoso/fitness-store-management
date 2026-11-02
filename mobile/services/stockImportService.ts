/**
 * Importação de estoque por planilha: modelo, conferência (sem gravar) e importação (tudo ou nada).
 * No navegador o arquivo (Excel ou CSV) vai como está; no celular o texto copiado da planilha vai colado.
 */
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import api from './api';

export type ImportRowStatus = 'novo_produto' | 'nova_variacao' | 'soma' | 'ignorada' | 'erro';

export interface ImportRow {
  line: number;
  product: string;
  category: string;
  color: string | null;
  size: string | null;
  quantity: number;
  cost: number | null;
  price: number | null;
  brand: string | null;
  status: ImportRowStatus;
  message: string;
}

export interface ImportSummary {
  lines: number;
  pieces: number;
  variants: number;
  products_new: number;
  products_existing: number;
  variants_added_to_existing: number;
  categories_new: string[];
  ignored: number;
  errors: number;
  total_cost: number;
  total_sale: number;
  digest: string;
}

export interface ImportPreview {
  can_import: boolean;
  /** Motivo que impede tudo (planilha vazia, sem coluna, já importada...). */
  fatal: string | null;
  summary: ImportSummary | null;
  rows: ImportRow[];
}

export interface ImportResult {
  entry_id: number;
  entry_code: string;
  pieces: number;
  products_created: number;
  variants_created: number;
  products_touched: number;
  total_cost: number;
  categories_created: string[];
}

/** O que a pessoa enviou: um arquivo (só no navegador) ou o texto colado. */
export interface ImportSource {
  file?: File | null;
  text?: string;
}

function body(source: ImportSource, extra?: Record<string, string>): FormData {
  const form = new FormData();
  if (source.file) form.append('file', source.file as any, source.file.name);
  else form.append('text', source.text ?? '');
  Object.entries(extra ?? {}).forEach(([k, v]) => form.append(k, v));
  return form;
}

const multipart = (message: string) => ({
  headers: { 'Content-Type': 'multipart/form-data', 'X-Loading-Message': message },
  timeout: 180_000, // planilha grande leva alguns segundos para gravar
});

export async function previewStockImport(source: ImportSource): Promise<ImportPreview> {
  const { data } = await api.post<ImportPreview>('/stock-import/preview', body(source), multipart('Conferindo a planilha...'));
  return data;
}

export async function commitStockImport(source: ImportSource, entryDate?: string): Promise<ImportResult> {
  const { data } = await api.post<ImportResult>(
    '/stock-import/commit',
    body(source, entryDate ? { entry_date: entryDate } : undefined),
    multipart('Importando o estoque...'),
  );
  return data;
}

/** Baixa o modelo (CSV com `;`, que o Excel em português abre certo). */
export async function downloadImportTemplate(): Promise<void> {
  const name = 'modelo-estoque-provador.xlsx';
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (Platform.OS === 'web') {
    const res = await api.get('/stock-import/template', { responseType: 'blob' });
    const href = URL.createObjectURL(new Blob([res.data], { type: mime }));
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
    return;
  }
  const res = await api.get<ArrayBuffer>('/stock-import/template', { responseType: 'arraybuffer' });
  const bytes = new Uint8Array(res.data);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const path = `${LegacyFileSystem.cacheDirectory}${name}`;
  await LegacyFileSystem.writeAsStringAsync(path, btoa(bin), { encoding: 'base64' as any });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento não disponível neste aparelho.');
  await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: 'Modelo de estoque' });
}
