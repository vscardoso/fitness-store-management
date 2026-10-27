/**
 * LoadingOverlay: carregamento global do app.
 *
 * Mostra a lupa animada (MagnifierLoader) num cartão claro sobre um véu branco translúcido: a tela fica
 * esbranquiçada, mas ainda se enxerga o que está por baixo. O véu também bloqueia toques enquanto carrega (evita toque duplo em gravações).
 * Assinatura do loadingManager (show/hide com mensagem e aviso de demora) preservada.
 */

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Portal } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { loadingManager } from '@/services/loadingManager';
import { MagnifierLoader } from '@/components/ui/MagnifierLoader';

interface LoadingOverlayProps {
  visible?: boolean;
  message?: string;
}

export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();
  const [showTimeout, setShowTimeout] = useState(false);
  const [mounted, setMounted] = useState(false);

  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);

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

  useEffect(() => {
    if (shouldShow) setMounted(true);
  }, [shouldShow]);

  useEffect(() => {
    if (!mounted) return;

    if (shouldShow) {
      cardOpacity.value = withTiming(1, { duration: 200 });
      cardScale.value = withSpring(1, { damping: 18, stiffness: 220 });
    } else {
      cardOpacity.value = withTiming(0, { duration: 160 });
      cardScale.value = withTiming(0.92, { duration: 160 }, () => {
        runOnJS(setMounted)(false);
      });
    }
  }, [shouldShow, mounted, cardOpacity, cardScale]);

  const veilStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  if (!mounted) return null;

  return (
    <Portal>
      {/* Véu branco translúcido: esbranquiça a tela sem esconder o conteúdo e bloqueia toques */}
      <View style={styles.blocker} pointerEvents="auto">
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.veil, veilStyle]} pointerEvents="none" />
        <Animated.View style={[styles.card, cardStyle]}>
          <MagnifierLoader size={44} alwaysShow />
          {displayMessage ? (
            <Text style={styles.message} numberOfLines={2}>
              {displayMessage}
            </Text>
          ) : null}
          {showTimeout && (
            <View style={styles.timeoutRow}>
              <Ionicons name="time-outline" size={13} color="#6B7280" />
              <Text style={styles.timeoutText}>Demorando mais que o esperado</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  blocker: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 9999,
    elevation: 9999,
  },
  veil: {
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
  },
  card: {
    minWidth: 96,
    maxWidth: 220,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  message: {
    fontSize: 13,
    color: '#374151',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
  timeoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timeoutText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
});
