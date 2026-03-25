/**
 * Cliente Axios configurado com interceptors
 * Gerencia autenticação, tokens e tratamento de erros
 */

import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
// import * as Sentry from 'sentry-expo'; // TEMP: Desabilitado
import { API_CONFIG } from '@/constants/Config';
import { getAccessToken, saveAccessToken, clearAuthData } from './storage';
import { loadingManager } from './loadingManager';
import { logError } from './debugLog';
import type { ApiError } from '@/types';

/**
 * Callback para logout forçado
 * Será configurado pelo authStore para evitar dependência circular
 */
let onForceLogoutCallback: ((reason: string) => Promise<void>) | null = null;

/**
 * Configura o callback de logout forçado
 * Deve ser chamado ao inicializar o authStore
 */
export function setForceLogoutCallback(callback: (reason: string) => Promise<void>) {
  onForceLogoutCallback = callback;
}

/**
 * Callback para invalidar cache do React Query
 * Será configurado pelo QueryClientProvider
 */
let onInvalidateQueriesCallback: (() => void) | null = null;

/**
 * Configura o callback para invalidar queries
 * Deve ser chamado ao inicializar o QueryClient
 */
export function setInvalidateQueriesCallback(callback: () => void) {
  onInvalidateQueriesCallback = callback;
}

/**
 * Instância do Axios configurada
 */
export const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    // Necessário para localtunnel (loca.lt) — evita página de aviso do tunnel
    'bypass-tunnel-reminder': 'true',
  },
});

/**
 * Interceptor de REQUEST - adiciona token JWT e gerencia loading
 */
api.interceptors.request.use(
  async (config) => {
    const token = await getAccessToken();

    // Skip Authorization for signup-related endpoints
    const isSignupEndpoint = config.url?.includes('/auth/signup') ||
                              config.url?.includes('/auth/check-email') ||
                              config.url?.includes('/auth/check-slug');

    if (token && config.headers && !isSignupEndpoint) {
      config.headers.Authorization = `Bearer ${token}`;
      // Marcar que esta requisição tinha Authorization
      (config as any)._hadAuth = true;

      // Log do token em desenvolvimento
      if (__DEV__) {
        console.log(`🔑 Token presente: ${token.substring(0, 20)}...`);
      }
    } else {
      // Marcar ausência de Authorization
      (config as any)._hadAuth = false;
      if (__DEV__) {
        if (isSignupEndpoint) {
          console.log('🔓 Endpoint de signup - sem Authorization');
        } else {
          console.log('⚠️ Nenhum token encontrado');
        }
      }
    }

    // Log em desenvolvimento com URL completa
    if (__DEV__) {
      try {
        const fullUrl = api.getUri(config);
        console.log(`🚀 ${config.method?.toUpperCase()} ${fullUrl}`);
      } catch {
        console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
      }
    }

    // Show loading unless skipLoading header is present
    const skipLoading = config.headers?.['X-Skip-Loading'] === 'true';
    if (!skipLoading) {
      // Extract custom loading message if provided
      const loadingMessage = config.headers?.['X-Loading-Message'] as string | undefined;
      loadingManager.show(loadingMessage);
    }

    return config;
  },
  (error) => {
    // Hide loading on request error
    loadingManager.hide();
    return Promise.reject(error);
  }
);

