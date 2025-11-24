/**
 * Cart Store (Zustand)
 * Gerencia carrinho de compras do PDV
 * Parte 1: Interface e tipos
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product, SaleItem, Payment, PaymentMethod } from '@/types';

/**
 * Item do carrinho (extende SaleItem com dados do produto)
 */
export interface CartItem extends SaleItem {
  product: Product;
}

/**
 * Interface do Cart Store
 */
interface CartState {
  // State
  items: CartItem[];
  payments: Payment[];
  discount: number;
  customer_id?: number;
  notes?: string;

  // Computed
  subtotal: number;
  total: number;
  itemCount: number;
  totalPaid: number;
  remaining: number;

  // Actions - Items
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (product_id: number) => void;
  updateQuantity: (product_id: number, quantity: number) => void;
  updateItemDiscount: (product_id: number, discount: number) => void;
  clearItems: () => void;

  // Actions - Payments
  addPayment: (method: PaymentMethod, amount: number, installments?: number) => void;
  removePayment: (index: number) => void;
  clearPayments: () => void;

  // Actions - Global
  setDiscount: (discount: number) => void;
  setCustomer: (customer_id?: number) => void;
  setNotes: (notes: string) => void;
  clear: () => void;

  // Helpers
  calculateTotals: () => void;
  canFinalizeSale: () => boolean;
}

/**
 * Cart Store - Gerencia carrinho de vendas
 */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      // Estado inicial
      items: [],
      payments: [],
      discount: 0,
      customer_id: undefined,
      notes: undefined,
      subtotal: 0,
      total: 0,
      itemCount: 0,
      totalPaid: 0,
      remaining: 0,

      /**
       * Adicionar item ao carrinho
       */
      addItem: (product: Product, quantity: number = 1) => {
        const items = get().items;
        const existingItem = items.find((item) => item.product_id === product.id);

        if (existingItem) {
          // Atualizar quantidade do item existente
          set({
            items: items.map((item) =>
              item.product_id === product.id
                ? { ...item, quantity: item.quantity + quantity }
                : item
            ),
          });
        } else {
          // Adicionar novo item
          const newItem: CartItem = {
            product_id: product.id,
            product,
            quantity,
            unit_price: product.price, 
            discount: 0,
          };

          set({ items: [...items, newItem] });
        }

        get().calculateTotals();
      },

      /**
       * Remover item do carrinho
       */
      removeItem: (product_id: number) => {
        set({
          items: get().items.filter((item) => item.product_id !== product_id),
        });
        get().calculateTotals();
      },

      /**
       * Atualizar quantidade de um item
       */
      updateQuantity: (product_id: number, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(product_id);
          return;
        }

        set({
          items: get().items.map((item) =>
            item.product_id === product_id ? { ...item, quantity } : item
          ),
        });
        get().calculateTotals();
      },

      /**
       * Atualizar desconto de um item
       */
      updateItemDiscount: (product_id: number, discount: number) => {
        set({
          items: get().items.map((item) =>
            item.product_id === product_id ? { ...item, discount } : item
          ),
        });
        get().calculateTotals();
      },

      /**
       * Limpar todos os items
       */
      clearItems: () => {
        set({ items: [] });
        get().calculateTotals();
      },

      /**
       * Adicionar pagamento
       */
      addPayment: (method: PaymentMethod, amount: number, installments: number = 1) => {
        const newPayment: Payment = {
          method,
          amount,
          installments,
        };

        set({
          payments: [...get().payments, newPayment],
        });
        get().calculateTotals();
      },

      /**
       * Remover pagamento
       */
      removePayment: (index: number) => {
        set({
          payments: get().payments.filter((_, i) => i !== index),
        });
        get().calculateTotals();
      },

      /**
       * Limpar pagamentos
       */
      clearPayments: () => {
        set({ payments: [] });
        get().calculateTotals();
      },

      /**
       * Definir desconto global
       */
      setDiscount: (discount: number) => {
        set({ discount: Math.max(0, discount) });
        get().calculateTotals();
      },

      /**
       * Definir cliente
       */
      setCustomer: (customer_id?: number) => {
        set({ customer_id });
      },

      /**
       * Definir observações
       */
      setNotes: (notes: string) => {
        set({ notes });
      },

      /**
       * Limpar carrinho completamente
       */
      clear: () => {
        set({
          items: [],
          payments: [],
          discount: 0,
          customer_id: undefined,
          notes: undefined,
          subtotal: 0,
          total: 0,
          itemCount: 0,
          totalPaid: 0,
          remaining: 0,
        });
      },

      /**
       * Calcular totais
       */
      calculateTotals: () => {
        const items = get().items;
        const payments = get().payments;
        const globalDiscount = get().discount;

        // Subtotal dos items (com descontos individuais)
        const subtotal = items.reduce((sum, item) => {
          return sum + item.unit_price * item.quantity - item.discount;
        }, 0);

        // Total final (subtotal - desconto global)
        const total = Math.max(0, subtotal - globalDiscount);

        // Quantidade de items
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        // Total pago
        const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

        // Valor restante
        const remaining = Math.max(0, total - totalPaid);

        set({
          subtotal,
          total,
          itemCount,
          totalPaid,
          remaining,
        });
      },

      /**
       * Verificar se pode finalizar venda
       */
      canFinalizeSale: () => {
        const { items, total, totalPaid } = get();
        return items.length > 0 && totalPaid >= total;
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items,
        payments: state.payments,
        discount: state.discount,
        customer_id: state.customer_id,
        notes: state.notes,
      }),
    }
  )
);
