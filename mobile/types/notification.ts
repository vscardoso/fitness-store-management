/**
 * Sistema genérico de notificações
 * Suporta: in-app toast, banners, push notifications, e notificações com ações
 */

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'action';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Ação que pode ser executada a partir de uma notificação
 */
export interface NotificationAction {
  id: string;
  label: string;
  onPress: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
}

/**
 * Notificação base
 */
export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  icon?: string;  // Ionicons name
  timestamp: number;
  read: boolean;
  dismissed: boolean;

  // Ações disponíveis (ex: "Confirmar", "Cancelar")
  actions?: NotificationAction[];

  // Contexto adicional
  data?: Record<string, any>;

  // Auto-dismiss após X milissegundos (padrão: 5000)
  autoDismiss?: number;

  // Navegação ao clicar
  route?: string;
  routeParams?: Record<string, any>;
}

/**
 * Configuração de notificação push
 */
export interface PushNotification {
  to: string;  // Push token
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  categoryId?: string;
}

/**
 * Configuração de exibição
 */
export interface NotificationDisplayConfig {
  sound: boolean;
  vibrate: boolean;
  badge: boolean;
  banner: boolean;
}

/**
 * Filtros para histórico
 */
export interface NotificationFilters {
  type?: NotificationType;
  priority?: NotificationPriority;
  read?: boolean;
  startDate?: number;
  endDate?: number;
}

/**
 * Cores por tipo
 */
export const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  info: '#2196F3',      // Azul
  success: '#4CAF50',   // Verde
  warning: '#FF9800',   // Laranja
  error: '#F44336',     // Vermelho
  action: '#9C27B0',    // Roxo
};

/**
 * Ícones padrão por tipo
 */
export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  warning: 'warning-outline',
  error: 'alert-circle-outline',
  action: 'notifications-outline',
};

/**
 * Helper: criar notificação
 */
export function createNotification(
  type: NotificationType,
  title: string,
  message: string,
  options?: Partial<Notification>
): Notification {
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    priority: options?.priority || 'normal',
    title,
    message,
    icon: options?.icon || NOTIFICATION_ICONS[type],
    timestamp: Date.now(),
    read: false,
    dismissed: false,
    autoDismiss: options?.autoDismiss !== undefined ? options.autoDismiss : 5000,
    ...options,
  };
}
