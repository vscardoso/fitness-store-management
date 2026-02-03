/**
 * Payment Discount Service
 * Gerencia descontos por forma de pagamento
 */

import { api } from './api';

export interface PaymentDiscount {
  id: number;
  tenant_id: number;
  payment_method: string;
  discount_percentage: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentDiscountCalculation {
  payment_method: string;
  original_amount: number;
  discount_percentage: number;
  discount_amount: number;
  final_amount: number;
}

/**
 * Lista todos os descontos configurados
 */
export const getPaymentDiscounts = async (activeOnly: boolean = true): Promise<PaymentDiscount[]> => {
  const response = await api.get('/payment-discounts/', {
    params: { active_only: activeOnly }
  });
  return response.data.items;
};

/**
 * Obtém desconto por forma de pagamento
 */
export const getDiscountByMethod = async (paymentMethod: string): Promise<PaymentDiscount | null> => {
  try {
    const response = await api.get(`/payment-discounts/method/${paymentMethod}`);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null; // Sem desconto configurado
    }
    throw error;
  }
};

/**
 * Calcula desconto para valor e forma de pagamento
 */
export const calculateDiscount = async (
  paymentMethod: string,
  amount: number
): Promise<PaymentDiscountCalculation> => {
  const response = await api.post('/payment-discounts/calculate', null, {
    params: {
      payment_method: paymentMethod,
      amount: amount
    }
  });
  return response.data;
};

/**
 * Cria novo desconto (apenas ADMIN)
 */
export const createPaymentDiscount = async (data: {
  payment_method: string;
  discount_percentage: number;
  description?: string;
  is_active?: boolean;
}): Promise<PaymentDiscount> => {
  const response = await api.post('/payment-discounts/', data);
  return response.data;
};

/**
 * Atualiza desconto existente (apenas ADMIN)
 */
export const updatePaymentDiscount = async (
  discountId: number,
  data: Partial<PaymentDiscount>
): Promise<PaymentDiscount> => {
  const response = await api.put(`/payment-discounts/${discountId}`, data);
  return response.data;
};

/**
 * Remove desconto (soft delete) (apenas ADMIN)
 */
export const deletePaymentDiscount = async (discountId: number): Promise<void> => {
  await api.delete(`/payment-discounts/${discountId}`);
};
