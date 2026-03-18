/**
 * Configuracoes do ambiente e API
 * Centralize todas as configs do app aqui
 */

// ============================================================================
// CONFIGURACAO DE REDE - DESCOMENTE A OPCAO CORRETA PARA SEU CENARIO
// ============================================================================
// ⚠️  Apenas UMA linha "const LOCAL_API_URL" deve estar ativa por vez!

// OPCAO 1: Emulador Android
// const LOCAL_API_URL = 'http://10.0.2.2:8000/api/v1';

// OPCAO 2: Emulador iOS / Simulator
// const LOCAL_API_URL = 'http://localhost:8000/api/v1';

// OPCAO 3: Dispositivo fisico - MESMA REDE WiFi (mais rapido, sem tunnel)
// Como usar: rode "ipconfig" no PC, anote o IP em "Adaptador Wi-Fi" e cole abaixo.
// Backend: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
// const LOCAL_API_URL = 'http://192.168.200.73:8000/api/v1'; // <- altere o IP se mudar

// OPCAO 4: Dispositivo fisico - REDES DIFERENTES (tunnel, celular no 4G/5G ou outra rede)
// URL PERMANENTE - nunca muda! Inicie o tunnel com: .\start_tunnel.ps1
const LOCAL_API_URL = 'https://fitness-store-mgmt-api.loca.lt/api/v1';

// OPCAO 5: Forcando producao (Render) mesmo em dev - util para testar deploy
// const LOCAL_API_URL = 'https://fitness-backend-x1qn.onrender.com/api/v1';

// ============================================================================
// URL de producao (nao editar)
// ============================================================================
const PRODUCTION_URL = process.env.EXPO_PUBLIC_API_URL || 'https://fitness-backend-x1qn.onrender.com/api/v1';

// ============================================================================
// SELECAO AUTOMATICA DE AMBIENTE
// - Desenvolvimento (npx expo start): usa LOCAL_API_URL
// - Producao (eas update): usa PRODUCTION_URL
// ============================================================================

export const API_CONFIG = {
  BASE_URL: __DEV__ ? LOCAL_API_URL : PRODUCTION_URL,
  // BASE_URL: PRODUCTION_URL,  // Forcando Render para testes
  TIMEOUT: 30000, // 30 segundos
};

// Configuracoes do Sentry (Error Tracking)
export const SENTRY_CONFIG = {
  DSN: 'https://f0a8f44b129143c8689af5af8b20ee82@o4510386072715264.ingest.us.sentry.io/4510386085298176',
  ENABLED: !__DEV__, // Desabilitado em desenvolvimento, ativado em producao
  TRACES_SAMPLE_RATE: 1.0,
};

// Configuracoes do app
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

// Configuracoes de paginacao
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
