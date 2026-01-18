/**
 * StatusStepper - Visual stepper showing shipment progress
 * PENDING → SENT → PARTIAL_RETURN/IN_ANALYSIS → COMPLETED
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { ShipmentStatus } from '@/types/conditional';
import { Colors } from '@/constants/Colors';

interface Step {
  key: string;
  label: string;
  icon: string;
  statuses: ShipmentStatus[];
}

const STEPS: Step[] = [
  {
    key: 'created',
    label: 'Criado',
    icon: 'create-outline',
    statuses: ['PENDING'],
  },
  {
    key: 'sent',
    label: 'Enviado',
    icon: 'send-outline',
    statuses: ['SENT'],
  },
  {
    key: 'analysis',
    label: 'Em Análise',
    icon: 'time-outline',
    statuses: ['PARTIAL_RETURN'],
  },
  {
    key: 'completed',
    label: 'Concluído',
    icon: 'checkmark-circle-outline',
    statuses: ['COMPLETED'],
  },
];

interface StatusStepperProps {
  status: ShipmentStatus;
}

export default function StatusStepper({ status }: StatusStepperProps) {
  // Special handling for CANCELLED and OVERDUE
  if (status === 'CANCELLED') {
    return (
      <View style={styles.cancelledContainer}>
        <Ionicons name="close-circle" size={20} color={Colors.light.error} />
        <Text style={styles.cancelledText}>Envio Cancelado</Text>
      </View>
    );
  }

  if (status === 'OVERDUE') {
    return (
      <View style={styles.overdueContainer}>
        <Ionicons name="alert-circle" size={20} color={Colors.light.error} />
        <Text style={styles.overdueText}>Envio Atrasado</Text>
      </View>
    );
  }

  // Find current step
  const currentStepIndex = STEPS.findIndex((step) =>
    step.statuses.includes(status)
  );

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const isActive = index <= currentStepIndex;
        const isCurrent = index === currentStepIndex;

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
                <Ionicons
                  name={step.icon as any}
                  size={16}
                  color={isActive ? Colors.light.primary : Colors.light.textSecondary}
                />
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isCurrent && styles.stepLabelCurrent,
                ]}
              >
                {step.label}
              </Text>
            </View>

            {/* Connector Line */}
            {index < STEPS.length - 1 && (
              <View
                style={[
                  styles.connector,
                  isActive && styles.connectorActive,
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  stepContainer: {
    alignItems: 'center',
    gap: 8,
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
    backgroundColor: Colors.light.primary + '15',
    borderColor: Colors.light.primary,
  },
  stepCircleCurrent: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  stepLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    maxWidth: 60,
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
    marginHorizontal: 4,
    marginBottom: 32,
  },
  connectorActive: {
    backgroundColor: Colors.light.primary,
  },
  cancelledContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    backgroundColor: Colors.light.error + '10',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  cancelledText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.error,
  },
  overdueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    backgroundColor: Colors.light.warning + '10',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  overdueText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.error,
  },
});
