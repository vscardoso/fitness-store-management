/**
 * TutorialTooltip
 * Balão de dica animado com seta apontando para o elemento alvo
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TUTORIAL_COLORS, TutorialStepPosition } from '@/constants/tutorials';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Altura estimada do tooltip (para cálculos de posicionamento)
const ESTIMATED_TOOLTIP_HEIGHT = 220;
const TOOLTIP_MARGIN = 24;
const ARROW_SIZE = 12;
const SAFE_AREA_TOP = 50; // Status bar + safe area
const SAFE_AREA_BOTTOM = 100; // Tab bar + safe area

interface TutorialTooltipProps {
  title: string;
  description: string;
  position?: TutorialStepPosition;
  targetMeasurements?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  onPrevious?: () => void;
  isFirstStep?: boolean;
  isLastStep?: boolean;
}

export function TutorialTooltip({
  title,
  description,
  position = 'bottom',
  targetMeasurements,
  currentStep,
  totalSteps,
  onNext,
  onSkip,
  onPrevious,
  isFirstStep = false,
  isLastStep = false,
}: TutorialTooltipProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // Reset valores para animar novamente
    opacity.setValue(0);
    translateY.setValue(20);
    scale.setValue(0.95);

    // Animação de entrada
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [title, currentStep]); // Re-animar quando mudar o passo

  // Calcular posição do tooltip
  const getTooltipPosition = () => {
    const TOOLTIP_WIDTH = SCREEN_WIDTH - (TOOLTIP_MARGIN * 2);

    // Se não tem target, centralizar na tela
    if (!targetMeasurements) {
      return {
        width: TOOLTIP_WIDTH,
        left: TOOLTIP_MARGIN,
        top: (SCREEN_HEIGHT - ESTIMATED_TOOLTIP_HEIGHT) / 2,
        showArrow: false,
        arrowPosition: 'none' as const,
      };
    }

    const { x, y, width, height } = targetMeasurements;
    const targetBottom = y + height;
    const targetCenterX = x + width / 2;

    // Decidir se o tooltip vai acima ou abaixo do target
    const spaceBelow = SCREEN_HEIGHT - targetBottom - SAFE_AREA_BOTTOM;
    const spaceAbove = y - SAFE_AREA_TOP;

    // Preferir a posição especificada, mas ajustar se não couber
    let actualPosition = position;
    if (position === 'bottom' && spaceBelow < ESTIMATED_TOOLTIP_HEIGHT) {
      actualPosition = 'top';
    } else if (position === 'top' && spaceAbove < ESTIMATED_TOOLTIP_HEIGHT) {
      actualPosition = 'bottom';
    }

    let tooltipTop: number;
    if (actualPosition === 'bottom') {
      tooltipTop = targetBottom + ARROW_SIZE + 8;
    } else {
      tooltipTop = y - ESTIMATED_TOOLTIP_HEIGHT - ARROW_SIZE - 8;
      // Garantir que não fique acima da safe area
      if (tooltipTop < SAFE_AREA_TOP) {
        tooltipTop = SAFE_AREA_TOP;
      }
    }

    // Calcular posição da seta
    const arrowLeft = Math.max(
      20,
      Math.min(targetCenterX - TOOLTIP_MARGIN - ARROW_SIZE, TOOLTIP_WIDTH - 40)
    );

    return {
      width: TOOLTIP_WIDTH,
      left: TOOLTIP_MARGIN,
      top: tooltipTop,
      showArrow: true,
      arrowPosition: actualPosition,
      arrowLeft,
    };
  };

  const tooltipPosition = getTooltipPosition();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: tooltipPosition.width,
          left: tooltipPosition.left,
          top: tooltipPosition.top,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {/* Seta apontando para o elemento */}
      {tooltipPosition.showArrow && (
        <View
          style={[
            styles.arrow,
            tooltipPosition.arrowPosition === 'bottom' ? styles.arrowTop : styles.arrowBottom,
            { left: tooltipPosition.arrowLeft },
          ]}
        />
      )}

      {/* Conteúdo */}
      <View style={styles.content}>
        {/* Header com step indicator */}
        <View style={styles.header}>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>
              {currentStep}/{totalSteps}
            </Text>
          </View>
          <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Título e descrição */}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        {/* Progress dots */}
        <View style={styles.progressDots}>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index + 1 === currentStep && styles.dotActive,
                index + 1 < currentStep && styles.dotCompleted,
              ]}
            />
          ))}
        </View>

        {/* Botões */}
        <View style={styles.buttons}>
          {!isFirstStep && onPrevious && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onPrevious}>
              <Ionicons name="arrow-back" size={18} color={TUTORIAL_COLORS.accent} />
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </TouchableOpacity>
          )}

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipButtonText}>Pular</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryButton} onPress={onNext}>
            <Text style={styles.primaryButtonText}>
              {isLastStep ? 'Concluir' : 'Próximo'}
            </Text>
            <Ionicons
              name={isLastStep ? 'checkmark' : 'arrow-forward'}
              size={18}
              color="#fff"
            />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1001,
  },
  content: {
    backgroundColor: TUTORIAL_COLORS.tooltip,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 1002,
  },
  arrowTop: {
    top: -ARROW_SIZE + 2,
    borderBottomWidth: ARROW_SIZE,
    borderBottomColor: TUTORIAL_COLORS.tooltip,
  },
  arrowBottom: {
    bottom: -ARROW_SIZE + 2,
    borderTopWidth: ARROW_SIZE,
    borderTopColor: TUTORIAL_COLORS.tooltip,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepIndicator: {
    backgroundColor: TUTORIAL_COLORS.accent + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '600',
    color: TUTORIAL_COLORS.accent,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: TUTORIAL_COLORS.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: TUTORIAL_COLORS.textSecondary,
    marginBottom: 16,
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    backgroundColor: TUTORIAL_COLORS.accent,
    width: 20,
  },
  dotCompleted: {
    backgroundColor: TUTORIAL_COLORS.success,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TUTORIAL_COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  secondaryButtonText: {
    color: TUTORIAL_COLORS.accent,
    fontWeight: '500',
    fontSize: 14,
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  skipButtonText: {
    color: '#9CA3AF',
    fontWeight: '500',
    fontSize: 14,
  },
});

export default TutorialTooltip;
