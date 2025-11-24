/**
 * Exportações centralizadas de todos os serviços
 * Import único: import { login, getProducts, createSale } from '@/services'
 */

// Auth
export * from './authService';

// Products
export * from './productService';

// Sales
export * from './saleService';

// Customers
export * from './customerService';

// Inventory
export * from './inventoryService';

// Storage
export * from './storage';

// API Client
export { default as api } from './api';
