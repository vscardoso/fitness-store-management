/**
 * Banner de notificação in-app
 * Aparece no topo da tela com animação slide-down
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Notification, NOTIFICATION_COLORS } from '../../types/notification';
import { useNotificationStore } from '../../store/notificationStore';
import { Colors } from '@/constants/Colors';

interface NotificationBannerProps {
  notification: Notification;
}

export function NotificationBanner({ notification }: NotificationBannerProps) {
  const router = useRouter();
  const { dismissNotification, markAsRead, config } = useNotificationStore();
  const slideAnim = React.useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    // Animação de entrada
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();

    // Vibrar se configurado
    if (config.vibrate) {
      Vibration.vibrate(100);
    }

    // Som é tratado via Expo Notifications

    return () => {
      // Animação de saída se componente for desmontado
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
  }, []);

  const handlePress = () => {
    markAsRead(notification.id);
    dismissNotification(notification.id);

    // Navegar se houver rota
    if (notification.route) {
      router.push({
        pathname: notification.route as any,
        params: notification.routeParams,
      });
    }
  };

  const handleDismiss = () => {
    dismissNotification(notification.id);
  };

  // Fallback evita strings inválidas como "undefined20" quando o tipo é desconhecido
  const color = NOTIFICATION_COLORS[notification.type] ?? Colors.light.primary;
  const hasActions = notification.actions && notification.actions.length > 0;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity
        style={[styles.banner, { borderLeftColor: color }]}
        onPress={handlePress}
        activeOpacity={0.9}
      >
        {/* Ícone */}
        <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
          <Ionicons name={notification.icon as any} size={24} color={color} />
        </View>

        {/* Conteúdo */}
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {notification.message}
          </Text>

          {/* Ações */}
          {hasActions && (
            <View style={styles.actionsContainer}>
              {notification.actions!.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={[
                    styles.actionButton,
                    action.style === 'destructive' && styles.actionButtonDestructive,
                  ]}
                  onPress={async () => {
                    await action.onPress();
                    dismissNotification(notification.id);
                  }}
                >
                  <Text
                    style={[
                      styles.actionText,
                      action.style === 'destructive' && styles.actionTextDestructive,
                    ]}
                  >
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Botão de fechar */}
        <TouchableOpacity style={styles.closeButton} onPress={handleDismiss}>
          <Ionicons name="close" size={20} color="#666" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 16,
    paddingTop: 50,  // Space for status bar
  },
  banner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 4,
    flexDirection: 'row',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  actionButtonDestructive: {
    backgroundColor: '#FF3B30',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionTextDestructive: {
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
});
