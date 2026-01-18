/**
 * Hook para gerenciar Expo Push Notifications
 * Handles permissions, token registration, e foreground notifications
 */
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useNotificationStore } from '../store/notificationStore';
import { createNotification } from '../types/notification';
import { notificationService } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';

// Configurar comportamento padrão das notificações
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const { setPushToken, addNotification, config } = useNotificationStore();
  const { token: authToken } = useAuthStore();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Registrar para push notifications
    registerForPushNotificationsAsync()
      .then(async (token) => {
        if (token) {
          setPushToken(token);
          console.log('📱 Push token registrado localmente:', token);

          // Registrar no backend se autenticado
          if (authToken) {
            try {
              await notificationService.registerToken(token, Platform.OS);
              console.log('✅ Token registrado no backend');
            } catch (error) {
              console.error('❌ Erro ao registrar token no backend:', error);
            }
          }
        } else {
          console.log('📱 Push token não disponível (modo desenvolvimento sem projectId)');
        }
      })
      .catch((error) => {
        console.error('❌ Erro ao registrar push notifications:', error);
        // App continues without push token
      });

    // Listener: notificação recebida enquanto app está aberto (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('🔔 Notificação recebida (foreground):', notification);

      // Criar notificação in-app
      const { title, body, data } = notification.request.content;
      const notif = createNotification(
        (data?.type as any) || 'info',
        title || 'Notificação',
        body || '',
        {
          data: data || {},
          route: data?.route,
          routeParams: data?.routeParams,
        }
      );

      addNotification(notif);
    });

    // Listener: usuário tocou na notificação
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notificação tocada:', response);

      const { notification } = response;
      const { data } = notification.request.content;

      // Navegação será tratada pelo NotificationBanner se houver route em data
      if (data?.route) {
        console.log('🔀 Navegando para:', data.route);
        // A navegação será feita pelo banner ou você pode implementar aqui
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [authToken]);

  return {
    // Enviar notificação local (teste)
    sendLocalNotification: async (title: string, body: string, data?: any) => {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: config.sound ? 'default' : undefined,
        },
        trigger: null,  // Imediato
      });
    },

    // Agendar notificação
    scheduleNotification: async (
      title: string,
      body: string,
      seconds: number,
      data?: any
    ) => {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: config.sound ? 'default' : undefined,
        },
        trigger: { seconds },
      });
    },

    // Cancelar todas notificações agendadas
    cancelAllScheduled: async () => {
      await Notifications.cancelAllScheduledNotificationsAsync();
    },
  };
}

/**
 * Registrar para push notifications e obter token
 */
async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  let token;

  if (Device.isDevice) {
    // Verificar permissões
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('⚠️ Permissão de notificação negada');
      return undefined;
    }

    // Obter token (com tratamento de erro para desenvolvimento)
    try {
      token = (await Notifications.getExpoPushTokenAsync()).data;
    } catch (error: any) {
      // Gracefully handle ANY error related to projectId or push tokens
      // Common errors: E_NO_PROJECT_ID, "No 'projectId' found", etc.
      if (__DEV__) {
        console.log('💡 Push notifications remotas não disponíveis (modo desenvolvimento)');
        console.log('   → Notificações locais e agendadas funcionam normalmente');
      }
      // Return undefined instead of throwing - app continues with local notifications
      return undefined;
    }
  } else {
    console.warn('⚠️ Push notifications só funcionam em dispositivo físico');
  }

  // Configuração Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return token;
}
