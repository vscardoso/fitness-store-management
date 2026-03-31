/**
 * WizardStepper - Indicador visual moderno de progresso do wizard
 * 4 etapas: Produto → Duplicidade → Entrada → Resumo
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { WizardStep } from '@/types/wizard';

interface WizardStepperProps {
  currentStep: WizardStep;
  compact?: boolean;
  onStepPress?: (step: WizardStep) => void;
  getBlockedReason?: (step: WizardStep) => string | null;
}

export default function WizardStepper({
  currentStep,
  compact = false,
  onStepPress,
  getBlockedReason,
}: WizardStepperProps) {
  const brandingColors = useBrandingColors();
  const [tooltip, setTooltip] = useState<string | null>(null);

  const steps: Array<{ key: WizardStep; label: string }> = [
    { key: 'identify', label: '1 Produto' },
    { key: 'confirm', label: '2 Duplicidade' },
    { key: 'entry', label: '3 Entrada' },
    { key: 'complete', label: '4 Resumo' },
  ];

  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  useEffect(() => {
    if (!tooltip) return;
    const timer = setTimeout(() => setTooltip(null), 2200);
    return () => clearTimeout(timer);
  }, [tooltip]);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={[styles.flowRow, compact && styles.flowRowCompact]}>
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const blockedReason = getBlockedReason?.(step.key) ?? null;
        const isBlocked = !!blockedReason;

        return (
          <React.Fragment key={step.key}>
            <TouchableOpacity
              activeOpacity={onStepPress ? 0.75 : 1}
              disabled={!onStepPress}
              onPress={() => {
                if (isBlocked) {
                  setTooltip(blockedReason);
                  return;
                }
                onStepPress?.(step.key);
              }}
              style={[
                styles.pill,
                compact && styles.pillCompact,
                isBlocked && styles.pillBlocked,
                isCompleted && {
                  backgroundColor: `${brandingColors.primary}1A`,
                  borderColor: `${brandingColors.primary}40`,
                },
                isCurrent && {
                  backgroundColor: brandingColors.primary,
                  borderColor: brandingColors.primary,
                },
              ]}
            >
              {isBlocked && !isCurrent ? (
                <Ionicons
                  name="lock-closed"
                  size={compact ? 10 : 12}
                  color={Colors.light.textTertiary}
                  style={styles.lockIcon}
                />
              ) : null}
              <Text
                style={[
                  styles.pillText,
                  compact && styles.pillTextCompact,
                  isBlocked && !isCurrent && styles.pillTextBlocked,
                  isCompleted && { color: brandingColors.primary },
                  isCurrent && styles.pillTextCurrent,
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </TouchableOpacity>

            {index < steps.length - 1 && (
              <Ionicons
                name="chevron-forward"
                size={compact ? 12 : 14}
                color={Colors.light.textTertiary}
                style={styles.chevron}
              />
            )}
          </React.Fragment>
        );
      })}
      </View>
      {tooltip ? (
        <View style={styles.tooltipBox}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.light.info} />
          <Text style={styles.tooltipText}>{tooltip}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  containerCompact: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  flowRowCompact: {
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  pillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  pillTextCompact: {
    fontSize: 10,
  },
  pillTextCurrent: {
    color: '#fff',
    fontWeight: '700',
  },
  lockIcon: {
    marginRight: 4,
  },
  pillBlocked: {
    opacity: 0.52,
  },
  pillTextBlocked: {
    color: Colors.light.textTertiary,
  },
  chevron: {
    marginHorizontal: 1,
  },
  tooltipBox: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.info + '12',
    borderWidth: 1,
    borderColor: Colors.light.info + '35',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  tooltipText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.info,
    fontWeight: '500',
  },
});
