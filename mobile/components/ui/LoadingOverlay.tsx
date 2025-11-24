/**
 * LoadingOverlay Component
 * Global loading indicator that blocks UI during API requests
 * Automatically managed by Axios interceptors
 */

import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Portal } from 'react-native-paper';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
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

  // Animation value for pulse effect
  const scale = useSharedValue(1);

  useEffect(() => {
    // Subscribe to loading manager
    const unsubscribe = loadingManager.subscribe((state) => {
      setIsVisible(state.isLoading);
      setLoadingMessage(state.message);
      setShowTimeout(state.showTimeout);
    });

    return unsubscribe;
  }, []);

  // Pulse animation for spinner container
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Allow prop override for testing
  const shouldShow = visible !== undefined ? visible : isVisible;
  const displayMessage = message !== undefined ? message : loadingMessage;

  if (!shouldShow) {
    return null;
  }

  return (
    <Portal>
      <Animated.View
        style={styles.overlay}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
      >
        <Animated.View style={[styles.container, animatedStyle]}>
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
