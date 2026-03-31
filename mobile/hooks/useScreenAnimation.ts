/**
 * Hook de animação de entrada para telas.
 * Fade + slide-up suave ao montar o componente.
 */
import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { ANIMATION } from '@/constants/tokens';

export function useScreenAnimation() {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: ANIMATION.normal, easing: Easing.out(Easing.quad) });
    translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return { animatedStyle };
}

/** Animação staggered para itens de lista */
export function useListItemAnimation(index: number, delay = 40) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    const d = index * delay;
    opacity.value = withTiming(1, { duration: ANIMATION.normal, easing: Easing.out(Easing.quad) });
    translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return { animatedStyle };
}

/** Animação de counter: número sobe de 0 até o valor */
export function useCounterAnimation(target: number, duration = 800) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(target, { duration, easing: Easing.out(Easing.exp) });
  }, [target]);

  return progress;
}
