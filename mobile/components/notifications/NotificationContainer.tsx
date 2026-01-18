/**
 * Container para renderizar todas as notificações ativas
 * Deve ser colocado no layout principal (_layout.tsx)
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NotificationBanner } from './NotificationBanner';
import { useNotificationStore } from '../../store/notificationStore';

export function NotificationContainer() {
  const activeNotifications = useNotificationStore((state) => state.activeNotifications);

  if (activeNotifications.length === 0) {
    return null;
  }

  // Mostrar apenas as 3 mais recentes para não sobrecarregar a tela
  const visibleNotifications = activeNotifications.slice(0, 3);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {visibleNotifications.map((notification, index) => (
        <View
          key={notification.id}
          style={[styles.bannerWrapper, { top: 50 + index * 10 }]}
        >
          <NotificationBanner notification={notification} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  bannerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
