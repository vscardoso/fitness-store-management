/** Caixa de conversas do WhatsApp oficial da loja (Cloud API da Meta). */
import api from './api';

export interface WaConversation {
  id: number;
  name: string;
  phone: string | null;
  unread_count: number;
  last_message_at: string | null;
  window_open: boolean;
  last_text: string | null;
  last_direction: 'in' | 'out' | null;
}

export interface WaMessage {
  id: number;
  direction: 'in' | 'out';
  type: string;
  text: string | null;
  status: 'received' | 'sent' | 'delivered' | 'read' | 'failed';
  sent_at: string | null;
  has_error: boolean;
}

export const listConversations = async (): Promise<WaConversation[]> =>
  (await api.get<WaConversation[]>('/whatsapp/conversations', { headers: { 'X-Skip-Loading': 'true' } })).data;

export const getConversation = async (id: number): Promise<WaConversation & { messages: WaMessage[] }> =>
  (await api.get(`/whatsapp/conversations/${id}`, { headers: { 'X-Skip-Loading': 'true' } })).data;

export const markConversationRead = async (id: number): Promise<void> => {
  await api.post(`/whatsapp/conversations/${id}/read`, null, { headers: { 'X-Skip-Loading': 'true' } });
};

export const sendWhatsappText = async (id: number, text: string): Promise<WaMessage> =>
  (await api.post<WaMessage>(`/whatsapp/conversations/${id}/send`, { text }, { headers: { 'X-Loading-Message': 'Enviando...' } })).data;

export const getWhatsappUnread = async (): Promise<number> =>
  (await api.get<{ unread: number }>('/whatsapp/unread-count', { headers: { 'X-Skip-Loading': 'true' } })).data.unread;

export const getWhatsappInvite = async (text?: string): Promise<{ phone: string; link: string }> =>
  (await api.get('/whatsapp/invite', { params: text ? { text } : undefined, headers: { 'X-Skip-Loading': 'true' } })).data;
