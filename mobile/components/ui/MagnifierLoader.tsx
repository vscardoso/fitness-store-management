/**
 * MagnifierLoader: manequim 3D com fita métrica subindo em espiral pelo corpo.
 *
 * (O nome ficou "Magnifier" para não mexer nos ~100 usos: continua sendo o substituto direto do
 * ActivityIndicator, com as mesmas props: size, color, animating, style.)
 *   import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
 *
 * SVG + Reanimated, roda na UI thread, sem biblioteca 3D (leve). O volume vem do sombreado de cilindro,
 * de uma luz que passa pelo corpo, da sombra no chão e do giro com perspectiva. A fita nasce embaixo, sobe
 * enrolando (parte de trás mais fraca) e some no ombro. Em tamanho pequeno vira um desenho simples.
 */

import { useEffect, useId, useSyncExternalStore } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, Ellipse, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useBrandingColors } from '@/store/brandingStore';

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

// ── Quantos carregamentos de tela (manequim grande) estão aparecendo agora ──
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
/** true enquanto alguma tela mostra o carregamento dela: o carregamento global (cartão com véu) não deve aparecer junto. */
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
const SIZE_LARGE = 40;
const LOOP_MS = 2200;
const RINGS = 3;
const Y_BOTTOM = 36;
const Y_TOP = 15;

// Corpo do manequim (viewBox 48x48): ombros, cintura marcada, quadril
const BODY_3D = 'M 14 13 Q 24 7 34 13 L 33 22 Q 30 27 33 33 Q 35 36 33 38.5 L 15 38.5 Q 13 36 15 33 Q 18 27 15 22 Z';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/** Meia largura do corpo na altura y: ombro 9,4, cintura 7,4, quadril 9,3 */
function halfWidth(y: number) {
  'worklet';
  if (y <= 14) return 9.4;
  if (y <= 28) return 9.4 - ((y - 14) / 14) * 2;
  return 7.4 + ((y - 28) / 10) * 1.9;
}

/** Uma volta da fita (meia elipse): 'front' passa por baixo (aparece na frente), 'back' por cima. O lado direito sobe um pouco (passo da espiral). */
function ringPath(y: number, side: 'front' | 'back') {
  'worklet';
  const w = halfWidth(y) + 0.9;
  const sweep = side === 'front' ? 0 : 1;
  return `M ${24 - w} ${y} A ${w} 3.1 0 0 ${sweep} ${24 + w} ${y - 1.4}`;
}

