/**
 * Layout raiz do app
 * Configura providers globais (React Query, Paper, Auth)
 */

import { useEffect, useRef } from 'react';
import { LogBox } from 'react-native';
import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';

LogBox.ignoreLogs([
  'expo-notifications',
  'Due to changes in Androids permission requirements',
]);
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { showApiError } from '@/utils/apiError';
import { PaperProvider, MD3LightTheme, Snackbar } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
// import * as Sentry from 'sentry-expo'; // TEMP: Desabilitado por conflito de versão
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { NotificationContainer } from '@/components/notifications/NotificationContainer';
import { TutorialProvider } from '@/contexts/TutorialContext';
import { TutorialOverlay } from '@/components/tutorial';
import { ErrorProvider } from '@/contexts/ErrorContext';
// import { SENTRY_CONFIG } from '@/constants/Config'; // TEMP: Desabilitado
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useBrandingColors, useBrandingStore } from '@/store/brandingStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { setForceLogoutCallback, setInvalidateQueriesCallback } from '@/services/api';
import GlobalConfirmModalHost, { installGlobalAlertOverride } from '@/components/ui/GlobalConfirmModal';
import UpdateBanner from '@/components/layout/UpdateBanner';
import { saveLastRoute } from '@/utils/lastRoute';
import { startHistoryTrail, trailRoute } from '@/utils/navTrail';
import { startQueryPersist } from '@/utils/queryPersist';
import { LegalGate } from '@/components/legal/LegalGate';
import { registerQueryClient } from '@/utils/queryCache';

// TEMP: Sentry desabilitado por conflito de versão
// Sentry.init({
//   dsn: SENTRY_CONFIG.DSN,
//   enableInExpoDevelopment: false,
//   debug: __DEV__,
//   tracesSampleRate: SENTRY_CONFIG.TRACES_SAMPLE_RATE,
//   enabled: SENTRY_CONFIG.ENABLED,
// });

// Criar QueryClient com tratamento centralizado de erros
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Só mostra erro global se a query não tem dados em cache (evita toast em background refresh)
      if (query.state.data === undefined) {
        showApiError(error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Só mostra erro global se a mutation não tem um onError próprio
      if (!mutation.options.onError) {
        showApiError(error);
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

registerQueryClient(queryClient);

/** Mistura a cor com branco (amount 0..1) para tons de fundo suaves. */
function tintColor(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0'),
  );
  return `#${ch.join('')}`;
}

export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams();
  // Guarda os dados das telas principais no aparelho para o app abrir já com eles (os novos chegam por trás)
  useEffect(() => startQueryPersist(queryClient, () => useAuthStore.getState().user?.id), []);
  // Trilha de navegação (telas e gestos de voltar) para achar o que aconteceu quando algo sai errado
  useEffect(() => startHistoryTrail(), []);
  useEffect(() => trailRoute(pathname), [pathname]);
  // Guarda a tela atual: se o app recarregar ou o iPhone fechá-lo, volta para onde estava
  useEffect(() => {
    const qs = Object.entries(searchParams)
      .filter(([, v]) => typeof v === 'string' && (v as string).length > 0 && (v as string).length < 200)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
      .join('&');
    saveLastRoute(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams]);
  const loadUser = useAuthStore((state) => state.loadUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const forceLogout = useAuthStore((state) => state.forceLogout);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const loadNotifications = useNotificationStore((state) => state.loadFromStorage);
  const brandingColors = useBrandingColors();
  const brandingInitialSyncAttempted = useBrandingStore((state) => state.initialSyncAttempted);
  const fetchBrandingFromServer = useBrandingStore((state) => state.fetchFromServer);

  const theme = {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: brandingColors.primary,
      secondary: brandingColors.secondary,
      tertiary: brandingColors.accent,
      // Tons derivados: sem eles os componentes do Paper (botão segmentado, chips) ficam no roxo padrão
      primaryContainer: tintColor(brandingColors.primary, 0.85),
      secondaryContainer: tintColor(brandingColors.primary, 0.85),
      onPrimaryContainer: brandingColors.primary,
      onSecondaryContainer: brandingColors.primary,
      surfaceTint: brandingColors.primary,
    },
  };

  // Inicializar push notifications
  usePushNotifications();

  // Web (PWA): theme-color segue a cor da loja, para a barra de status do iOS combinar com o header
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', brandingColors.primary);
  }, [brandingColors.primary]);

  // Substitui Alert.alert por modal global para padronizar UX e evitar popup nativo.
  useEffect(() => {
    installGlobalAlertOverride();
  }, []);

  // Configurar callbacks no interceptor do Axios
  useEffect(() => {
    // Callback de logout forçado
    setForceLogoutCallback(async (reason: string) => {
      await forceLogout(reason);
    });

    // Callback para limpar cache do React Query (sessão expirada = estado limpo)
    setInvalidateQueriesCallback(() => {
      queryClient.clear();
      console.log('🗑️ Cache React Query limpo (sessão expirada)');
    });

    console.log('✅ Callbacks de autenticação configurados');
  }, [forceLogout]);

  // Carregar usuário e notificações ao iniciar app
  useEffect(() => {
    loadUser();
    loadNotifications();
  }, []);

  // Sessão caiu (401, logout): volta ao login de qualquer tela, não só das abas
  const wasAuthenticated = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated) {
      router.replace('/(auth)/login');
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, router]);

  // Hidrata branding com token válido caso store local não esteja sincronizado.
  useEffect(() => {
    if (isAuthenticated && !brandingInitialSyncAttempted) {
      fetchBrandingFromServer().catch(() => {});
    }
  }, [isAuthenticated, brandingInitialSyncAttempted, fetchBrandingFromServer]);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <ErrorProvider>
              <TutorialProvider>
                <StatusBar style="auto" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    gestureEnabled: true,
                  }}
                />

                {/* Termos: quem não aceitou a versão atual vai para a tela de aceite */}
                <LegalGate />

                {/* Aviso de versão nova (só no app web) */}
                <UpdateBanner />

                {/* Global Loading Overlay */}
                <LoadingOverlay />

                {/* Tutorial System Overlay */}
                <TutorialOverlay />

                {/* Notification System */}
                <NotificationContainer />

                {/* Snackbar para mensagens de erro de autenticação */}
                <Snackbar
                  visible={!!error}
                  onDismiss={clearError}
                  duration={5000}
                  action={{
                    label: 'OK',
                    onPress: clearError,
                  }}
                  style={{ marginBottom: 20 }}
                >
                  {error}
                </Snackbar>

                {/* Toast global para notificações */}
                <Toast />

                {/* Intercepta Alert.alert e renderiza modal padronizado */}
                <GlobalConfirmModalHost />
              </TutorialProvider>
            </ErrorProvider>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
