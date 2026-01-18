/**
 * LoadingOverlay Component
 * Global loading indicator that blocks UI during API requests
 * Automatically managed by Axios interceptors
 */

import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { Text, Portal } from 'react-native-paper';
import { loadingManager } from '@/services/loadingManager';

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
  const scaleAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    // Subscribe to loading manager
    const unsubscribe = loadingManager.subscribe((state) => {
      setIsVisible(state.isLoading);
      setLoadingMessage(state.message);
      setShowTimeout(state.showTimeout);
    });

    return unsubscribe;
  }, []);

  // Fade in/out animation
  useEffect(() => {
    if (shouldShow) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.1,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
          ])
        ),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldShow]);

  // Allow prop override for testing
  const shouldShow = visible !== undefined ? visible : isVisible;
  const displayMessage = message !== undefined ? message : loadingMessage;

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
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.content}>
            <ActivityIndicator
              size="large"
              color="#fff"
              style={styles.spinner}
            />

            {displayMessage && (
              <Text style={styles.message} variant="bodyMedium">
                {displayMessage}
              </Text>
            )}

            {showTimeout && (
              <Text style={styles.timeoutWarning} variant="bodySmall">
                Isso está demorando mais que o esperado...
              </Text>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 16,
    padding: 24,
    minWidth: 150,
    maxWidth: 280,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginBottom: 12,
  },
  message: {
    color: '#fff',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  timeoutWarning: {
    color: '#ffeb3b',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
