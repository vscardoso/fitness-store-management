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
  const currentIndex = WIZARD_STEPS.findIndex(s => s.key === currentStep);

  return (
    <View style={styles.container}>
      {WIZARD_STEPS.map((step, index) => {
        const isActive = index <= currentIndex;
        const isCurrent = step.key === currentStep;
        const isCompleted = completedSteps.includes(step.key) || index < currentIndex;

        return (
          <React.Fragment key={step.key}>
            {/* Step Circle */}
            <View style={styles.stepContainer}>
              <View
                style={[
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isCurrent && styles.stepCircleCurrent,
                ]}
              >
                {isCompleted && !isCurrent ? (
                  <Ionicons name="checkmark" size={18} color="#fff" />
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
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>

            {/* Connector Line */}
            {index < WIZARD_STEPS.length - 1 && (
              <View
                style={[
                  styles.connector,
                  isActive && index < currentIndex && styles.connectorActive,
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
});
