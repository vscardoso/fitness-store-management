/** Brindes: peça que sai do estoque sem cobrança. Só administrador (o servidor recusa os outros papéis). */
import api from './api';

export type GiftReason = 'with_sale' | 'courtesy' | 'promotion' | 'other';

export interface GiftItem {
  id: number; product_id: number | null; variant_id: number | null; product_name: string | null; variant_label: string | null;
  quantity: number; quantity_returned: number; unit_cost: number; list_price: number;
}

export interface Gift {
  id: number; gift_number: string; status: 'given' | 'cancelled'; reason_type: GiftReason; reason_label: string;
  reason_note: string | null; customer_id: number | null; customer_name: string | null; recipient_name: string | null;
  recipient: string | null; related_sale_id: number | null; given_by_name: string | null;
  total_cost: number; cost_returned: number; net_cost: number; list_value: number;
  created_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
  items: GiftItem[];
  returns: { id: number; gift_item_id: number; quantity: number; cost: number; created_at: string | null; note: string | null }[];
}

export interface GiftList { items: Gift[]; total_count: number; page_cost: number; page_pieces: number }

export interface GiftCreate {
  items: { variant_id: number; quantity: number }[];
  reason_type: GiftReason;
  reason_note?: string;
  customer_id?: number;
  recipient_name?: string;
  related_sale_id?: number;
}

export const REASON_OPTIONS: { value: GiftReason; label: string; description: string }[] = [
  { value: 'with_sale', label: 'Junto com uma venda', description: 'A cliente comprou e ganhou uma peça' },
  { value: 'courtesy', label: 'Cortesia / aniversário', description: 'Um mimo para uma cliente' },
  { value: 'promotion', label: 'Divulgação / influenciadora', description: 'Peça dada para alguém divulgar a loja' },
  { value: 'other', label: 'Outro', description: 'Escreva o motivo' },
];

export const createGift = async (body: GiftCreate): Promise<Gift> => (await api.post('/gifts/', body)).data;
export const getGifts = async (params?: { start_date?: string; end_date?: string; limit?: number; skip?: number }): Promise<GiftList> =>
  (await api.get('/gifts/', { params })).data;
export const getGift = async (id: number): Promise<Gift> => (await api.get(`/gifts/${id}`)).data;
export const cancelGift = async (id: number, reason: string): Promise<Gift> => (await api.post(`/gifts/${id}/cancel`, { reason })).data;
export const returnGift = async (id: number, items: { gift_item_id: number; quantity: number }[], note?: string): Promise<Gift> =>
  (await api.post(`/gifts/${id}/return`, { items, note })).data;
