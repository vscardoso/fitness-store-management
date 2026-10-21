/**
 * Caixa de alertas da loja (estoque baixo e zerado). O servidor gera e limpa os alertas sozinho.
 */
import api from './api';

export type InboxKind = 'low_stock' | 'out_of_stock';

export interface InboxNotification {
  id: number;
  kind: InboxKind;
  title: string;
  body: string;
  product_id: number | null;
  is_read: boolean;
  created_at: string;
}

// leituras em segundo plano: o selo e a lista não devem acender o carregamento global
const quiet = { headers: { 'X-Skip-Loading': 'true' } };

export const getInbox = async (): Promise<InboxNotification[]> =>
  (await api.get('/notifications/inbox', quiet)).data;

export const getUnreadCount = async (): Promise<number> =>
  (await api.get('/notifications/inbox/unread-count', quiet)).data.count;

export const markInboxRead = async (id: number): Promise<InboxNotification> =>
  (await api.post(`/notifications/inbox/${id}/read`, null, quiet)).data;

export const markAllInboxRead = async (): Promise<void> => {
  await api.post('/notifications/inbox/read-all', null, quiet);
};
