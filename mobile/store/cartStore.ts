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
import { lineDiscount } from '@/utils/itemDiscount';

const cents = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100);
/** Reais em centavos exatos (evita 359.59999999999997 na soma). */
const money = (c: number): number => c / 100;

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
  /**
   * Desconto POR PEÇA em reais (quem vende digita; centavos exatos). `discount` (herdado de SaleItem) é o desconto da
   * LINHA = unit_discount x quantidade, refeito toda vez que a quantidade muda. Sem isto, mudar a quantidade depois de
   * dar o desconto deixava o desconto da linha parado.
   */
  unit_discount?: number;
}

/** Refaz o desconto da linha quando a quantidade muda (desconto por peça x quantidade). */
function withQuantity(item: CartItem, quantity: number): CartItem {
  const next = { ...item, quantity };
  if (item.unit_discount && item.unit_discount > 0) next.discount = lineDiscount(item.unit_discount, quantity);
  return next;
}

/** Duração máxima do carrinho persistido: 8 horas */
const CART_TTL_MS = 8 * 60 * 60 * 1000;

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
  /** Timestamp ISO da primeira adição ao carrinho (para TTL) */
  persisted_at?: string;

  // Computed
  subtotal: number;
  /** Soma dos descontos dados em cada peça (o `discount` do estado é o desconto geral da venda). */
  itemsDiscount: number;
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
  /** Desconto por peça (reais, centavos exatos). 0 tira o desconto. */
  setItemUnitDiscount: (cart_key: string, unitDiscount: number) => void;
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
      persisted_at: undefined,
      subtotal: 0,
      itemsDiscount: 0,
      total: 0,
      itemCount: 0,
      totalPaid: 0,
      remaining: 0,

      /**
       * Adicionar produto simples ao carrinho
       */
      addItem: (product: Product, quantity: number = 1) => {
        const productWithVariant = product as Product & {
          variant_id?: number;
          variant_label?: string;
        };
        const cart_key = productWithVariant.variant_id
          ? `v_${productWithVariant.variant_id}`
          : `p_${product.id}`;
        const items = get().items;
        const existingItem = items.find((item) => item.cart_key === cart_key);

        if (existingItem) {
          set({
            items: items.map((item) =>
              item.cart_key === cart_key
                ? withQuantity(item, item.quantity + quantity)
                : item
            ),
          });
        } else {
          const newItem: CartItem = {
            cart_key,
            product_id: product.id,
            variant_id: productWithVariant.variant_id,
            variant_label: productWithVariant.variant_label,
            product,
            quantity,
            unit_price: product.price,
            discount: 0,
          };
          set({
            items: [...items, newItem],
            persisted_at: get().persisted_at ?? new Date().toISOString(),
          });
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
                ? withQuantity(item, item.quantity + quantity)
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
          set({
            items: [...items, newItem],
            persisted_at: get().persisted_at ?? new Date().toISOString(),
          });
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
            item.cart_key === cart_key ? withQuantity(item, quantity) : item
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
            item.cart_key === cart_key ? { ...item, discount, unit_discount: undefined } : item
          ),
        });
        get().calculateTotals();
      },

      /**
       * Desconto por peça: guarda o valor de UMA peça e deriva o da linha (x quantidade).
       * Recusa desconto que não deixa a peça com valor (>= preço) para o carrinho nunca mandar linha inválida.
       */
      setItemUnitDiscount: (cart_key: string, unitDiscount: number) => {
        set({
          items: get().items.map((item) => {
            if (item.cart_key !== cart_key) return item;
            const per = Math.max(0, money(cents(unitDiscount)));
            if (per <= 0 || cents(per) >= cents(item.unit_price)) {
              return { ...item, unit_discount: undefined, discount: 0 };
            }
            return { ...item, unit_discount: per, discount: lineDiscount(per, item.quantity) };
          }),
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
          persisted_at: undefined,
          subtotal: 0,
          itemsDiscount: 0,
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

        // Subtotal dos items (com o desconto de cada peça), em centavos exatos
        const subtotalCents = items.reduce(
          (sum, item) => sum + cents(item.unit_price) * item.quantity - cents(item.discount),
          0,
        );
        const itemsDiscountCents = items.reduce((sum, item) => sum + cents(item.discount), 0);
        const subtotal = money(subtotalCents);
        const itemsDiscount = money(itemsDiscountCents);

        // Total final (subtotal - desconto geral da venda)
        const total = Math.max(0, money(subtotalCents - cents(globalDiscount)));

        // Quantidade de items
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        // Total pago
        const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

        // Valor restante
        const remaining = Math.max(0, money(cents(total) - cents(totalPaid)));

        set({
          subtotal,
          itemsDiscount,
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
        // payments NÃO persiste — são específicos da sessão (evita pagamentos fantasma)
        discount: state.discount,
        customer_id: state.customer_id,
        notes: state.notes,
        persisted_at: state.persisted_at,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Fix 2: carrinho expirado (TTL 8h) → limpar tudo
        if (state.persisted_at) {
          const age = Date.now() - new Date(state.persisted_at).getTime();
          if (age > CART_TTL_MS) {
            state.items = [];
            state.payments = [];
            state.discount = 0;
            state.customer_id = undefined;
            state.notes = undefined;
            state.persisted_at = undefined;
          }
        }

        // Fix 2: recalcular totais após rehydration (evita total zerado)
        const items = state.items ?? [];
        const globalDiscount = state.discount ?? 0;
        const subtotalCents = items.reduce(
          (sum, item) => sum + cents(item.unit_price) * item.quantity - cents(item.discount),
          0,
        );
        state.subtotal = money(subtotalCents);
        state.itemsDiscount = money(items.reduce((sum, item) => sum + cents(item.discount), 0));
        state.total = Math.max(0, money(subtotalCents - cents(globalDiscount)));
        state.itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
        state.totalPaid = 0;   // payments não persistem
        state.remaining = state.total;
        state.payments = [];   // garantia extra
      },
    }
  )
);
