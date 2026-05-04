/**
 * Configuracoes do ambiente e API
 * Centralize todas as configs do app aqui
 */
import Constants from 'expo-constants';

// ============================================================================
// CONFIGURACAO DE REDE
// ============================================================================
// Modo atual: 'local' (mesma rede WiFi) ou 'tunnel' (redes diferentes)
// Para trocar:
//   Mesma rede   → rode: .\use_local.ps1   (ou mude MODE para 'local')
//   Redes difer. → rode: .\start_tunnel.ps1 (atualiza TUNNEL_URL automaticamente)
// ============================================================================

let MODE = 'local' as 'local' | 'tunnel';

// Fallback manual — só usado se auto-detecção falhar
let LOCAL_IP_FALLBACK = '192.168.0.2';

// URL do tunnel — atualizada AUTOMATICAMENTE por .\start_tunnel.ps1 a cada execução
let TUNNEL_URL = 'https://good-mammals-tap.loca.lt';

// Auto-detecta o IP da máquina de desenvolvimento via Metro bundler (hostUri = "192.168.x.x:8081")
function getLocalApiUrl(): string {
  if (MODE === 'tunnel' && TUNNEL_URL) {
    return `${TUNNEL_URL}/api/v1`;
  }
  const hostUri = Constants.expoConfig?.hostUri; // ex: "192.168.0.2:8081"
  const host = hostUri ? hostUri.split(':')[0] : LOCAL_IP_FALLBACK;
  return `http://${host}:8000/api/v1`;
}

const LOCAL_API_URL = getLocalApiUrl();

// Producao (Render.com)
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

// URL base do backend sem o sufixo /api/v1 — usado para montar URLs de imagens
const BACKEND_BASE_URL = API_CONFIG.BASE_URL.replace(/\/api\/v1\/?$/, '');

/**
 * Converte uma image_url relativa (/uploads/...) em URL absoluta.
 * Imagens salvas localmente retornam caminhos relativos; React Native exige URL completa.
 *
 * @param url - image_url do produto/variação
 * @returns URL absoluta ou undefined se vazia
 */
export function getImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  // URLs absolutas e URIs locais do Expo passam sem alteração
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') || url.startsWith('data:')) return url;
  // Caminho relativo (/uploads/...) → prefixar com base do backend
  return `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

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
