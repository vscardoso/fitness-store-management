/**
 * Exportações centralizadas de todos os stores
 * Import único: import { useAuthStore, useCartStore } from '@/store'
 */

export { useAuthStore } from './authStore';
export { useCartStore } from './cartStore';
export { useUIStore } from './uiStore';

export type { CartItem } from './cartStore';
