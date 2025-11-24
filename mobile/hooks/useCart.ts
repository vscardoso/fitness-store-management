/**
 * Hook customizado para carrinho de vendas
 * Facilita uso do cartStore com helpers adicionais
 */

import { useCartStore } from '@/store/cartStore';
import type { Product, PaymentMethod } from '@/types';

/**
 * Hook customizado para carrinho de vendas
 */
export const useCart = () => {
  const store = useCartStore();

  /**
   * Obter item do carrinho
   */
  const getItem = (product_id: number) => {
    return store.items.find((item) => item.product_id === product_id);
  };

  /**
   * Verificar se produto está no carrinho
   */
  const hasItem = (product_id: number): boolean => {
    return store.items.some((item) => item.product_id === product_id);
  };

  /**
   * Obter quantidade de um produto no carrinho
   */
  const getItemQuantity = (product_id: number): number => {
    const item = getItem(product_id);
    return item ? item.quantity : 0;
  };

  /**
   * Verificar se há items no carrinho
   */
  const hasItems = (): boolean => {
    return store.items.length > 0;
  };

  /**
   * Obter resumo da venda
   */
  const getSaleSummary = () => {
    return {
      itemCount: store.itemCount,
      subtotal: store.subtotal,
      discount: store.discount,
      total: store.total,
      totalPaid: store.totalPaid,
      remaining: store.remaining,
      canFinalize: store.canFinalizeSale(),
    };
  };

  return {
    // State
    items: store.items,
    payments: store.payments,
    discount: store.discount,
    customer_id: store.customer_id,
    notes: store.notes,
    subtotal: store.subtotal,
    total: store.total,
    itemCount: store.itemCount,
    totalPaid: store.totalPaid,
    remaining: store.remaining,

    // Actions
    addItem: store.addItem,
    removeItem: store.removeItem,
    updateQuantity: store.updateQuantity,
    updateItemDiscount: store.updateItemDiscount,
    clearItems: store.clearItems,
    addPayment: store.addPayment,
    removePayment: store.removePayment,
    clearPayments: store.clearPayments,
    setDiscount: store.setDiscount,
    setCustomer: store.setCustomer,
    setNotes: store.setNotes,
    clear: store.clear,
    canFinalizeSale: store.canFinalizeSale,

    // Helpers
    getItem,
    hasItem,
    getItemQuantity,
    hasItems,
    getSaleSummary,
  };
};
