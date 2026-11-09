/** Histórico de alterações (só administrador). Somente leitura: o servidor não tem rota para apagar nem editar. */
import api from './api';
import type { AuditItem } from '@/utils/auditText';

export type AuditCategory = 'dinheiro' | 'estoque' | 'vendas' | 'pessoas';

export interface AuditRow extends AuditItem {
  id: number;
  user_id: number | null;
  category: string;
  created_at: string;
}

export interface AuditPage {
  items: AuditRow[];
  total_count: number;
  limit: number;
  skip: number;
}

export const getAuditPage = async (p: {
  category?: AuditCategory | null;
  userId?: number | null;
  skip?: number;
  limit?: number;
}): Promise<AuditPage> => {
  const params: Record<string, string | number> = { limit: p.limit ?? 30, skip: p.skip ?? 0 };
  if (p.category) params.category = p.category;
  if (p.userId) params.user_id = p.userId;
  const { data } = await api.get<AuditPage>('/audit', { params, headers: { 'X-Skip-Loading': 'true' } });
  return data;
};
