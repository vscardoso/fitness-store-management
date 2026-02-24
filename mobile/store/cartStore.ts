/**
 * Cart Store (Zustand)
 * Gerencia carrinho de compras do PDV
 * Parte 1: Interface e tipos
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product, SaleItem, Payment, PaymentMethod } from '@/types';
import type { ProductGrouped, ProductVariant as GroupedVariant } from '@/types';

/**
 * Item do carrinho — suporta produto simples e produto com variante.
 * `cart_key` é o identificador único:
 *   - Produto simples: "p_{product_id}"
 *   - Variante:        "v_{variant_id}"
 */
export interface CartItem extends SaleItem {
  cart_key: string;
  /** Rótulo da variante para exibição: "M / Azul" */
  variant_label?: string;
  /** Produto (com name/sku ajustados para a variante quando aplicável) */
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
  addVariantItem: (product: ProductGrouped, variant: GroupedVariant, quantity?: number) => void;
  removeItem: (cart_key: string) => void;
  updateQuantity: (cart_key: string, quantity: number) => void;
  updateItemDiscount: (cart_key: string, discount: number) => void;
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
       * Adicionar produto simples ao carrinho
       */
      addItem: (product: Product, quantity: number = 1) => {
        const cart_key = `p_${product.id}`;
        const items = get().items;
        const existingItem = items.find((item) => item.cart_key === cart_key);

        if (existingItem) {
          set({
            items: items.map((item) =>
              item.cart_key === cart_key
                ? { ...item, quantity: item.quantity + quantity }
                : item
            ),
          });
        } else {
          const newItem: CartItem = {
            cart_key,
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
       * Adicionar produto com variante ao carrinho
       */
      addVariantItem: (product: ProductGrouped, variant: GroupedVariant, quantity: number = 1) => {
        const cart_key = `v_${variant.id}`;
        const items = get().items;
        const existingItem = items.find((item) => item.cart_key === cart_key);

        // Montar label da variante: "M / Azul"
        const parts = [variant.size, variant.color].filter(Boolean);
        const variant_label = parts.length > 0 ? parts.join(' / ') : undefined;

        // Objeto Product virtual para exibição
        const virtualProduct: Product = {
          id: product.id,
          name: product.name,
          sku: variant.sku,
          price: variant.price,
          cost_price: variant.cost_price ?? undefined,
          current_stock: variant.current_stock,
          is_active: true,
          is_catalog: false,
          category_id: product.category_id,
          brand: product.brand,
          image_url: product.image_url,
        } as Product;

        if (existingItem) {
          set({
            items: items.map((item) =>
              item.cart_key === cart_key
                ? { ...item, quantity: item.quantity + quantity }
                : item
            ),
          });
        } else {
          const newItem: CartItem = {
            cart_key,
            product_id: product.id,
            variant_id: variant.id,
            variant_label,
            product: virtualProduct,
            quantity,
            unit_price: variant.price,
            discount: 0,
          };
          set({ items: [...items, newItem] });
        }

        get().calculateTotals();
      },

      /**
       * Remover item do carrinho por cart_key
       */
      removeItem: (cart_key: string) => {
        set({
          items: get().items.filter((item) => item.cart_key !== cart_key),
        });
        get().calculateTotals();
      },

      /**
       * Atualizar quantidade de um item por cart_key
       */
      updateQuantity: (cart_key: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(cart_key);
          return;
        }

        set({
          items: get().items.map((item) =>
            item.cart_key === cart_key ? { ...item, quantity } : item
          ),
        });
        get().calculateTotals();
      },

      /**
       * Atualizar desconto de um item por cart_key
       */
      updateItemDiscount: (cart_key: string, discount: number) => {
        set({
          items: get().items.map((item) =>
            item.cart_key === cart_key ? { ...item, discount } : item
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
