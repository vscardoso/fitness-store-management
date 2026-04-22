/**
 * Exportações centralizadas de todos os stores
 * Import único: import { useAuthStore, useCartStore } from '@/store'
 */

export { useAuthStore } from './authStore';
export { useCartStore } from './cartStore';
export { useUIStore } from './uiStore';
export { useConditionalProcessingStore } from './conditionalProcessingStore';

export type { CartItem } from './cartStore';
export type { ConditionalProcessingItemDraft } from './conditionalProcessingStore';
