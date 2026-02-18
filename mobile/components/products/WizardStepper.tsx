/**
 * WizardStepper - Indicador visual de progresso do wizard
 * 3 etapas: Identificar → Confirmar → Entrada
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import type { WizardStep } from '@/types/wizard';
import { WIZARD_STEPS } from '@/types/wizard';

interface WizardStepperProps {
  currentStep: WizardStep;
  completedSteps?: WizardStep[];
}

export default function WizardStepper({
  currentStep,
  completedSteps = [],
}: WizardStepperProps) {
  // Filtra o step 'complete' para mostrar apenas 3 steps visuais
  // Quando está no 'complete', mostra todos os 3 anteriores como completados
  const visibleSteps = WIZARD_STEPS.filter(s => s.key !== 'complete');
  const isComplete = currentStep === 'complete';
  const currentIndex = isComplete
    ? visibleSteps.length // Todos completados
    : visibleSteps.findIndex(s => s.key === currentStep);

  return (
    <View style={styles.container}>
      {visibleSteps.map((step, index) => {
        const isActive = index <= currentIndex;
        const isCurrent = !isComplete && step.key === currentStep;
        const isCompleted = isComplete || completedSteps.includes(step.key) || index < currentIndex;
        const isAllComplete = isComplete;

        return (
          <React.Fragment key={step.key}>
            {/* Step Circle */}
            <View style={styles.stepContainer}>
              <View
                style={[
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isCurrent && styles.stepCircleCurrent,
                  isAllComplete && styles.stepCircleComplete,
                ]}
              >
                {isCompleted ? (
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={isAllComplete ? Colors.light.success : '#fff'}
                  />
                ) : (
                  <Ionicons
                    name={step.icon as any}
                    size={18}
                    color={isCurrent ? '#fff' : isActive ? Colors.light.primary : Colors.light.textTertiary}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isCurrent && styles.stepLabelCurrent,
                  isAllComplete && styles.stepLabelComplete,
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>

            {/* Connector Line */}
            {index < visibleSteps.length - 1 && (
              <View
                style={[
                  styles.connector,
                  (isActive && index < currentIndex) && styles.connectorActive,
                  isAllComplete && styles.connectorComplete,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  stepContainer: {
    alignItems: 'center',
    gap: 6,
    width: 70,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 2,
    borderColor: Colors.light.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: Colors.light.primary + '20',
    borderColor: Colors.light.primary,
  },
  stepCircleCurrent: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  stepLabel: {
    fontSize: 11,
    color: Colors.light.textTertiary,
    textAlign: 'center',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: Colors.light.text,
    fontWeight: '600',
  },
  stepLabelCurrent: {
    color: Colors.light.primary,
    fontWeight: '700',
  },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.light.border,
    marginTop: 19, // Alinha com centro do círculo
    marginHorizontal: 4,
  },
  connectorActive: {
    backgroundColor: Colors.light.primary,
  },
  stepCircleComplete: {
    backgroundColor: Colors.light.success + '20',
    borderColor: Colors.light.success,
  },
  stepLabelComplete: {
    color: Colors.light.success,
    fontWeight: '600',
  },
  connectorComplete: {
    backgroundColor: Colors.light.success,
  },
});
