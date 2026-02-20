/**
 * Configuracoes do ambiente e API
 * Centralize todas as configs do app aqui
 */

// ============================================================================
// CONFIGURACAO DE REDE - ESCOLHA UMA OPCAO ABAIXO
// ============================================================================

// OPCAO 1: Emulador Android
// const LOCAL_API_URL = 'http://10.0.2.2:8000/api/v1';

// OPCAO 2: Emulador iOS / Simulator
// const LOCAL_API_URL = 'http://localhost:8000/api/v1';

// OPCAO 3: Dispositivo Fisico (mesma rede WiFi)
// Para descobrir seu IP: rode "ipconfig" no terminal e procure em
// "Adaptador de Rede sem Fio Wi-Fi" o campo "Endereco IPv4"
// Backend deve estar rodando: uvicorn app.main:app --reload --host 0.0.0.0
const LOCAL_API_URL = 'http://192.168.100.158:8000/api/v1'; // IP WiFi local (PC e celular na mesma rede)
// OPCAO 4: Tunnel localhost.run (redes diferentes / celular fora do WiFi)
// Para iniciar: .\start_tunnel.ps1 (na raiz do projeto)
// O script exibe a URL do tunel no terminal - copie e cole aqui no formato:
//   https://XXXXXXXXXXXXXXXX.lhr.life/api/v1
//
// ATENCAO: Algumas redes corporativas (FortiGuard, etc.) bloqueiam dominios
//    *.lhr.life como "Phishing". Se isso ocorrer, use a OPCAO 3 (IP local WiFi)
//    ou conecte o celular a uma rede diferente (dados moveis, hotspot).
//
// Atualize a URL abaixo com a URL atual do tunel (muda a cada reinicio):
// const LOCAL_API_URL = 'https://fd97bc20c4f68c.lhr.life/api/v1'; // Tunnel localhost.run (redes diferentes)

// OPCAO 5: Producao Render.com
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
