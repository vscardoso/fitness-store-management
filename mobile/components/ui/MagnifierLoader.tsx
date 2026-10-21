/**
 * MagnifierLoader: lupa animada que "procura" em movimento circular.
 *
 * Substituto direto do ActivityIndicator (mesmas props: size, color, animating, style),
 * usado no app inteiro. SVG + Reanimated, roda na UI thread.
 *
 *   import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
 */

import { useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useBrandingColors } from '@/store/brandingStore';

export interface MagnifierLoaderProps {
  /** 'small' = 20, 'large' = 40 (mesmos nomes do ActivityIndicator) ou número em px */
  size?: 'small' | 'large' | number;
  /** Cor da lupa. Padrão: cor primária da loja. */
  color?: string;
  /** false pausa e esconde, como no ActivityIndicator */
  animating?: boolean;
  /** Mesmo comportamento do ActivityIndicator */
  hidesWhenStopped?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZE_SMALL = 20;
const SIZE_LARGE = 40;
const LOOP_MS = 1600;

export function MagnifierLoader({
  size = 'small',
  color,
  animating = true,
  hidesWhenStopped = true,
  style,
}: MagnifierLoaderProps) {
  const branding = useBrandingColors();
  const stroke = color ?? branding.primary;
  const px = typeof size === 'number' ? size : size === 'large' ? SIZE_LARGE : SIZE_SMALL;

  // Fase da órbita (0..1). A lupa percorre um círculo pequeno enquanto o brilho gira na lente.
  const phase = useSharedValue(0);

  useEffect(() => {
    if (animating) {
      phase.value = 0;
      phase.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(phase);
    }
    return () => cancelAnimation(phase);
  }, [animating, phase]);

  const radius = px * 0.14;

  const moveStyle = useAnimatedStyle(() => {
    const a = phase.value * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.cos(a) * radius },
        { translateY: Math.sin(a) * radius },
        { rotate: `${Math.sin(a) * 8}deg` },
      ],
    };
  });

  const glintStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${phase.value * 360}deg` }],
  }));

  if (!animating && hidesWhenStopped) return null;

  // Desenho em viewBox 48x48: lente centrada em (20,20), cabo na diagonal
  const strokeWidth = px <= 24 ? 5 : 4;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando"
      style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Animated.View style={[{ width: px, height: px }, moveStyle]}>
        <Svg width={px} height={px} viewBox="0 0 48 48">
          {/* Lente */}
          <Circle cx={20} cy={20} r={13} fill={stroke} fillOpacity={0.12} stroke={stroke} strokeWidth={strokeWidth} />
          {/* Cabo */}
          <Line x1={30} y1={30} x2={43} y2={43} stroke={stroke} strokeWidth={strokeWidth + 1} strokeLinecap="round" />
        </Svg>

        {/* Brilho que gira dentro da lente (só em tamanhos onde aparece).
            Contêiner do tamanho da lente (26/48 do ícone), posicionado sobre ela,
            para a rotação ocorrer no centro da lente. */}
        {px >= 28 && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: (7 / 48) * px,
                top: (7 / 48) * px,
                width: (26 / 48) * px,
                height: (26 / 48) * px,
              },
              glintStyle,
            ]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 26 26">
              <Path
                d="M 13 4.5 A 8.5 8.5 0 0 1 20.4 8.8"
                stroke="#fff"
                strokeOpacity={0.9}
                strokeWidth={2.2}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

/** Alias para trocar `ActivityIndicator` sem mexer nos usos. */
export const ActivityIndicator = MagnifierLoader;

export default MagnifierLoader;