/** Cada volta nasce embaixo, sobe pelo corpo e some no ombro; as 3 voltas ficam defasadas (a fita enrola para cima). */
function useRing(phase: SharedValue<number>, k: number, side: 'front' | 'back') {
  return useAnimatedProps(() => {
    const t = (phase.value + k / RINGS) % 1;
    const y = Y_BOTTOM - t * (Y_BOTTOM - Y_TOP);
    return { d: ringPath(y, side), strokeOpacity: Math.sin(t * Math.PI) * (side === 'front' ? 1 : 0.4) };
  });
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
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Manequim grande de tela (carregando a página) avisa o carregamento global para ele não aparecer por cima:
  // uma tela só mostra UM carregamento.
  const isScreenLoader = !alwaysShow && px >= 36 && animating;
  useEffect(() => (isScreenLoader ? registerScreenLoader() : undefined), [isScreenLoader]);

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

  const f0 = useRing(phase, 0, 'front');
  const f1 = useRing(phase, 1, 'front');
  const f2 = useRing(phase, 2, 'front');
  const b0 = useRing(phase, 0, 'back');
  const b1 = useRing(phase, 1, 'back');
  const b2 = useRing(phase, 2, 'back');

  // Giro 3D: o manequim vira de um lado para o outro com perspectiva
  const turnStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 200 }, { rotateY: `${Math.sin(phase.value * Math.PI * 2) * 32}deg` }],
  }));
  // Luz que passa pelo corpo da esquerda para a direita (volume de cilindro)
  const glowProps = useAnimatedProps(() => ({ cx: 24 + Math.sin(phase.value * Math.PI * 2) * 6.5 }));
  const glowSoftProps = useAnimatedProps(() => ({ cx: 24 + Math.sin(phase.value * Math.PI * 2) * 5 }));
  // Sombra no chão respira com o giro
  const shadowProps = useAnimatedProps(() => ({ rx: 9 + Math.abs(Math.cos(phase.value * Math.PI * 2)) * 3 }));
  // Fita simples (tamanhos pequenos): uma volta subindo e descendo na cintura
  const simpleFront = useAnimatedProps(() => ({ d: ringPath(28 + Math.sin(phase.value * Math.PI * 2) * 2, 'front') }));
  const simpleBack = useAnimatedProps(() => ({ d: ringPath(28 + Math.sin(phase.value * Math.PI * 2) * 2, 'back') }));

  if (!animating && hidesWhenStopped) return null;

  const small = px < 28;
  const body = small ? 3.6 : 2.2;
  const tape = small ? 4.2 : 2.8;
  const fronts = [f0, f1, f2];
  const backs = [b0, b1, b2];

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando"
      style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Animated.View style={[{ width: px, height: px }, turnStyle]}>
        <Svg width={px} height={px} viewBox="0 0 48 48">
          {small ? (
            <>
              <AnimatedPath animatedProps={simpleBack} stroke={stroke} strokeOpacity={0.35} strokeWidth={tape} strokeLinecap="round" fill="none" />
              <Line x1={24} y1={6.5} x2={24} y2={9.5} stroke={stroke} strokeWidth={body + 0.6} strokeLinecap="round" />
              <Line x1={24} y1={38.5} x2={24} y2={44} stroke={stroke} strokeWidth={body} strokeLinecap="round" />
              <Line x1={17} y1={44.5} x2={31} y2={44.5} stroke={stroke} strokeWidth={body} strokeLinecap="round" />
              <Path d={BODY_3D} fill={stroke} fillOpacity={0.14} stroke={stroke} strokeWidth={body} strokeLinejoin="round" />
              <AnimatedPath animatedProps={simpleFront} stroke={stroke} strokeWidth={tape} strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <Defs>
                {/* Sombreado de cilindro: bordas escuras, centro claro */}
                <LinearGradient id={`${uid}shade`} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={stroke} stopOpacity={0.95} />
                  <Stop offset="0.35" stopColor={stroke} stopOpacity={0.55} />
                  <Stop offset="0.6" stopColor={stroke} stopOpacity={0.42} />
                  <Stop offset="1" stopColor={stroke} stopOpacity={0.9} />
                </LinearGradient>
                <ClipPath id={`${uid}clip`}>
                  <Path d={BODY_3D} />
                </ClipPath>
              </Defs>
              {/* Sombra no chão */}
              <AnimatedEllipse animatedProps={shadowProps} cx={24} cy={45.6} ry={1.7} fill={stroke} fillOpacity={0.22} />
              {/* Voltas de trás da fita (fracas) */}
              {backs.map((ap, i) => (
                <AnimatedPath key={`b${i}`} animatedProps={ap} stroke={stroke} strokeWidth={tape} strokeLinecap="round" fill="none" />
              ))}
              {/* Haste e base com brilho metálico */}
              <Line x1={24} y1={38.5} x2={24} y2={44} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
              <Line x1={24} y1={38.5} x2={24} y2={44} stroke="#fff" strokeOpacity={0.45} strokeWidth={0.7} strokeLinecap="round" />
              <Ellipse cx={24} cy={44.6} rx={7.5} ry={1.6} fill={stroke} />
              <Ellipse cx={22.2} cy={44.2} rx={3} ry={0.5} fill="#fff" fillOpacity={0.45} />
              {/* Pescoço */}
              <Line x1={24} y1={6.2} x2={24} y2={9.8} stroke={stroke} strokeWidth={2.8} strokeLinecap="round" />
              <Ellipse cx={24} cy={6} rx={2.2} ry={0.9} fill={stroke} />
              {/* Corpo com volume */}
              <Path d={BODY_3D} fill={`url(#${uid}shade)`} stroke={stroke} strokeWidth={body} strokeLinejoin="round" />
              <Path d="M 14.6 13.3 Q 24 8 33.4 13.3" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} strokeLinecap="round" />
              {/* Luz que passa pelo corpo */}
              <AnimatedEllipse clipPath={`url(#${uid}clip)`} animatedProps={glowSoftProps} cy={25} rx={6.5} ry={16} fill="#fff" fillOpacity={0.16} />
              <AnimatedEllipse clipPath={`url(#${uid}clip)`} animatedProps={glowProps} cy={24} rx={2.4} ry={14} fill="#fff" fillOpacity={0.45} />
              {/* Voltas da frente da fita: contorno claro, fita e marcas */}
              {fronts.map((ap, i) => (
                <AnimatedPath key={`o${i}`} animatedProps={ap} stroke="#fff" strokeWidth={tape + 1.1} strokeLinecap="round" fill="none" />
              ))}
              {fronts.map((ap, i) => (
                <AnimatedPath key={`f${i}`} animatedProps={ap} stroke={stroke} strokeWidth={tape} strokeLinecap="round" fill="none" />
              ))}
              {fronts.map((ap, i) => (
                <AnimatedPath key={`m${i}`} animatedProps={ap} stroke="#fff" strokeWidth={tape * 0.45} strokeDasharray="0.7 2.2" fill="none" />
              ))}
            </>
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Alias para trocar `ActivityIndicator` sem mexer nos usos. */
export const ActivityIndicator = MagnifierLoader;

export default MagnifierLoader;
