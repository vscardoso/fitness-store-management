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
}

export interface EntryLabelProgress {
  entry_code: string;
  received: number;
  printed: number;
  queued: number;
  missing: number;
  lines: { variant_id: number; received: number; printed: number; queued: number; missing: number }[];
}

export type QueuePaper = 'a4' | 'roll' | 'sheet';

export async function getLabelQueue(): Promise<LabelQueue> {
  return (await api.get('/labels/queue')).data;
}

export async function addEntryToQueue(entryId: number): Promise<{ added: number; progress: EntryLabelProgress }> {
  return (await api.post(`/labels/queue/entry/${entryId}`)).data;
}

export async function addToQueue(items: { variantId: number; quantity: number }[]): Promise<{ added: number }> {
  return (await api.post('/labels/queue', { items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })) })).data;
}

export async function setQueueQuantity(itemId: number, quantity: number): Promise<void> {
  await api.put(`/labels/queue/${itemId}`, { quantity });
}

export async function getEntryLabelProgress(entryId: number): Promise<EntryLabelProgress> {
  return (await api.get(`/labels/entry/${entryId}/progress`)).data;
}

export async function getPrintState(layout: QueuePaper, widthMm: number, heightMm: number): Promise<PrintState> {
  return (await api.get('/labels/print-state', { params: { layout, width_mm: widthMm, height_mm: heightMm } })).data;
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
