/**
 * Programa de fidelidade da loja: regra (só o admin muda), saldo e extrato de pontos da cliente.
 * Os pontos viram cashback: cada ponto vale um valor em reais de desconto na compra.
 */
import api from './api';

export interface LoyaltySettings {
  enabled: boolean;
  /** Quantos reais gastos dão 1 ponto */
  spend_per_point: number;
  /** Quanto 1 ponto vale em reais ao usar */
  point_value: number;
  /** Mínimo de pontos para poder usar */
  min_redeem: number;
  /** Dias de validade de cada ganho; null = não vence */
  expiry_days: number | null;
}

export interface LoyaltyEntry {
  id: number;
  kind: 'earn' | 'opening' | 'redeem' | 'revoke' | 'restore' | 'expire' | 'adjust';
  label: string;
  points: number;
  sale_id: number | null;
  created_at: string | null;
  expires_at: string | null;
  note: string | null;
}

export interface CustomerLoyalty {
  enabled: boolean;
  balance: number;
  /** Quanto o saldo vale em reais */
  value: number;
  /** Pontos que vencem nos próximos 30 dias */
  expiring_soon: number;
  next_expiry: string | null;
  entries: LoyaltyEntry[];
}

export const getLoyaltySettings = async (): Promise<LoyaltySettings> => {
  const { data } = await api.get<LoyaltySettings>('/store/loyalty-settings', { headers: { 'X-Skip-Loading': 'true' } });
  return data;
};

export const updateLoyaltySettings = async (payload: LoyaltySettings): Promise<LoyaltySettings> => {
  const { data } = await api.put<LoyaltySettings>('/store/loyalty-settings', payload);
  return data;
};

export const getCustomerLoyalty = async (customerId: number): Promise<CustomerLoyalty> => {
  const { data } = await api.get<CustomerLoyalty>(`/customers/${customerId}/loyalty`, { headers: { 'X-Skip-Loading': 'true' } });
  return data;
};

export const adjustCustomerLoyalty = async (customerId: number, points: number, note: string): Promise<CustomerLoyalty> => {
  const { data } = await api.post<CustomerLoyalty>(`/customers/${customerId}/loyalty/adjust`, { points, note });
  return data;
};

export { describeLoyalty } from '@/utils/loyaltyText';