/**
 * Interceptor de RESPONSE - trata erros e gerencia loading
 */
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Hide loading on successful response
    const skipLoading = response.config.headers?.['X-Skip-Loading'] === 'true';
    if (!skipLoading) {
      loadingManager.hide();
    }

    // Log em desenvolvimento
    if (__DEV__) {
      console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    }
    return response;
  },
  async (error: AxiosError<ApiError>) => {
    // Hide loading on error
    const skipLoading = error.config?.headers?.['X-Skip-Loading'] === 'true';
    if (!skipLoading) {
      loadingManager.hide();
    }
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    
    // Log resumido em desenvolvimento
    if (__DEV__) {
      const method = error.config?.method?.toUpperCase();
      const url = error.config?.url;
      const status = error.response?.status;
      const rawDetail = error.response?.data?.detail as any;
      const detail = typeof rawDetail === 'string' ? rawDetail : (() => {
        try { return JSON.stringify(rawDetail); } catch { return String(rawDetail); }
      })();

      // Log em arquivo via backend
      logError('API', `${method} ${url} - ${status || 'Network Error'}`, {
        status,
        detail: detail || error.message,
        code: error.code,
      });
    }
    
    // Erro de rede (sem resposta do servidor)
    if (!error.response) {
      const networkError = error.code === 'ECONNABORTED' 
        ? 'Tempo de conexão esgotado. Verifique sua internet.'
        : error.code === 'ERR_NETWORK'
        ? 'Erro de rede. Verifique se o servidor está rodando em ' + API_CONFIG.BASE_URL
        : 'Não foi possível conectar ao servidor. Verifique sua conexão.';
      
      // TEMP: Sentry desabilitado
      // Sentry.Native.captureException(error, {
      //   tags: {
      //     error_type: 'network_error',
      //     error_code: error.code || 'unknown',
      //   },
      //   extra: {
      //     url: error.config?.url,
      //     method: error.config?.method,
      //     baseURL: error.config?.baseURL,
      //   },
      // });
      
      return Promise.reject(new Error(networkError));
    }
    
    // Token expirado (401) -> forçar logout
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Apenas forçar logout se a requisição tinha Authorization
      const hadAuth = (originalRequest as any)._hadAuth === true;
      if (hadAuth) {
        console.log('🔒 Token expirado ou inválido - iniciando logout forçado');

        // 1. Limpar AsyncStorage
        await clearAuthData();

        // 2. Invalidar todo o cache do React Query
        if (onInvalidateQueriesCallback) {
          console.log('🗑️ Invalidando cache do React Query');
          onInvalidateQueriesCallback();
        }

        // 3. Chamar logout forçado no authStore
        if (onForceLogoutCallback) {
          const reason = error.response?.status === 401
            ? 'Sessão expirada. Faça login novamente.'
            : 'Acesso não autorizado. Faça login novamente.';

          console.log('🚪 Executando logout forçado');
          await onForceLogoutCallback(reason);
        }

        // 4. Retornar erro específico
        return Promise.reject(new Error('Sessão inválida'));
      }

      // Se não havia Authorization no request, não forçar logout; apenas repassar erro
      return Promise.reject(error);
    }

    // 403 (proibido): não forçar logout automaticamente
    // Motivos comuns: falta de permissão, usuário inativo, ausência de Authorization
    if (error.response?.status === 403) {
      const hadAuth = (originalRequest as any)._hadAuth === true;
      const detail = error.response?.data?.detail as string | undefined;

      // TEMP: Sentry desabilitado
      // Sentry.Native.captureException(error, {
      //   tags: {
      //     error_type: 'forbidden',
      //     status: 403,
      //     had_auth: hadAuth,
      //   },
      //   extra: {
      //     url: error.config?.url,
      //     method: error.config?.method,
      //     detail,
      //   },
      // });

      // Log informativo para diagnosticar, mas não deslogar
      if (__DEV__) {
        console.log(`🛑 403 recebido${hadAuth ? ' (com Authorization)' : ''}: ${detail || 'Sem detalhe'}`);
      }

      // Caso específico: usuário inativo -> opcionalmente orientar logout, mas manter sessão aqui
      if (detail && /inativo/i.test(detail)) {
        return Promise.reject(new Error('Usuário inativo. Contate o administrador.'));
      }

      // Demais casos: retornar erro sem encerrar sessão
      return Promise.reject(new Error(detail || 'Acesso não autorizado'));
    }
    
    // TEMP: Sentry desabilitado
    // if (error.response?.status === 400 || error.response?.status >= 500) {
    //   Sentry.Native.captureException(error, {
    //     tags: {
    //       error_type: error.response.status >= 500 ? 'server_error' : 'bad_request',
    //       status: error.response.status,
    //     },
    //     extra: {
    //       url: error.config?.url,
    //       method: error.config?.method,
    //       detail: error.response?.data?.detail,
    //       requestData: error.config?.data,
    //     },
    //   });
    // }
    
    // Retornar erro formatado (preserva status no objeto para detecção nos catch dos serviços)
    const rawDetail = error.response?.data?.detail as any;
    const errorMessage = typeof rawDetail === 'string'
      ? rawDetail
      : (() => { try { return JSON.stringify(rawDetail); } catch { return 'Erro ao comunicar com o servidor'; } })();
    const formattedError = new Error(errorMessage || 'Erro ao comunicar com o servidor');
    (formattedError as any).status = error.response?.status;
    return Promise.reject(formattedError);
  }
);

export default api;
