/** Brindes: peça que sai do estoque sem cobrança. Só administrador (o servidor recusa os outros papéis). */
import api from './api';
import { openPdfFromApi } from './receiptService';

export type GiftReason = 'with_sale' | 'courtesy' | 'voucher' | 'promotion' | 'other';

export interface GiftItem {
  id: number; product_id: number | null; variant_id: number | null; product_name: string | null; variant_label: string | null;
  quantity: number; unit_cost: number; list_price: number;
}

export interface Gift {
  id: number; gift_number: string; status: 'given' | 'cancelled'; reason_type: GiftReason; reason_label: string;
  reason_note: string | null; customer_id: number | null; customer_name: string | null; recipient_name: string | null;
  recipient: string | null; related_sale_id: number | null; given_by_name: string | null;
  total_cost: number; net_cost: number; list_value: number;
  created_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
  items: GiftItem[];
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
  { value: 'voucher', label: 'Voucher resgatado', description: 'A cliente trouxe um voucher e pegou a peça' },
  { value: 'promotion', label: 'Divulgação / influenciadora', description: 'Peça dada para alguém divulgar a loja' },
  { value: 'other', label: 'Outro', description: 'Escreva o motivo' },
];

export const createGift = async (body: GiftCreate): Promise<Gift> => (await api.post('/gifts/', body)).data;
export const getGifts = async (params?: { start_date?: string; end_date?: string; limit?: number; skip?: number }): Promise<GiftList> =>
  (await api.get('/gifts/', { params })).data;
export const getGift = async (id: number): Promise<Gift> => (await api.get(`/gifts/${id}`)).data;
export const cancelGift = async (id: number, reason: string): Promise<Gift> => (await api.post(`/gifts/${id}/cancel`, { reason })).data;

/** Comprovante para a pessoa validar o que ganhou: texto/link do WhatsApp e PDF. Nunca leva custo. */
export interface GiftReceiptInfo {
  text: string;
  whatsapp_url: string | null;
  receipt: { gift_number: string; recipient: string; customer_phone: string | null };
  /** Número oficial da loja ligado à Cloud API da Meta: só com ele o envio sai pela loja. */
  store_whatsapp: { connected: boolean; number: string | null };
}
export const getGiftReceipt = async (id: number): Promise<GiftReceiptInfo> =>
  (await api.get(`/gifts/${id}/receipt`, { headers: { 'X-Skip-Loading': 'true' } })).data;
export const sendGiftReceiptViaStoreWhatsapp = async (id: number): Promise<{ mode: 'pdf'; store_number: string | null; customer: string }> =>
  (await api.post(`/gifts/${id}/receipt/send-whatsapp`, null, { headers: { 'X-Loading-Message': 'Enviando pelo WhatsApp da loja...' } })).data;
export const openGiftReceiptPdf = (id: number, giftNumber: string): Promise<void> =>
  openPdfFromApi(`/gifts/${id}/receipt/pdf?size=a6`, `brinde-${giftNumber}.pdf`, `Brinde ${giftNumber}`);
