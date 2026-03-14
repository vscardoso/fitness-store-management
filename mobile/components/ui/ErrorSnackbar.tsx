/**
 * ErrorSnackbar - Componente de feedback visual para erros
 * 
 * Exibe mensagens de erro de forma padronizada com:
 * - Animação suave de entrada/saída
 * - Auto-dismiss após 4 segundos
 * - Ação de "Tentar novamente"
 * - Diferentes níveis de severidade
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Pressable } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

export type ErrorSeverity = 'error' | 'warning' | 'info' | 'success';

export interface ErrorSnackbarProps {
  visible: boolean;
  message: string;
  severity?: ErrorSeverity;
  duration?: number;
  onDismiss: () => void;
  onRetry?: () => void;
  actionLabel?: string;
}

export default function ErrorSnackbar({
  visible,
  message,
  severity = 'error',
  duration = 4000,
  onDismiss,
  onRetry,
  actionLabel = 'Tentar novamente',
}: ErrorSnackbarProps) {
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible) {
      // Animar entrada
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss
      if (duration > 0) {
        timerRef.current = setTimeout(() => {
          handleDismiss();
        }, duration);
      }
    } else {
      // Animar saída
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, duration]);

  const handleDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onDismiss();
  };

  const getSeverityConfig = () => {
    switch (severity) {
      case 'error':
        return {
          backgroundColor: '#d32f2f',
          icon: 'alert-circle' as const,
          iconColor: '#fff',
        };
      case 'warning':
        return {
          backgroundColor: '#f57c00',
          icon: 'warning' as const,
          iconColor: '#fff',
        };
      case 'info':
        return {
          backgroundColor: Colors.light.primary,
          icon: 'information-circle' as const,
          iconColor: '#fff',
        };
      case 'success':
        return {
          backgroundColor: '#388e3c',
          icon: 'checkmark-circle' as const,
          iconColor: '#fff',
        };
    }
  };

  if (!visible && (opacity as any)._value === 0) {
    return null;
  }

  const config = getSeverityConfig();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
          backgroundColor: config.backgroundColor,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons name={config.icon} size={24} color={config.iconColor} />
        <Text variant="bodyMedium" style={styles.message}>
          {message}
        </Text>
      </View>

      <View style={styles.actions}>
        {onRetry && severity === 'error' && (
          <Pressable onPress={onRetry} style={styles.actionButton}>
            <Text variant="labelMedium" style={styles.actionText}>
              {actionLabel}
            </Text>
          </Pressable>
        )}
        <IconButton
          icon="close"
          size={20}
          iconColor="#fff"
          onPress={handleDismiss}
          style={styles.closeButton}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24, // Safe area
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  message: {
    color: '#fff',
    flex: 1,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 4,
  },
  actionText: {
    color: '#fff',
    fontWeight: '600',
  },
  closeButton: {
    margin: 0,
  },
});