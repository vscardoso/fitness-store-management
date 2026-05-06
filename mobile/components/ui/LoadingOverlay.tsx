/**
 * LoadingOverlay — ring spinner moderno com branding dinâmico.
 * Ring rotativo + glow de gradiente + glass card.
 * Usa Reanimated para animações nativas suaves (60 fps na UI thread).
 */

import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Portal } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  cancelAnimation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { loadingManager } from '@/services/loadingManager';
import { useBrandingColors } from '@/store/brandingStore';

interface LoadingOverlayProps {
  visible?: boolean;
  message?: string;
}

export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const brandingColors = useBrandingColors();
  const [isVisible, setIsVisible] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();
  const [showTimeout, setShowTimeout] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Shared values Reanimated
  const rotation    = useSharedValue(0);
  const cardScale   = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);
  const bgOpacity   = useSharedValue(0);
  const pulseScale  = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

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

  // Ring rotation infinita — linear, 800ms por volta
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 800, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  // Pulso suave no dot central
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 600, easing: Easing.out(Easing.quad) }),
        withTiming(1,   { duration: 600, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1,   { duration: 600 }),
        withTiming(0.5, { duration: 600 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
    };
  }, [pulseScale, pulseOpacity]);

  // Mount/unmount com animação de entrada e saída
  useEffect(() => {
    if (shouldShow) {
      setMounted(true);
    }
  }, [shouldShow]);

  useEffect(() => {
    if (!mounted) return;

    if (shouldShow) {
      // Entrada
      bgOpacity.value   = withTiming(1, { duration: 220 });
      cardOpacity.value = withTiming(1, { duration: 260 });
      cardScale.value   = withSpring(1, { damping: 18, stiffness: 220 });
    } else {
      // Saída: fade out, depois desmonta
      bgOpacity.value   = withTiming(0, { duration: 200 });
      cardOpacity.value = withTiming(0, { duration: 180 });
      cardScale.value   = withTiming(0.9, { duration: 180 }, () => {
        runOnJS(setMounted)(false);
      });
    }
  }, [shouldShow, mounted, bgOpacity, cardOpacity, cardScale]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity:   cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity:   pulseOpacity.value,
  }));

  if (!mounted) return null;

  const [c1, c2] = brandingColors.gradient;
  const trackColor = `${brandingColors.primary}22`;

  return (
    <Portal>
      <Animated.View style={[styles.overlay, bgStyle]}>
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.scrim} />

        <Animated.View style={[styles.card, cardStyle]}>

          {/* Faixa gradiente no topo */}
          <LinearGradient
            colors={[c1, c2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientStrip}
          />

          <View style={styles.cardBody}>

            {/* Ring container */}
            <View style={styles.ringWrap}>

              {/* Glow de fundo (halo) */}
              <View style={[styles.ringGlow, { backgroundColor: `${brandingColors.primary}14` }]} />

              {/* Track — anel de fundo */}
              <View style={[styles.track, { borderColor: trackColor }]} />

              {/* Arco giratório — borda superior + direita coloridas */}
              <Animated.View
                style={[
                  styles.arc,
                  {
                    borderTopColor:   brandingColors.primary,
                    borderRightColor: `${brandingColors.primary}60`,
                  },
                  spinStyle,
                ]}
              />

              {/* Dot central pulsante */}
              <Animated.View
                style={[styles.centerDot, { backgroundColor: brandingColors.primary }, dotStyle]}
              />
            </View>

            {/* Mensagem */}
            {displayMessage ? (
              <Text style={styles.message} numberOfLines={2}>
                {displayMessage}
              </Text>
            ) : null}

          </View>
        </Animated.View>

        {/* Aviso de timeout */}
        {showTimeout && (
          <View style={styles.timeoutRow}>
            <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.38)" />
            <Text style={styles.timeoutText}>Operação demorando mais que o esperado</Text>
          </View>
        )}
      </Animated.View>
    </Portal>
  );
}

const RING = 64;
const RING_R = RING / 2;
const BORDER = 3;

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
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },

  // Card glass
  card: {
    width: 168,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(14, 16, 26, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 24,
  },
  gradientStrip: {
    height: 3,
    width: '100%',
  },
  cardBody: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 26,
    paddingHorizontal: 20,
    gap: 16,
  },

  // Ring
  ringWrap: {
    width: RING,
    height: RING,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringGlow: {
    position: 'absolute',
    width: RING + 16,
    height: RING + 16,
    borderRadius: (RING + 16) / 2,
  },
  track: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING_R,
    borderWidth: BORDER,
  },
  arc: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING_R,
    borderWidth: BORDER,
    borderColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  centerDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },

  // Texto
  message: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 0.25,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 19,
    maxWidth: 128,
  },

  // Timeout
  timeoutRow: {
    position: 'absolute',
    bottom: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeoutText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.38)',
    fontWeight: '500',
  },
});
