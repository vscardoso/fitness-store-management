/**
 * Cliente Axios configurado com interceptors
 * Gerencia autenticação, tokens e tratamento de erros
 */

import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
// import * as Sentry from 'sentry-expo'; // TEMP: Desabilitado
import { API_CONFIG } from '@/constants/Config';
import { getAccessToken, getRefreshToken, saveAccessToken, saveRefreshToken, clearAuthData } from './storage';
import { loadingManager } from './loadingManager';
import { OFFLINE_ERROR, friendlyFromText, safeMessage, validationMessage } from '@/utils/friendlyError';
import { logError } from './debugLog';
import { reportApiFailure } from './systemStatus';
import { isSessionIdle } from './sessionActivity';
import { IDLE_REASON, REFRESH_ATTEMPTS, refreshFailureKind, refreshRetryDelayMs, sentTokenIsStale } from '@/utils/sessionRules';

/** Espera antes de cada nova tentativa de leitura quando o servidor não responde (ms). */
export const READ_RETRY_DELAYS_MS = [1000, 2000, 4000, 6000];
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
 * Chamado SEMPRE que uma resposta 401 encerra a sessão (mesmo que o estado já estivesse "deslogado"): leva ao login.
 * O layout raiz só redirecionava quando isAuthenticated passava de true para false; com a sessão já inativa
 * (token sobrando, estado fora de sincronia) o 401 limpava tudo e a pessoa ficava na tela, sem dados.
 */
let onSessionEndedCallback: (() => void) | null = null;
export function setSessionEndedCallback(callback: (() => void) | null) {
  onSessionEndedCallback = callback;
}

/** Resultado da renovação: token novo, ou o tipo de falha (só `definitive` encerra a sessão). */
type RefreshOutcome = { token: string } | { failure: 'definitive' | 'transient' };

let refreshPromise: Promise<RefreshOutcome> | null = null;

/**
 * Configura o callback para invalidar queries
 * Deve ser chamado ao inicializar o QueryClient
 */
export function setInvalidateQueriesCallback(callback: () => void) {
  onInvalidateQueriesCallback = callback;
}

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

// Rotas em que 401 significa credencial errada, não sessão expirada
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/signup', '/auth/check-email', '/auth/check-slug', '/auth/refresh'];
const isPublicAuthEndpoint = (url?: string) => !!url && PUBLIC_AUTH_PATHS.some((p) => url.includes(p));

let expiringSession: Promise<void> | null = null;

/**
 * Encerra a sessão: limpa tokens, cache do React Query e estado do authStore.
 * O redirecionamento ao login acontece no layout raiz quando isAuthenticated vira false.
 */
const expireSession = (reason: string = 'Sessão expirada. Faça login novamente.'): Promise<void> => {
  if (expiringSession) return expiringSession;

  expiringSession = (async () => {
    const { useAuthStore } = await import('@/store/authStore');
    const stillActive = useAuthStore.getState().isAuthenticated || !!(await getAccessToken());
    if (!stillActive) {
      // Já estava deslogado, mas um pedido com 401 chegou numa tela de dentro do app: garante o login.
      try { onSessionEndedCallback?.(); } catch { /* navegação indisponível */ }
      return;
    }

    console.log('🔒 Sessão inválida após tentativa de refresh - iniciando logout forçado');
    await clearAuthData();

    if (onInvalidateQueriesCallback) {
      onInvalidateQueriesCallback();
    }

    if (onForceLogoutCallback) {
      await onForceLogoutCallback(reason);
    } else {
      await useAuthStore.getState().forceLogout(reason);
    }
    try { onSessionEndedCallback?.(); } catch { /* o layout raiz também redireciona pelo estado */ }
  })().finally(() => {
    expiringSession = null;
  });

  return expiringSession;
};

/** Só uma aba renova por vez (Web Locks); sem o recurso, vale só a trava dentro da própria aba. */
const withCrossTabLock = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
  if (locks && typeof locks.request === 'function') {
    try {
      return await locks.request('provador-refresh-sessao', fn);
    } catch {
      /* trava indisponível (aba em segundo plano, política do navegador): segue sem ela */
    }
  }
  return fn();
};

const statusOf = (err: any): number | undefined => err?.response?.status ?? err?.status;

