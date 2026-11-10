/**
 * Receber compra: um único envio com a compra inteira (POST /stock-entries/receive). O servidor grava tudo ou nada.
 * `client_request_id` torna o envio idempotente: repetir devolve a mesma compra (`replay: true`).
 */
import api from './api';

export interface ReceivedItem {
  entry_item_id: number;
  product_id: number;
  variant_id: number;
  sku: string | null;
  color: string | null;
  size: string | null;
  display_code: string | null;
  quantity: number;
  unit_cost: number;
  supplier_id: number | null;
}

export interface ReceivePurchaseResult {
  entry_id: number;
  entry_code: string;
  entry_date: string;
  total_cost: number;
  total_pieces: number;
  products: number;
  items: ReceivedItem[];
  replay: boolean;
}

export const receivePurchase = async (payload: Record<string, unknown>): Promise<ReceivePurchaseResult> =>
  (await api.post<ReceivePurchaseResult>('/stock-entries/receive', payload, { headers: { 'X-Loading-Message': 'Lançando a compra...' } })).data;
