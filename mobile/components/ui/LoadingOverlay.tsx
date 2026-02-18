/**
 * LoadingOverlay Component
 * Global loading indicator com animações ultra criativas
 * Automatically managed by Axios interceptors
 */

import { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text, Portal } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { loadingManager } from '@/services/loadingManager';
import { CreativeSpinner } from './GradientSpinner';
import { Colors } from '@/constants/Colors';

interface LoadingOverlayProps {
  /**
   * Override visibility state (for testing)
   */
  visible?: boolean;
  /**
   * Override message (for testing)
   */
  message?: string;
}

/**
 * Global loading overlay component
 * Shows during API requests with optional message
 */
export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();
  const [showTimeout, setShowTimeout] = useState(false);

  // Animation values for native animations
  const fadeAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(0.8))[0];

  useEffect(() => {
    // Subscribe to loading manager
    const unsubscribe = loadingManager.subscribe((state) => {
      setIsVisible(state.isLoading);
      setLoadingMessage(state.message);
      setShowTimeout(state.showTimeout);
    });

    return unsubscribe;
  }, []);

  // Allow prop override for testing
  const shouldShow = visible !== undefined ? visible : isVisible;
  const displayMessage = message !== undefined ? message : loadingMessage;

  // Entrada/saída com scaling dramático
  useEffect(() => {
    if (shouldShow) {
      Animated.parallel([
        Animated.spring(fadeAnim, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shouldShow]);

  if (!shouldShow) {
    return null;
  }

  return (
    <Portal>
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <BlurView intensity={40} style={StyleSheet.absoluteFillObject} />

        <Animated.View
          style={[
            styles.content,
            {
              transform: [{ scale: scaleAnim }],
              opacity: fadeAnim,
            },
          ]}
        >
          {/* Spinner Criativo */}
          <CreativeSpinner size={100} />

          {/* Mensagem */}
          {displayMessage && (
            <View style={styles.messageContainer}>
              <Text style={styles.message}>{displayMessage}</Text>
            </View>
          )}

          {!displayMessage && (
            <View style={styles.messageContainer}>
              <Text style={styles.defaultMessage}>Carregando...</Text>
              <View style={styles.dots}>
                <Animated.View style={[styles.dot, styles.dot1]} />
                <Animated.View style={[styles.dot, styles.dot2]} />
                <Animated.View style={[styles.dot, styles.dot3]} />
              </View>
            </View>
          )}

          {/* Aviso de Timeout */}
          {showTimeout && (
            <View style={styles.timeoutContainer}>
              <Text style={styles.timeoutWarning}>
                ⏱️ Isso está demorando mais que o esperado...
              </Text>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  messageContainer: {
    marginTop: 32,
    alignItems: 'center',
    gap: 12,
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    paddingHorizontal: 24,
    maxWidth: 280,
  },
  defaultMessage: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  dot1: {},
  dot2: {},
  dot3: {},
  timeoutContainer: {
    backgroundColor: Colors.light.warning + 'E0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginTop: 24,
    borderWidth: 2,
    borderColor: '#fff',
  },
  timeoutWarning: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