const runRefresh = (staleAccess: string | null): Promise<RefreshOutcome> =>
  withCrossTabLock(async (): Promise<RefreshOutcome> => {
    // Outra aba já renovou enquanto esperávamos a vez: usa o token que ela guardou, sem gastar o refresh_token de novo.
    const current = await getAccessToken();
    if (current && staleAccess && current !== staleAccess) return { token: current };

    let used = await getRefreshToken();
    if (!used) {
      if (__DEV__) console.log('⚠️ Refresh token ausente - não foi possível renovar sessão');
      return { failure: 'definitive' };
    }

    for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
      try {
        // Usa a mesma instância com headers de controle para evitar loop de auth/loading.
        const { data } = await api.post<RefreshResponse>(
          '/auth/refresh',
          { refresh_token: used },
          { headers: { 'X-Skip-Auth': 'true', 'X-Skip-Loading': 'true' } }
        );
        await saveAccessToken(data.access_token);
        await saveRefreshToken(data.refresh_token);
        if (__DEV__) console.log('♻️ Sessão renovada com sucesso via refresh token');
        return { token: data.access_token };
      } catch (refreshError) {
        const status = statusOf(refreshError);
        if (refreshFailureKind(status) === 'definitive') {
          // O token usado pode ter sido trocado por outra aba no meio do caminho: se o guardado agora é outro, tenta com ele.
          const latest = await getRefreshToken();
          if (latest && latest !== used) {
            used = latest;
            continue;
          }
          return { failure: 'definitive' };
        }
        // Limite de pedidos (429), servidor reiniciando (5xx) ou rede: a sessão NÃO acabou. Espera e tenta de novo.
        if (attempt < REFRESH_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, refreshRetryDelayMs(attempt)));
        }
      }
    }
    return { failure: 'transient' };
  });

const refreshAccessToken = async (staleAccess: string | null): Promise<RefreshOutcome> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = runRefresh(staleAccess);

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

/**
 * Instância do Axios configurada
 */
export const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    // Necessário só para localtunnel (loca.lt) em desenvolvimento; em produção o cabeçalho extra
    // exigiria preflight liberado no CORS (e já derrubou o login uma vez).
    ...(String(API_CONFIG.BASE_URL).includes('loca.lt') ? { 'bypass-tunnel-reminder': 'true' } : {}),
  },
});

/**
 * Interceptor de REQUEST - adiciona token JWT e gerencia loading
 */
