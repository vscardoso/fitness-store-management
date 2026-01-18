/**
 * Layout raiz do app
 * Configura providers globais (React Query, Paper, Auth)
 */

import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider, MD3LightTheme, Snackbar } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
// import * as Sentry from 'sentry-expo'; // TEMP: Desabilitado por conflito de versão
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { NotificationContainer } from '@/components/notifications/NotificationContainer';
// import { SENTRY_CONFIG } from '@/constants/Config'; // TEMP: Desabilitado
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
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

// Tema moderno e atrativo com Material Design 3
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: 'rgb(103, 80, 164)',
    onPrimary: 'rgb(255, 255, 255)',
    primaryContainer: 'rgb(234, 221, 255)',
    onPrimaryContainer: 'rgb(33, 0, 93)',
    secondary: 'rgb(98, 91, 113)',
    onSecondary: 'rgb(255, 255, 255)',
    secondaryContainer: 'rgb(232, 222, 248)',
    onSecondaryContainer: 'rgb(30, 25, 43)',
    tertiary: 'rgb(125, 82, 96)',
    onTertiary: 'rgb(255, 255, 255)',
    tertiaryContainer: 'rgb(255, 217, 227)',
    onTertiaryContainer: 'rgb(55, 11, 30)',
    error: 'rgb(186, 26, 26)',
    onError: 'rgb(255, 255, 255)',
    errorContainer: 'rgb(255, 218, 214)',
    onErrorContainer: 'rgb(65, 0, 2)',
    background: 'rgb(255, 251, 255)',
    onBackground: 'rgb(29, 27, 30)',
    surface: 'rgb(255, 251, 255)',
    onSurface: 'rgb(29, 27, 30)',
    surfaceVariant: 'rgb(231, 224, 236)',
    onSurfaceVariant: 'rgb(73, 69, 78)',
    outline: 'rgb(122, 117, 127)',
    outlineVariant: 'rgb(202, 196, 208)',
    shadow: 'rgb(0, 0, 0)',
    scrim: 'rgb(0, 0, 0)',
    inverseSurface: 'rgb(50, 47, 51)',
    inverseOnSurface: 'rgb(245, 239, 244)',
    inversePrimary: 'rgb(208, 188, 255)',
    elevation: {
      level0: 'transparent',
      level1: 'rgb(247, 242, 252)',
      level2: 'rgb(243, 236, 250)',
      level3: 'rgb(238, 231, 248)',
      level4: 'rgb(237, 229, 247)',
      level5: 'rgb(234, 226, 246)',
    },
    surfaceDisabled: 'rgba(29, 27, 30, 0.12)',
    onSurfaceDisabled: 'rgba(29, 27, 30, 0.38)',
    backdrop: 'rgba(51, 47, 55, 0.4)',
  },
};

export default function RootLayout() {
  const segments = useSegments();
  const loadUser = useAuthStore((state) => state.loadUser);
  const forceLogout = useAuthStore((state) => state.forceLogout);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const loadNotifications = useNotificationStore((state) => state.loadFromStorage);

  // Inicializar push notifications
  usePushNotifications();

  // Configurar callbacks no interceptor do Axios
  useEffect(() => {
    // Callback de logout forçado
    setForceLogoutCallback(async (reason: string) => {
      await forceLogout(reason);
    });

    // Callback para invalidar cache do React Query (SELETIVO - NÃO limpar auth!)
    setInvalidateQueriesCallback(() => {
      // Invalidar apenas queries de dados de negócio, NUNCA queries de autenticação
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['active-products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      // NÃO invalidar: auth, user, session queries
      console.log('🔄 Cache de dados invalidado (sessão preservada)');
    });

    console.log('✅ Callbacks de autenticação configurados');
  }, [forceLogout]);

  // Carregar usuário e notificações ao iniciar app
  useEffect(() => {
    loadUser();
    loadNotifications();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <StatusBar style="auto" />
            <Slot />

            {/* Global Loading Overlay */}
            <LoadingOverlay />

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
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
