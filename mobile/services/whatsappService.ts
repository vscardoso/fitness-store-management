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
  labels: WaLabel[];
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

export const listConversations = async (q?: string, labelId?: number | null): Promise<WaConversation[]> =>
  (await api.get<WaConversation[]>('/whatsapp/conversations', {
    params: { ...(q?.trim() ? { q: q.trim() } : {}), ...(labelId ? { label_id: labelId } : {}) },
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

// ── perfil, ausência, respostas rápidas e etiquetas ──────────────────────────

export interface WaProfile {
  about: string; address: string; description: string; email: string; websites: string[]; vertical: string;
  profile_picture_url: string | null;
  limits: { about: number; address: number; description: number; email: number; websites: number };
  verticals: string[];
}
export type WaProfileInput = Partial<Pick<WaProfile, 'about' | 'address' | 'description' | 'email' | 'websites' | 'vertical'>>;

export const getWhatsappProfile = async (): Promise<WaProfile> =>
  (await api.get<WaProfile>('/whatsapp/profile', { headers: { 'X-Skip-Loading': 'true' } })).data;

export const saveWhatsappProfile = async (data: WaProfileInput): Promise<WaProfile> =>
  (await api.put<WaProfile>('/whatsapp/profile', data, { headers: { 'X-Loading-Message': 'Salvando...' } })).data;

export type WaHours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string][]>;
export interface WaAway { enabled: boolean; text: string; max_chars: number; timezone: string; hours: WaHours; has_hours: boolean }

export const getWhatsappAway = async (): Promise<WaAway> =>
  (await api.get<WaAway>('/whatsapp/away', { headers: { 'X-Skip-Loading': 'true' } })).data;

export const saveWhatsappAway = async (enabled: boolean, text: string, hours: WaHours): Promise<WaAway> =>
  (await api.put<WaAway>('/whatsapp/away', { enabled, text, hours })).data;

export interface WaQuickReply { id: number; shortcut: string; text: string }
export const listQuickReplies = async (): Promise<WaQuickReply[]> =>
  (await api.get<WaQuickReply[]>('/whatsapp/quick-replies', { headers: { 'X-Skip-Loading': 'true' } })).data;
export const createQuickReply = async (shortcut: string, text: string): Promise<WaQuickReply> =>
  (await api.post<WaQuickReply>('/whatsapp/quick-replies', { shortcut, text })).data;
export const updateQuickReply = async (id: number, shortcut: string, text: string): Promise<WaQuickReply> =>
  (await api.put<WaQuickReply>(`/whatsapp/quick-replies/${id}`, { shortcut, text })).data;
export const deleteQuickReply = async (id: number): Promise<void> => {
  await api.delete(`/whatsapp/quick-replies/${id}`);
};

export interface WaLabel { id: number; name: string; color_key: string }
export const listWhatsappLabels = async (): Promise<WaLabel[]> =>
  (await api.get<WaLabel[]>('/whatsapp/labels', { headers: { 'X-Skip-Loading': 'true' } })).data;
export const createWhatsappLabel = async (name: string, color_key: string): Promise<WaLabel> =>
  (await api.post<WaLabel>('/whatsapp/labels', { name, color_key })).data;
export const updateWhatsappLabel = async (id: number, name: string, color_key: string): Promise<WaLabel> =>
  (await api.put<WaLabel>(`/whatsapp/labels/${id}`, { name, color_key })).data;
export const deleteWhatsappLabel = async (id: number): Promise<void> => {
  await api.delete(`/whatsapp/labels/${id}`);
};
export const setConversationLabels = async (conversationId: number, labelIds: number[]): Promise<WaLabel[]> =>
  (await api.put<WaLabel[]>(`/whatsapp/conversations/${conversationId}/labels`, { label_ids: labelIds })).data;
