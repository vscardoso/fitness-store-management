/**
 * MagnifierLoader: o logo do Provador (P pendurado no gancho de cabide) balançando como numa arara.
 *
 * (O nome ficou "Magnifier" para não mexer nos ~100 usos: continua sendo o substituto direto do
 * ActivityIndicator, com as mesmas props: size, color, animating, style.)
 *   import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
 *
 * O cabide balança em volta do gancho, um brilho corre pelo P e a sombra no chão acompanha.
 * SVG + Reanimated, roda na UI thread. Cores: a da loja (degradê primária -> secundária).
 * Em tamanho pequeno (< 28 px) fica só o balanço, sem brilho nem sombra.
 */

import { useEffect, useId, useSyncExternalStore } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useBrandingColors } from '@/store/brandingStore';

export interface MagnifierLoaderProps {
  /** 'small' = 20, 'large' = 56 (mesmos nomes do ActivityIndicator) ou número em px */
  size?: 'small' | 'large' | number;
  /** Cor do logo. Padrão: degradê da loja (primária -> secundária). */
  color?: string;
  /** Só o carregamento global usa: carregamentos grandes das telas somem enquanto ele aparece (não ficam dois) */
  alwaysShow?: boolean;
  /** false pausa e esconde, como no ActivityIndicator */
  animating?: boolean;
  /** Mesmo comportamento do ActivityIndicator */
  hidesWhenStopped?: boolean;
  style?: StyleProp<ViewStyle>;
}

// ── Quantos carregamentos de tela (grandes) estão aparecendo agora ──
let screenLoaders = 0;
const screenListeners = new Set<() => void>();
function registerScreenLoader() {
  screenLoaders += 1;
  screenListeners.forEach((l) => l());
  return () => {
    screenLoaders -= 1;
    screenListeners.forEach((l) => l());
  };
}
/** true enquanto alguma tela mostra o carregamento dela: o carregamento global não deve aparecer junto. */
export function useHasScreenLoader(): boolean {
  return useSyncExternalStore(
    (cb) => {
      screenListeners.add(cb);
      return () => {
        screenListeners.delete(cb);
      };
    },
    () => screenLoaders > 0,
    () => false,
  );
}

const SIZE_SMALL = 20;
const SIZE_LARGE = 56;
const SWING_MS = 1300; // meio balanço (ida); a volta repete invertida
const GLINT_MS = 1800;
const SWING_DEG = 13;

// Desenho do logo (viewBox 512): gancho e P. O eixo do balanço é a ponta do gancho, (256, 100).
const HOOK = 'M256 152 V126 A26 26 0 1 0 230 100';
const LETTER = 'M178 404 V196 a44 44 0 0 1 44 -44 h52 a76 76 0 0 1 0 152 h-96';
const LETTER_LEN = 664; // comprimento aproximado do traço do P (para o brilho)
const PIVOT_FROM_CENTER = (256 - 100) / 512; // quanto o eixo fica acima do centro, em fração do tamanho

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function MagnifierLoader({
  size = 'small',
  color,
  animating = true,
  hidesWhenStopped = true,
  alwaysShow = false,
  style,
}: MagnifierLoaderProps) {
  const branding = useBrandingColors();
  const c1 = color ?? branding.primary;
  const c2 = color ?? branding.secondary;
  const px = typeof size === 'number' ? size : size === 'large' ? SIZE_LARGE : SIZE_SMALL;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Carregamento grande de tela avisa o global para ele não aparecer por cima: uma tela só mostra UM carregamento.
  const isScreenLoader = !alwaysShow && px >= 36 && animating;
  useEffect(() => (isScreenLoader ? registerScreenLoader() : undefined), [isScreenLoader]);

  const swing = useSharedValue(-1); // -1..1, vai e volta
  const glint = useSharedValue(0); // 0..1, só vai

  useEffect(() => {
    if (animating) {
      swing.value = -1;
      swing.value = withRepeat(withTiming(1, { duration: SWING_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
      glint.value = 0;
      glint.value = withRepeat(withTiming(1, { duration: GLINT_MS, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(swing);
      cancelAnimation(glint);
    }
    return () => {
      cancelAnimation(swing);
      cancelAnimation(glint);
    };
  }, [animating, swing, glint]);

  const d = PIVOT_FROM_CENTER * px;
  // Gira em volta do gancho: desce o desenho até o eixo ficar no centro, gira e sobe de volta
  const swingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -d }, { rotate: `${swing.value * SWING_DEG}deg` }, { translateY: d }],
  }));
  // Sombra no chão anda para o lado contrário do balanço
  const shadowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -swing.value * px * 0.07 }, { scaleX: 0.85 + Math.abs(swing.value) * 0.12 }],
  }));
  const glintProps = useAnimatedProps(() => ({ strokeDashoffset: LETTER_LEN - glint.value * (LETTER_LEN + 70) }));

  if (!animating && hidesWhenStopped) return null;

  const small = px < 28;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando"
      style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {!small && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              bottom: px * 0.02,
              width: px * 0.46,
              height: px * 0.05,
              borderRadius: px,
              backgroundColor: c1,
              opacity: 0.18,
            },
            shadowStyle,
          ]}
        />
      )}
      <Animated.View style={[{ width: px, height: px }, swingStyle]}>
        <Svg width={px} height={px} viewBox="0 0 512 512">
          <Defs>
            <LinearGradient id={`${uid}g`} x1="0.1" y1="0" x2="0.9" y2="1">
              <Stop offset="0" stopColor={c1} />
              <Stop offset="1" stopColor={c2} />
            </LinearGradient>
          </Defs>
          <Path d={HOOK} fill="none" stroke={`url(#${uid}g)`} strokeWidth={small ? 30 : 22} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={LETTER} fill="none" stroke={`url(#${uid}g)`} strokeWidth={small ? 56 : 44} strokeLinecap="round" strokeLinejoin="round" />
          {!small && (
            <AnimatedPath
              d={LETTER}
              animatedProps={glintProps}
              fill="none"
              stroke="#fff"
              strokeOpacity={0.75}
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={`60 ${LETTER_LEN}`}
            />
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Alias para trocar `ActivityIndicator` sem mexer nos usos. */
export const ActivityIndicator = MagnifierLoader;

export default MagnifierLoader;
