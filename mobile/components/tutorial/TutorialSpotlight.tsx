/**
 * TutorialSpotlight
 * Overlay escuro com "buraco" destacando o elemento alvo
 * Implementação sem SVG para evitar dependências adicionais
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { TUTORIAL_COLORS } from '@/constants/tutorials';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TutorialSpotlightProps {
  targetMeasurements?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  padding?: number;
  onPress?: () => void;
  children?: React.ReactNode;
}

export function TutorialSpotlight({
  targetMeasurements,
  padding = 8,
  onPress,
  children,
}: TutorialSpotlightProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Pulse animation para o elemento destacado
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [targetMeasurements]);

  // Se não houver target, mostrar overlay completo
  if (!targetMeasurements) {
    return (
      <TouchableWithoutFeedback onPress={onPress}>
        <Animated.View style={[styles.overlay, { opacity }]}>
          {children}
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  const { x, y, width, height } = targetMeasurements;

  // Calcular dimensões do "buraco" com padding
  const spotlightX = x - padding;
  const spotlightY = y - padding;
  const spotlightWidth = width + padding * 2;
  const spotlightHeight = height + padding * 2;
  const spotlightRadius = Math.min(spotlightWidth, spotlightHeight) / 2 + 8;

  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <Animated.View style={[styles.container, { opacity }]}>
        {/* Overlay superior */}
        <View
          style={[
            styles.overlaySection,
            {
              top: 0,
              left: 0,
              right: 0,
              height: spotlightY,
            },
          ]}
        />

        {/* Overlay esquerdo (ao lado do buraco) */}
        <View
          style={[
            styles.overlaySection,
            {
              top: spotlightY,
              left: 0,
              width: spotlightX,
              height: spotlightHeight,
            },
          ]}
        />

        {/* Overlay direito (ao lado do buraco) */}
        <View
          style={[
            styles.overlaySection,
            {
              top: spotlightY,
              left: spotlightX + spotlightWidth,
              right: 0,
              height: spotlightHeight,
            },
          ]}
        />

        {/* Overlay inferior */}
        <View
          style={[
            styles.overlaySection,
            {
              top: spotlightY + spotlightHeight,
              left: 0,
              right: 0,
              bottom: 0,
            },
          ]}
        />

        {/* Buraco (área transparente com borda) */}
        <Animated.View
          style={[
            styles.spotlightHole,
            {
              left: spotlightX,
              top: spotlightY,
              width: spotlightWidth,
              height: spotlightHeight,
              borderRadius: spotlightRadius,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />

        {/* Conteúdo (tooltip) */}
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: TUTORIAL_COLORS.background,
    zIndex: 1000,
  },
  overlaySection: {
    position: 'absolute',
    backgroundColor: TUTORIAL_COLORS.background,
  },
  spotlightHole: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: TUTORIAL_COLORS.accent,
    backgroundColor: 'transparent',
  },
});

export default TutorialSpotlight;
