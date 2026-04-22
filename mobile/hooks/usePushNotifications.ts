/**
 * Hook para gerenciar Expo Push Notifications
 * Handles permissions, token registration, e foreground notifications
 */
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
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
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const { setPushToken, addNotification, config, pushToken } = useNotificationStore();
  const { token: authToken } = useAuthStore();
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Effect 1: obter token do dispositivo (só uma vez)
  useEffect(() => {
    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) {
          setPushToken(token);
          console.log('📱 Push token obtido:', token);
        } else {
          console.log('📱 Push token não disponível');
        }
      })
      .catch((error) => {
        console.error('❌ Erro ao obter push token:', error);
      });
  }, []);

  // Effect 2: registrar token no backend quando auth estiver pronto
  useEffect(() => {
    if (authToken && pushToken) {
      notificationService.registerToken(pushToken, Platform.OS)
        .then(() => console.log('✅ Token registrado no backend'))
        .catch((error) => console.error('❌ Erro ao registrar token no backend:', error));
    }
  }, [authToken, pushToken]);

  // Effect 3: listeners de notificação
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('🔔 Notificação recebida (foreground):', notification);

      const { title, body, data } = notification.request.content;
      const notif = createNotification(
        (data?.type as any) || 'info',
        title || 'Notificação',
        body || '',
        {
          data: data || {},
          route: data?.route as string | undefined,
          routeParams: data?.routeParams as Record<string, any> | undefined,
        }
      );

      addNotification(notif);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notificação tocada:', response);
      const { data } = response.notification.request.content;
      if (data?.route) {
        router.push(data.route as any);
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

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
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
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
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
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
