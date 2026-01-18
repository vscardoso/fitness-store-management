/**
 * Zustand store para gerenciamento de notificações
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Notification,
  NotificationFilters,
  NotificationDisplayConfig,
  createNotification,
  NotificationType,
} from '../types/notification';

const NOTIFICATIONS_STORAGE_KEY = '@notifications';
const CONFIG_STORAGE_KEY = '@notification_config';

interface NotificationStore {
  // Estado
  notifications: Notification[];
  activeNotifications: Notification[];  // Visíveis na tela
  pushToken: string | null;
  config: NotificationDisplayConfig;

  // Ações
  addNotification: (notification: Notification) => void;
  quickNotify: (type: NotificationType, title: string, message: string, options?: Partial<Notification>) => void;
  dismissNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  clearOld: (olderThanDays: number) => void;

  // Configuração
  setPushToken: (token: string) => void;
  updateConfig: (config: Partial<NotificationDisplayConfig>) => void;

  // Histórico
  getNotifications: (filters?: NotificationFilters) => Notification[];
  getUnreadCount: () => number;

  // Persistência
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  // Estado inicial
  notifications: [],
  activeNotifications: [],
  pushToken: null,
  config: {
    sound: true,
    vibrate: true,
    badge: true,
    banner: true,
  },

  // Adicionar notificação
  addNotification: (notification) => {
    set((state) => {
      const newNotifications = [notification, ...state.notifications];

      // Adicionar às ativas se não for auto-dismissed instantaneamente
      const newActive = notification.autoDismiss !== 0
        ? [notification, ...state.activeNotifications]
        : state.activeNotifications;

      // Auto-dismiss
      if (notification.autoDismiss && notification.autoDismiss > 0) {
        setTimeout(() => {
          get().dismissNotification(notification.id);
        }, notification.autoDismiss);
      }

      // Salvar no storage
      setTimeout(() => get().saveToStorage(), 100);

      return {
        notifications: newNotifications,
        activeNotifications: newActive,
      };
    });
  },

  // Atalho para criar e adicionar notificação
  quickNotify: (type, title, message, options = {}) => {
    const notification = createNotification(type, title, message, options);
    get().addNotification(notification);
  },

  // Descartar notificação (remove da tela)
  dismissNotification: (id) => {
    set((state) => ({
      activeNotifications: state.activeNotifications.filter((n) => n.id !== id),
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, dismissed: true } : n
      ),
    }));
  },

  // Marcar como lida
  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }));
    setTimeout(() => get().saveToStorage(), 100);
  },

  // Marcar todas como lidas
  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
    setTimeout(() => get().saveToStorage(), 100);
  },

  // Limpar todas
  clearAll: () => {
    set({ notifications: [], activeNotifications: [] });
    setTimeout(() => get().saveToStorage(), 100);
  },

  // Limpar antigas (mais de X dias)
  clearOld: (olderThanDays) => {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    set((state) => ({
      notifications: state.notifications.filter((n) => n.timestamp > cutoffTime),
    }));
    setTimeout(() => get().saveToStorage(), 100);
  },

  // Configurar push token
  setPushToken: (token) => {
    set({ pushToken: token });
  },

  // Atualizar configuração
  updateConfig: (newConfig) => {
    set((state) => ({
      config: { ...state.config, ...newConfig },
    }));
    setTimeout(async () => {
      await AsyncStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(get().config));
    }, 100);
  },

  // Buscar notificações com filtros
  getNotifications: (filters = {}) => {
    const { notifications } = get();

    return notifications.filter((n) => {
      if (filters.type && n.type !== filters.type) return false;
      if (filters.priority && n.priority !== filters.priority) return false;
      if (filters.read !== undefined && n.read !== filters.read) return false;
      if (filters.startDate && n.timestamp < filters.startDate) return false;
      if (filters.endDate && n.timestamp > filters.endDate) return false;
      return true;
    });
  },

  // Contar não lidas
  getUnreadCount: () => {
    return get().notifications.filter((n) => !n.read).length;
  },

  // Carregar do storage
  loadFromStorage: async () => {
    try {
      const [notificationsData, configData] = await Promise.all([
        AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY),
        AsyncStorage.getItem(CONFIG_STORAGE_KEY),
      ]);

      if (notificationsData) {
        const notifications = JSON.parse(notificationsData);
        set({ notifications });
      }

      if (configData) {
        const config = JSON.parse(configData);
        set({ config });
      }
    } catch (error) {
      console.error('Erro ao carregar notificações do storage:', error);
    }
  },

  // Salvar no storage
  saveToStorage: async () => {
    try {
      const { notifications } = get();
      await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Erro ao salvar notificações no storage:', error);
    }
  },
}));
