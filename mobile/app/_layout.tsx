/**
 * Layout raiz do app
 * Configura providers globais (React Query, Paper, Auth)
 */

import { useEffect, useRef } from 'react';
import { AppState, LogBox, View } from 'react-native';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';

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
import { isSessionIdle, markActivity, startActivityTracking } from '@/services/sessionActivity';
import { IDLE_REASON } from '@/utils/sessionRules';
import GlobalConfirmModalHost, { installGlobalAlertOverride } from '@/components/ui/GlobalConfirmModal';
import UpdateBanner from '@/components/layout/UpdateBanner';
import SystemUpdateOverlay from '@/components/layout/SystemUpdateOverlay';
import { startHistoryTrail, trailRoute } from '@/utils/navTrail';
import { startQueryPersist } from '@/utils/queryPersist';
import { LegalGate } from '@/components/legal/LegalGate';
import DesktopShell from '@/components/layout/DesktopShell';
import ProdutoVitrine from '@/components/vitrine/ProdutoVitrine';
import { vitrineFromLocation } from '@/utils/vitrineUrl';
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

// Endereço só de vitrine (loja.provadorfit.com.br/{slug}/{id}): a cliente vê só o produto, nunca o sistema da lojista
// (sem login, menus, barra lateral, termos nem tutorial). Lido uma vez: o endereço não muda sem recarregar a página.
const VITRINE = vitrineFromLocation();

export default function RootLayout() {
  if (VITRINE) {
    return (
      <SafeAreaProvider>
        <ProdutoVitrine store={VITRINE.slug} id={VITRINE.id} />
      </SafeAreaProvider>
    );
  }
  return <AppLayout />;
}

function AppLayout() {
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  // Guarda os dados das telas principais no aparelho para o app abrir já com eles (os novos chegam por trás)
  useEffect(() => startQueryPersist(queryClient, () => useAuthStore.getState().user?.id), []);
  // Trilha de navegação (telas e gestos de voltar) para achar o que aconteceu quando algo sai errado
  useEffect(() => startHistoryTrail(), []);
  useEffect(() => trailRoute(pathname), [pathname]);
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

  // Sessão só acaba por inatividade (2 horas sem tocar no app), nunca com a pessoa usando. Gestos no app web ficam aqui;
  // no celular o toque é registrado pelo onTouchStart da raiz. Ao voltar para o app, confere na hora se passou do prazo.
  useEffect(() => {
    const stop = startActivityTracking();
    const conferir = async () => {
      if (useAuthStore.getState().isAuthenticated && (await isSessionIdle())) {
        await forceLogout(IDLE_REASON);
      }
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') conferir();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [forceLogout]);

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
      <SafeAreaProvider onTouchStart={markActivity}>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <ErrorProvider>
              <TutorialProvider>
                <StatusBar style="auto" />
                {/* App web em notebook: barra lateral à esquerda (no celular não muda nada) */}
                <DesktopShell>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      gestureEnabled: true,
                    }}
                  />
                </DesktopShell>

                {/* Termos: quem não aceitou a versão atual vai para a tela de aceite */}
                <LegalGate />

                {/* Aviso de versão nova (só no app web) */}
                <UpdateBanner />

                {/* Sistema atualizando: tela única, some sozinha quando o servidor volta */}
                <SystemUpdateOverlay />

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

                {/* Toast global para notificações. O quadro do toast (340 px, invisível quando parado) passava 10 px da borda em telas de 320 px
                    e fazia a página inteira rolar para o lado: o contêiner recorta no tamanho da tela e deixa os toques passarem. */}
                <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
                  <Toast />
                </View>

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
