/** Caixa de conversas do WhatsApp oficial da loja (Cloud API da Meta). */
import api from './api';

export interface WaConversation {
  id: number;
  customer_id: number | null;
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
  media: { kind: 'image' | 'audio' | 'video' | 'document' | 'sticker'; mime: string | null; filename: string | null } | null;
}

export const listConversations = async (q?: string): Promise<WaConversation[]> =>
  (await api.get<WaConversation[]>('/whatsapp/conversations', {
    params: q?.trim() ? { q: q.trim() } : undefined,
    headers: { 'X-Skip-Loading': 'true' },
  })).data;

/** Conversa da cliente no número da loja; abre (sem enviar nada) se ela ainda não escreveu. */
export const openCustomerConversation = async (customerId: number): Promise<WaConversation> =>
  (await api.post<WaConversation>('/whatsapp/conversations/start', { customer_id: customerId })).data;

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

export interface WaPickedFile { uri: string; name: string; type: string }

/** Envia foto (JPG/PNG) ou PDF para a conversa (dentro da janela de 24 h). */
export const sendWhatsappFile = async (id: number, file: WaPickedFile, caption?: string): Promise<WaMessage> => {
  const { appendFileToFormData } = await import('@/utils/formDataFile');
  const form = new FormData();
  await appendFileToFormData(form, 'file', file.uri, file.name, file.type);
  if (caption?.trim()) form.append('caption', caption.trim());
  return (await api.post<WaMessage>(`/whatsapp/conversations/${id}/send-media`, form, {
    headers: { 'Content-Type': 'multipart/form-data', 'X-Loading-Message': 'Enviando...' },
    timeout: 90000,
  })).data;
};

export interface WaGreeting { enabled: boolean; text: string; max_chars: number }

export const getWhatsappGreeting = async (): Promise<WaGreeting> =>
  (await api.get<WaGreeting>('/whatsapp/greeting', { headers: { 'X-Skip-Loading': 'true' } })).data;

export const saveWhatsappGreeting = async (enabled: boolean, text: string): Promise<WaGreeting> =>
  (await api.put<WaGreeting>('/whatsapp/greeting', { enabled, text })).data;
