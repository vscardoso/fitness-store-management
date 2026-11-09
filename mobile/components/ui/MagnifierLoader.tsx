/**
 * MagnifierLoader: manequim com fita métrica dando voltas na cintura.
 *
 * (O nome ficou "Magnifier" para não mexer nos ~100 usos: continua sendo o substituto direto do
 * ActivityIndicator, com as mesmas props: size, color, animating, style.)
 *   import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
 *
 * SVG + Reanimated, roda na UI thread. O manequim gira em 3D (perspectiva + rotateY). A fita sobe e desce de leve na cintura e as marcas dela
 * correm pela frente do corpo (a parte de trás aparece mais fraca): dá a impressão de a fita girar em volta.
 */

import { useEffect, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
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
import { loadingManager } from '@/services/loadingManager';

export interface MagnifierLoaderProps {
  /** 'small' = 20, 'large' = 40 (mesmos nomes do ActivityIndicator) ou número em px */
  size?: 'small' | 'large' | number;
  /** Cor do manequim. Padrão: cor primária da loja. */
  color?: string;
  /** Só o carregamento global usa: manequins grandes das telas somem enquanto ele aparece (não ficam dois) */
  alwaysShow?: boolean;
  /** false pausa e esconde, como no ActivityIndicator */
  animating?: boolean;
  /** Mesmo comportamento do ActivityIndicator */
  hidesWhenStopped?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZE_SMALL = 20;
const SIZE_LARGE = 40;
const LOOP_MS = 1500;
const TICK_PERIOD = 3.2; // comprimento de um ciclo das marcas da fita (dasharray "0.8 2.4")

// Corpo do manequim (viewBox 48x48): ombros, cintura marcada, quadril, haste e base
const BODY =
  'M 14 13 Q 24 7 34 13 L 33 22 Q 30 27 33 33 Q 35 36 33 38.5 L 15 38.5 Q 13 36 15 33 Q 18 27 15 22 Z';
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Meia elipse da fita: 'front' passa por baixo (aparece na frente do corpo), 'back' por cima. */
function arc(cy: number, side: 'front' | 'back') {
  'worklet';
  const sweep = side === 'front' ? 0 : 1;
  return `M 15.2 ${cy} A 8.8 3 0 0 ${sweep} 32.8 ${cy}`;
}

export function MagnifierLoader({
  size = 'small',
  color,
  animating = true,
  hidesWhenStopped = true,
  alwaysShow = false,
  style,
}: MagnifierLoaderProps) {
  const branding = useBrandingColors();
  const stroke = color ?? branding.primary;
  const px = typeof size === 'number' ? size : size === 'large' ? SIZE_LARGE : SIZE_SMALL;

  // Manequim grande de tela enquanto o carregamento global (véu + manequim) aparece = dois um sobre o outro
  const [globalLoading, setGlobalLoading] = useState(() => loadingManager.getState().isLoading);
  useEffect(() => (alwaysShow ? undefined : loadingManager.subscribe((st) => setGlobalLoading(st.isLoading))), [alwaysShow]);
  const duplicated = !alwaysShow && px >= 36 && globalLoading;

  // Fase do giro (0..1)
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

  // Fita sobe e desce 2 unidades em volta da cintura (y = 28)
  const frontProps = useAnimatedProps(() => ({ d: arc(28 + Math.sin(phase.value * Math.PI * 2) * 2, 'front') }));
  const backProps = useAnimatedProps(() => ({ d: arc(28 + Math.sin(phase.value * Math.PI * 2) * 2, 'back') }));
  // Marcas correndo pela fita da esquerda para a direita
  const ticksProps = useAnimatedProps(() => ({
    d: arc(28 + Math.sin(phase.value * Math.PI * 2) * 2, 'front'),
    strokeDashoffset: -phase.value * TICK_PERIOD * 2,
  }));

  // Giro 3D: o manequim vira de um lado para o outro com perspectiva (a fita acompanha, por estar dentro dele)
  const turnStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 220 }, { rotateY: `${Math.sin(phase.value * Math.PI * 2) * 38}deg` }],
  }));
  // Marcas na parte de trás da volta correm no sentido contrário (é a mesma fita, vista pelo outro lado)
  const backTicksProps = useAnimatedProps(() => ({
    d: arc(28 + Math.sin(phase.value * Math.PI * 2) * 2, 'back'),
    strokeDashoffset: phase.value * TICK_PERIOD * 2,
  }));

  if ((!animating && hidesWhenStopped) || duplicated) return null;

  const small = px <= 24;
  const body = small ? 3.6 : 2.6; // traço mais grosso quando o ícone é pequeno
  const tape = small ? 4.2 : 3.4;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando"
      style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Animated.View style={[{ width: px, height: px }, turnStyle]}>
      <Svg width={px} height={px} viewBox="0 0 48 48">
        {/* Fita por trás do corpo (parte de trás da volta, mais fraca) */}
        <AnimatedPath animatedProps={backProps} stroke={stroke} strokeOpacity={0.35} strokeWidth={tape} strokeLinecap="round" fill="none" />
        {!small && (
          <AnimatedPath
            animatedProps={backTicksProps}
            stroke="#fff"
            strokeOpacity={0.3}
            strokeWidth={tape * 0.55}
            strokeDasharray="0.8 2.4"
            fill="none"
          />
        )}
        {/* Pescoço, haste e base */}
        <Line x1={24} y1={6.5} x2={24} y2={9.5} stroke={stroke} strokeWidth={body + 0.6} strokeLinecap="round" />
        <Line x1={24} y1={38.5} x2={24} y2={44} stroke={stroke} strokeWidth={body} strokeLinecap="round" />
        <Line x1={17} y1={44.5} x2={31} y2={44.5} stroke={stroke} strokeWidth={body} strokeLinecap="round" />
        {/* Corpo */}
        <Path d={BODY} fill={stroke} fillOpacity={0.14} stroke={stroke} strokeWidth={body} strokeLinejoin="round" />
        {/* Fita na frente, com as marcas correndo (sem marcas em tamanho pequeno: só virariam ruído) */}
        <AnimatedPath animatedProps={frontProps} stroke={stroke} strokeWidth={tape} strokeLinecap="round" fill="none" />
        {!small && (
          <AnimatedPath
            animatedProps={ticksProps}
            stroke="#fff"
            strokeOpacity={0.85}
            strokeWidth={tape * 0.55}
            strokeDasharray="0.8 2.4"
            fill="none"
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
