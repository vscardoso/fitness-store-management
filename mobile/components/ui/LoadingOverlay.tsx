/**
 * LoadingOverlay — cometa orbital com cauda de partículas + branding dinâmico.
 * 5 partículas orbitando em fase, com cauda de opacidade decrescente (efeito cometa),
 * halo pulsante e glass card. Reanimated puro (SVG), 60fps na UI thread.
 */

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Portal } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { loadingManager } from '@/services/loadingManager';
import { useBrandingColors } from '@/store/brandingStore';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface LoadingOverlayProps {
  visible?: boolean;
  message?: string;
}

// Cauda do cometa: 6 partículas, defasadas em ângulo, tamanho e opacidade decrescentes
const PARTICLES = [
  { lag: 0,  size: 8, opacity: 1 },
  { lag: 22, size: 7, opacity: 0.72 },
  { lag: 44, size: 6, opacity: 0.5 },
  { lag: 66, size: 5, opacity: 0.32 },
  { lag: 88, size: 4, opacity: 0.18 },
  { lag: 110, size: 3, opacity: 0.08 },
];

function CometParticle({
  angle,
  lag,
  size,
  opacity,
  orbitRadius,
  center,
  color,
}: {
  angle: SharedValue<number>;
  lag: number;
  size: number;
  opacity: number;
  orbitRadius: number;
  center: number;
  color: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    const rad = ((angle.value - lag) * Math.PI) / 180;
    return {
      cx: center + orbitRadius * Math.cos(rad),
      cy: center + orbitRadius * Math.sin(rad),
    };
  });

  return (
    <AnimatedCircle
      animatedProps={animatedProps}
      r={size / 2}
      fill={color}
      opacity={opacity}
    />
  );
}

export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const brandingColors = useBrandingColors();
  const [isVisible, setIsVisible] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();
  const [showTimeout, setShowTimeout] = useState(false);
  const [mounted, setMounted] = useState(false);

  const cardScale   = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);
  const bgOpacity   = useSharedValue(0);
  const orbitAngle  = useSharedValue(0);
  const haloScale   = useSharedValue(1);
  const haloOpacity = useSharedValue(0.5);
  const coreScale   = useSharedValue(1);

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

  // Órbita contínua — 1 volta a cada 1400ms, easing linear
  useEffect(() => {
    orbitAngle.value = withRepeat(
      withTiming(360, { duration: 1400, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(orbitAngle);
  }, [orbitAngle]);

  // Halo pulsante de fundo
  useEffect(() => {
    haloScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1,    { duration: 900, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    haloOpacity.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 900 }),
        withTiming(0.35, { duration: 900 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(haloScale);
      cancelAnimation(haloOpacity);
    };
  }, [haloScale, haloOpacity]);

  // Núcleo central — pequeno "respiro"
  useEffect(() => {
    coreScale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 700, easing: Easing.out(Easing.quad) }),
        withTiming(1,    { duration: 700, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(coreScale);
  }, [coreScale]);

  // Mount/unmount com animação de entrada e saída
  useEffect(() => {
    if (shouldShow) {
      setMounted(true);
    }
  }, [shouldShow]);

  useEffect(() => {
    if (!mounted) return;

    if (shouldShow) {
      bgOpacity.value   = withTiming(1, { duration: 220 });
      cardOpacity.value = withTiming(1, { duration: 260 });
      cardScale.value   = withSpring(1, { damping: 18, stiffness: 220 });
    } else {
      bgOpacity.value   = withTiming(0, { duration: 200 });
      cardOpacity.value = withTiming(0, { duration: 180 });
      cardScale.value   = withTiming(0.9, { duration: 180 }, () => {
        runOnJS(setMounted)(false);
      });
    }
  }, [shouldShow, mounted, bgOpacity, cardOpacity, cardScale]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity:   cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity:   haloOpacity.value,
    transform: [{ scale: haloScale.value }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.value }],
  }));

  if (!mounted) return null;

  const [c1, c2] = brandingColors.gradient;

  return (
    <Portal>
      <Animated.View style={[styles.overlay, bgStyle]}>
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.scrim} />

        <Animated.View style={[styles.card, cardStyle]}>

          <LinearGradient
            colors={[c1, c2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientStrip}
          />

          <View style={styles.cardBody}>

            <View style={styles.orbitWrap}>
              <Animated.View
                style={[styles.halo, { backgroundColor: `${brandingColors.primary}22` }, haloStyle]}
              />

              <Svg width={RING} height={RING} style={StyleSheet.absoluteFillObject}>
                {PARTICLES.map((p, i) => (
                  <CometParticle
                    key={i}
                    angle={orbitAngle}
                    lag={p.lag}
                    size={p.size}
                    opacity={p.opacity}
                    orbitRadius={ORBIT_R}
                    center={RING_C}
                    color={brandingColors.primary}
                  />
                ))}
              </Svg>

              <Animated.View style={[styles.core, coreStyle]}>
                <LinearGradient
                  colors={[c1, c2]}
                  style={styles.coreGradient}
                />
              </Animated.View>
            </View>

            {displayMessage ? (
              <Text style={styles.message} numberOfLines={2}>
                {displayMessage}
              </Text>
            ) : null}

          </View>
        </Animated.View>

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
const RING_C = RING / 2;
const ORBIT_R = RING / 2 - 6;

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

  // Órbita
  orbitWrap: {
    width: RING,
    height: RING,
    justifyContent: 'center',
    alignItems: 'center',
  },
  halo: {
    position: 'absolute',
    width: RING + 20,
    height: RING + 20,
    borderRadius: (RING + 20) / 2,
  },
  core: {
    width: 14,
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  coreGradient: {
    width: '100%',
    height: '100%',
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
