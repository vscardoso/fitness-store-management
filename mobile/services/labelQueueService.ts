/** Fila de impressão de etiquetas e histórico do que já saiu (servidor: /labels/queue, /labels/prints, /labels/print-state). */
import api from './api';

export interface QueueItem {
  id: number;
  variant_id: number;
  quantity: number;
  entry_id: number | null;
  entry_code: string | null;
  product_name: string;
  color: string | null;
  size: string | null;
  price: number;
  code: string | null;
  added_by_name: string | null;
}

export interface LabelQueue {
  items: QueueItem[];
  total: number;
}

export interface SheetCell {
  position: number;
  code: string | null;
  name: string | null;
  color: string | null;
  size: string | null;
}

export interface PrintState {
  next_position: number;
  per_sheet: number;
  sheet: SheetCell[];
  last: { id: number; at: string; by: string | null; total: number } | null;
  /** A última impressão salva de qualquer papel: é a única que dá para desfazer ("Não saiu"). */
  last_job: { id: number; at: string; by: string | null; total: number } | null;
}

export interface EntryLabelProgress {
  entry_code: string;
  received: number;
  /** Peças da entrada que já tiveram a etiqueta impressa (nunca passa do recebido). */
  printed: number;
  /** Etiquetas impressas de novo (a mesma peça duas vezes): vai à parte. */
  reprinted?: number;
  queued: number;
  missing: number;
  lines: { variant_id: number; received: number; printed: number; reprinted?: number; queued: number; missing: number }[];
}

export type QueuePaper = 'a4' | 'roll' | 'sheet';

export async function getLabelQueue(): Promise<LabelQueue> {
  return (await api.get('/labels/queue', { headers: { 'X-Skip-Loading': 'true' } })).data;   // consulta repetida em segundo plano: sem véu de carregamento
}

export async function addEntryToQueue(entryId: number): Promise<{ added: number; progress: EntryLabelProgress }> {
  return (await api.post(`/labels/queue/entry/${entryId}`)).data;
}

/** Põe na fila SÓ as peças e quantidades dadas (entryId liga as etiquetas à entrada de origem, para o progresso dela). */
export async function addToQueue(items: { variantId: number; quantity: number }[], entryId?: number | null): Promise<{ added: number }> {
  return (await api.post('/labels/queue', {
    items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    entry_id: entryId ?? null,
  })).data;
}

export async function setQueueQuantity(itemId: number, quantity: number): Promise<void> {
  await api.put(`/labels/queue/${itemId}`, { quantity });
}

export async function getEntryLabelProgress(entryId: number): Promise<EntryLabelProgress> {
  return (await api.get(`/labels/entry/${entryId}/progress`, { headers: { 'X-Skip-Loading': 'true' } })).data;
}

export async function getPrintState(layout: QueuePaper, widthMm: number, heightMm: number): Promise<PrintState> {
  return (await api.get('/labels/print-state', { params: { layout, width_mm: widthMm, height_mm: heightMm }, headers: { 'X-Skip-Loading': 'true' } })).data;
}

export interface ConfirmPrintInput {
  layout: QueuePaper;
  widthMm: number;
  heightMm: number;
  startPosition: number;
  items: { variantId: number; quantity: number }[];
  fromQueue: boolean;
  entryId?: number | null;
}

/** "Imprimi": grava o que saiu, tira da fila e anda a folha. */
export async function confirmPrint(input: ConfirmPrintInput): Promise<{ id: number; total: number; next_position: number; per_sheet: number }> {
  return (await api.post('/labels/prints', {
    layout: input.layout, width_mm: input.widthMm, height_mm: input.heightMm, start_position: input.startPosition,
    items: input.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    from_queue: input.fromQueue, entry_id: input.entryId ?? null,
  })).data;
}

/** "Não saiu": desfaz a última impressão salva; as etiquetas voltam para a fila. */
export async function undoPrint(jobId: number): Promise<{ returned: number }> {
  return (await api.post(`/labels/prints/${jobId}/undo`)).data;
}

export interface RecentPrint {
  id: number;
  at: string;
  by: string | null;
  total: number;
  layout: QueuePaper;
  width_mm: number;
  height_mm: number;
  start_position: number;
  filename: string;
  /** Link https do PDF (assinado; só abre enquanto for um dos 3 últimos). */
  url: string;
}

/** Os 3 últimos PDFs gerados (os mais antigos deixam de abrir sozinhos). */
export async function getRecentPrints(): Promise<RecentPrint[]> {
  return (await api.get('/labels/prints/recent', { headers: { 'X-Skip-Loading': 'true' } })).data;
}