api.interceptors.request.use(
  async (config) => {
    const token = await getAccessToken();
    const skipAuth = config.headers?.['X-Skip-Auth'] === 'true';

    // 2 horas sem nenhum toque na tela: a sessão acaba (só por falta de uso; usando, nunca). O pedido nem sai.
    if (token && !skipAuth && !isPublicAuthEndpoint(config.url) && (await isSessionIdle())) {
      await expireSession(IDLE_REASON);
      throw Object.assign(new Error('Sessão encerrada por inatividade'), { sessionExpired: true });
    }

    // Skip Authorization for signup-related endpoints
    const isSignupEndpoint = config.url?.includes('/auth/signup') ||
                              config.url?.includes('/auth/check-email') ||
                              config.url?.includes('/auth/check-slug');

    if (token && config.headers && !isSignupEndpoint && !skipAuth) {
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

    // Adicionar tenant_id do authStore (multi-tenant)
    try {
      const { useAuthStore } = await import('@/store/authStore');
      const tenant_id = useAuthStore.getState().tenant_id;
      if (tenant_id) {
        config.headers['X-Tenant-Id'] = tenant_id.toString();
        if (__DEV__) {
          console.log(`🏢 Tenant-ID: ${tenant_id}`);
        }
      }
    } catch (err) {
      // Silenciosamente ignorar se authStore não estiver disponível ainda
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
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean; _retryRead?: number };

    // Leitura (GET) que falhou por rede ou 502/503/504 (servidor reiniciando numa atualização, sinal fraco): tenta de novo
    // até 4 vezes, esperando mais a cada uma (1, 2, 4 e 6 s: cobre uma reinicialização de ~13 s sem a pessoa ver erro).
    // Só GET: repetir gravação poderia duplicar venda ou entrada.
    const readAttempts = originalRequest?._retryRead ?? 0;
    if (
      originalRequest &&
      String(originalRequest.method).toLowerCase() === 'get' &&
      readAttempts < READ_RETRY_DELAYS_MS.length &&
      error.code !== 'ERR_CANCELED' &&
      (!error.response || [502, 503, 504].includes(error.response.status))
    ) {
      originalRequest._retryRead = readAttempts + 1;
      await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAYS_MS[readAttempts]));
      return api(originalRequest);
    }

    // Servidor fora (reinício da publicação) ou sem rede: confere o /health e, se for isso mesmo, mostra a tela única de atualização
    if (error.code !== 'ERR_CANCELED' && (!error.response || [502, 503, 504].includes(error.response.status))) {
      reportApiFailure();
    }

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
        ? 'A conexão demorou demais. Verifique sua internet e tente de novo.'
        : OFFLINE_ERROR;
      
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
    
    // 401 -> refresh silencioso uma vez; se falhar (ou o reenvio também der 401), volta ao login
    if (error.response?.status === 401) {
      if (isPublicAuthEndpoint(originalRequest.url)) {
        // 401 de login ou da renovação: a frase do servidor ("Email ou senha incorretos"), não o texto técnico do axios
        const d = error.response?.data?.detail as any;
        const frase = typeof d === 'string' && d ? safeMessage(d) : 'Email ou senha incorretos';
        return Promise.reject(Object.assign(new Error(frase), { status: 401, response: error.response }));
      }

      const hadAuth = (originalRequest as any)._hadAuth === true;
      const sentAuth = (originalRequest.headers as any)?.Authorization;

      // O pedido saiu com um token que já não é o guardado (outra aba renovou, ou a pessoa entrou de novo no meio do caminho):
      // repete com o de agora. Antes, esse 401 atrasado apagava a sessão nova (4 logins em 33 s, 10/11/2026).
      if (hadAuth && !(originalRequest as any)._staleRetried) {
        const current = await getAccessToken();
        if (sentTokenIsStale(sentAuth, current)) {
          (originalRequest as any)._staleRetried = true;
          if (!originalRequest.headers) {
            originalRequest.headers = {};
          }
          originalRequest.headers.Authorization = `Bearer ${current}`;
          return api(originalRequest);
        }
      }

      if (hadAuth && !originalRequest._retry) {
        originalRequest._retry = true;
        const outcome = await refreshAccessToken(typeof sentAuth === 'string' ? sentAuth.replace(/^Bearer /, '') : null);

        if ('token' in outcome) {
          if (!originalRequest.headers) {
            originalRequest.headers = {};
          }
          originalRequest.headers.Authorization = `Bearer ${outcome.token}`;

          if (__DEV__) {
            console.log('🔁 Reenviando requisição após refresh de token');
          }

          return api(originalRequest);
        }

        // Falha passageira (limite de pedidos, servidor reiniciando, rede): a sessão continua valendo, só este pedido falha.
        if (outcome.failure === 'transient') {
          return Promise.reject(
            Object.assign(new Error('Não consegui renovar sua sessão agora. Tente de novo em instantes.'), { status: 0, transientAuth: true })
          );
        }
      }

      // Sem token novo: a sessão acabou (também cobre sessão salva sem token válido)
      await expireSession();
      return Promise.reject(Object.assign(new Error('Sessão inválida'), { sessionExpired: true }));
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
      return Promise.reject(new Error(safeMessage(detail, 'Você não tem permissão para esta ação.')));
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
    const httpStatus = error.response?.status ?? 0;
    // Nunca mostra SQL, lista de campos crua nem "Request failed...": frase clara em português
    const errorMessage = typeof rawDetail === 'string'
      ? safeMessage(rawDetail)
      : Array.isArray(rawDetail)
      ? validationMessage(rawDetail)
      : rawDetail && typeof rawDetail === 'object' && typeof rawDetail.message === 'string'
      ? safeMessage(rawDetail.message)   // detalhe em objeto ({code, message, ...}): usa a frase e guarda o objeto em `detail`
      : httpStatus >= 500
      ? friendlyFromText(null)
      : 'Não foi possível concluir. Confira os dados e tente de novo.';
    const formattedError = new Error(errorMessage);
    (formattedError as any).status = error.response?.status;
    if (rawDetail && typeof rawDetail === 'object' && !Array.isArray(rawDetail)) (formattedError as any).detail = rawDetail;
    return Promise.reject(formattedError);
  }
);

export default api;
