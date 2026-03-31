/**
 * Layout raiz do app
 * Configura providers globais (React Query, Paper, Auth)
 */

import { useEffect } from 'react';
import { LogBox } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';

LogBox.ignoreLogs([
  'expo-notifications',
  'Due to changes in Androids permission requirements',
]);
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// TEMP: Sentry desabilitado por conflito de versão
// Sentry.init({
//   dsn: SENTRY_CONFIG.DSN,
//   enableInExpoDevelopment: false,
//   debug: __DEV__,
//   tracesSampleRate: SENTRY_CONFIG.TRACES_SAMPLE_RATE,
//   enabled: SENTRY_CONFIG.ENABLED,
// });

// Criar QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutos
    },
  },
});

export default function RootLayout() {
  const segments = useSegments();
  const loadUser = useAuthStore((state) => state.loadUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const forceLogout = useAuthStore((state) => state.forceLogout);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const loadNotifications = useNotificationStore((state) => state.loadFromStorage);
  const brandingColors = useBrandingColors();
  const brandingSynced = useBrandingStore((state) => state.synced);
  const fetchBrandingFromServer = useBrandingStore((state) => state.fetchFromServer);

  const theme = {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: brandingColors.primary,
      secondary: brandingColors.secondary,
      tertiary: brandingColors.accent,
    },
  };

  // Inicializar push notifications
  usePushNotifications();

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

  // Hidrata branding com token valido caso store local nao esteja sincronizado.
  useEffect(() => {
    if (isAuthenticated && !brandingSynced) {
      fetchBrandingFromServer().catch(() => {});
    }
  }, [isAuthenticated, brandingSynced, fetchBrandingFromServer]);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <ErrorProvider>
              <TutorialProvider>
                <StatusBar style="auto" />
                <Slot />

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
              </TutorialProvider>
            </ErrorProvider>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
