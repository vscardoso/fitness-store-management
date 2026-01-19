/**
 * Configurações do ambiente e API
 * Centralize todas as configs do app aqui
 */

// ============================================================================
// 🔧 CONFIGURAÇÃO DE REDE - ESCOLHA UMA OPÇÃO ABAIXO
// ============================================================================

// 🟢 OPÇÃO 1: Emulador Android (Recomendado para desenvolvimento)
// const API_BASE_URL = 'http://10.0.2.2:8000/api/v1';

// 🟢 OPÇÃO 2: Emulador iOS / Simulator
// const API_BASE_URL = 'http://localhost:8000/api/v1';

// 🟡 OPÇÃO 3: Dispositivo Físico (mesma rede WiFi) - Dev local
// ⚠️ IP WiFi atual: 192.168.100.158 (adaptador Wi-Fi)
// const API_BASE_URL = 'http://192.168.100.158:8000/api/v1';

// 🔴 OPÇÃO 4: Tunnel (qualquer rede, mais instável)
// ⚠️ Crie um novo tunnel: npx localtunnel --port 8000
// ⚠️ Atualize CORS no backend/.env
// const API_BASE_URL = 'https://happy-zebras-brush.loca.lt/api/v1';

// 🟢 OPÇÃO 5: Produção Render.com ✅ ATIVO
const API_BASE_URL = 'https://fitness-backend-x1qn.onrender.com/api/v1';

// ============================================================================

// URL base da API
export const API_CONFIG = {
  BASE_URL: __DEV__ ? API_BASE_URL : 'https://fitness-backend-x1qn.onrender.com/api/v1',
  TIMEOUT: 30000, // 30 segundos
};

// Configurações do Sentry (Error Tracking)
export const SENTRY_CONFIG = {
  DSN: 'https://f0a8f44b129143c8689af5af8b20ee82@o4510386072715264.ingest.us.sentry.io/4510386085298176',
  ENABLED: !__DEV__, // Desabilitado em desenvolvimento, ativado em produção
  TRACES_SAMPLE_RATE: 1.0, // 100% das transações (ajustar em produção se necessário)
};

// Configurações do app
export const APP_CONFIG = {
  APP_NAME: 'Fitness Store',
  VERSION: '1.0.0',
};

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: '@fitness_store:access_token',
  REFRESH_TOKEN: '@fitness_store:refresh_token',
  USER: '@fitness_store:user',
  CART: '@fitness_store:cart',
};

// Configurações de paginação
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};

export default {
  API_CONFIG,
  APP_CONFIG,
  STORAGE_KEYS,
  PAGINATION,
};
