/**
 * LoadingOverlay Component
 * Global loading indicator — minimal premium design com branding dinâmico
 * Automatically managed by Axios interceptors
 */

import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text, Portal } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { loadingManager } from '@/services/loadingManager';
import { useBrandingColors } from '@/store/brandingStore';

interface LoadingOverlayProps {
  /** Override visibility state (for testing) */
  visible?: boolean;
  /** Override message (for testing) */
  message?: string;
}

export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const brandingColors = useBrandingColors();
  const [isVisible, setIsVisible] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();
  const [showTimeout, setShowTimeout] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pillAnim = useRef(new Animated.Value(0.86)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = loadingManager.subscribe((state) => {
      setIsVisible(state.isLoading);
      setLoadingMessage(state.message);
      setShowTimeout(state.showTimeout);
    });
    return unsubscribe;
  }, []);

  const shouldShow = visible !== undefined ? visible : isVisible;
  const displayMessage = message !== undefined ? message : loadingMessage;

  // Stagger dots — CYCLE 1400ms, STAGGER 400ms, cada step 280ms
  // Dot 1: rise(280) + fall(280) + delay(840) = 1400 ✓
  // Dot 2: delay(400) + rise(280) + fall(280) + delay(440) = 1400 ✓
  // Dot 3: delay(800) + rise(280) + fall(280) + delay(40) = 1400 ✓
  useEffect(() => {
    const STEP = 280;
    const a1 = Animated.loop(
      Animated.sequence([
        Animated.timing(dot1, { toValue: 1, duration: STEP, useNativeDriver: true }),
        Animated.timing(dot1, { toValue: 0, duration: STEP, useNativeDriver: true }),
        Animated.delay(840),
      ])
    );
    const a2 = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(dot2, { toValue: 1, duration: STEP, useNativeDriver: true }),
        Animated.timing(dot2, { toValue: 0, duration: STEP, useNativeDriver: true }),
        Animated.delay(440),
      ])
    );
    const a3 = Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(dot3, { toValue: 1, duration: STEP, useNativeDriver: true }),
        Animated.timing(dot3, { toValue: 0, duration: STEP, useNativeDriver: true }),
        Animated.delay(40),
      ])
    );
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  // Entrada: fade + spring no pill
  useEffect(() => {
    if (shouldShow) {
      pillAnim.setValue(0.86);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(pillAnim, { toValue: 1, friction: 7, tension: 52, useNativeDriver: true }),
      ]).start();
    }
  }, [shouldShow, fadeAnim, pillAnim]);

  if (!shouldShow) return null;

  const d1Scale = dot1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const d2Scale = dot2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const d3Scale = dot3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const d1Op = dot1.interpolate({ inputRange: [0, 1], outputRange: [0.22, 1] });
  const d2Op = dot2.interpolate({ inputRange: [0, 1], outputRange: [0.22, 1] });
  const d3Op = dot3.interpolate({ inputRange: [0, 1], outputRange: [0.22, 1] });

  return (
    <Portal>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.scrim} />

        <Animated.View style={[styles.pill, { transform: [{ scale: pillAnim }] }]}>
          {/* 3 stagger dots com cores de branding */}
          <View style={styles.dotsRow}>
            <Animated.View
              style={[
                styles.dot,
                {
                  backgroundColor: brandingColors.primary,
                  transform: [{ scale: d1Scale }],
                  opacity: d1Op,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                {
                  backgroundColor: brandingColors.secondary,
                  transform: [{ scale: d2Scale }],
                  opacity: d2Op,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                {
                  backgroundColor: brandingColors.accent,
                  transform: [{ scale: d3Scale }],
                  opacity: d3Op,
                },
              ]}
            />
          </View>

          {displayMessage ? (
            <Text style={styles.message}>{displayMessage}</Text>
          ) : null}
        </Animated.View>

        {showTimeout && (
          <View style={styles.timeoutRow}>
            <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.45)" />
            <Text style={styles.timeoutText}>Operação demorando mais que o esperado</Text>
          </View>
        )}
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
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  pill: {
    alignItems: 'center',
    gap: 18,
    paddingVertical: 26,
    paddingHorizontal: 40,
    borderRadius: 28,
    backgroundColor: 'rgba(10, 12, 20, 0.7)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  message: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.58)',
    letterSpacing: 0.35,
    textAlign: 'center',
    fontWeight: '500',
    maxWidth: 220,
    lineHeight: 18,
  },
  timeoutRow: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeoutText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: '500',
  },
});
