/**
 * Hook customizado para carrinho de vendas
 * Facilita uso do cartStore com helpers adicionais
 */

import { useCartStore } from '@/store/cartStore';
import type { Product, PaymentMethod } from '@/types';
import type { ProductGrouped, ProductVariant as GroupedVariant } from '@/types';

/**
 * Hook customizado para carrinho de vendas
 */
export const useCart = () => {
  const store = useCartStore();

  /**
   * Obter item do carrinho por cart_key
   */
  const getItem = (cart_key: string) => {
    return store.items.find((item) => item.cart_key === cart_key);
  };

  /**
   * Verificar se item está no carrinho por cart_key
   */
  const hasItem = (cart_key: string): boolean => {
    return store.items.some((item) => item.cart_key === cart_key);
  };

  /**
   * Obter quantidade de um item por cart_key
   */
  const getItemQuantity = (cart_key: string): number => {
    const item = getItem(cart_key);
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
    addVariantItem: store.addVariantItem,
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
