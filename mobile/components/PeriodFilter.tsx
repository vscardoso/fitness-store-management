/**
 * PeriodFilter Component
 *
 * Componente de filtro de período predefinido para o dashboard.
 * Exibe um dropdown elegante com opções como "Este Mês", "Últimos 30 dias", etc.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import BottomSheet from '@/components/ui/BottomSheet';


export type PeriodFilterValue =
  | 'this_month'
  | 'last_30_days'
  | 'last_2_months'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year';

export interface PeriodOption {
  value: string;
  label: string;
  shortLabel: string;
  description: string;
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  {
    value: 'this_month',
    label: 'Este Mês',
    shortLabel: 'Este Mês',
    description: 'Desde o 1º dia do mês atual',
  },
  {
    value: 'last_30_days',
    label: 'Últimos 30 dias',
    shortLabel: '30 dias',
    description: 'Os últimos 30 dias corridos',
  },
  {
    value: 'last_2_months',
    label: 'Últimos 2 meses',
    shortLabel: '2 meses',
    description: 'Os últimos 2 meses',
  },
  {
    value: 'last_3_months',
    label: 'Últimos 3 meses',
    shortLabel: '3 meses',
    description: 'Os últimos 3 meses',
  },
  {
    value: 'last_6_months',
    label: 'Últimos 6 meses',
    shortLabel: '6 meses',
    description: 'Os últimos 6 meses',
  },
  {
    value: 'this_year',
    label: 'Este Ano',
    shortLabel: 'Este Ano',
    description: 'Desde 1º de janeiro',
  },
];

/** Períodos curtos, só para o relatório de vendas (os outros filtros do app seguem com a lista padrão). */
export const SALES_REPORT_PERIOD_OPTIONS: PeriodOption[] = [
  { value: 'today', label: 'Hoje', shortLabel: 'Hoje', description: 'Só as vendas de hoje' },
  { value: 'yesterday', label: 'Ontem', shortLabel: 'Ontem', description: 'Só as vendas de ontem' },
  { value: 'last_7_days', label: 'Últimos 7 dias', shortLabel: '7 dias', description: 'Os últimos 7 dias, contando hoje' },
  { value: 'last_15_days', label: 'Últimos 15 dias', shortLabel: '15 dias', description: 'Os últimos 15 dias, contando hoje' },
  ...PERIOD_OPTIONS,
];

interface PeriodFilterProps {
  value: PeriodFilterValue;
  onChange: (value: PeriodFilterValue) => void;
  compact?: boolean;
  /** Lista própria de períodos (padrão: PERIOD_OPTIONS). */
  options?: PeriodOption[];
}

export default function PeriodFilter({
  value,
  onChange,
  compact = false,
  options = PERIOD_OPTIONS,
}: PeriodFilterProps) {
  const brandingColors = useBrandingColors();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);

  const openModal = () => setModalVisible(true);
  const closeModal = () => setModalVisible(false);

  const handleSelect = (optionValue: PeriodFilterValue) => {
    onChange(optionValue);
    closeModal();
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, compact && styles.triggerCompact, { backgroundColor: brandingColors.primary + '15', borderColor: brandingColors.primary + '40' }]}
        onPress={openModal}
        activeOpacity={0.7}
      >
        <Ionicons
          name="calendar-outline"
          size={compact ? 16 : 18}
          color={brandingColors.primary}
        />
        <Text style={[styles.triggerText, compact && styles.triggerTextCompact, { color: brandingColors.primary }]}>
          {compact ? selectedOption?.shortLabel : selectedOption?.label}
        </Text>
        <Ionicons
          name="chevron-down"
          size={compact ? 14 : 16}
          color={Colors.light.textSecondary}
        />
      </TouchableOpacity>

      <BottomSheet
        visible={modalVisible}
        onDismiss={closeModal}
        title="Selecionar período"
        subtitle="Escolha de quando mostrar os números"
        icon="calendar-outline"
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionItem,
                styles.optionItemBorder,
                isSelected && { backgroundColor: brandingColors.primary + '12', borderColor: brandingColors.primary + '55' },
              ]}
              onPress={() => handleSelect(option.value as PeriodFilterValue)}
              activeOpacity={0.7}
            >
              <View style={styles.optionContent}>
                <Text style={[styles.optionLabel, isSelected && { color: brandingColors.primary, fontWeight: '700' }]}>
                  {option.label}
                </Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              {isSelected && (
                <View style={[styles.checkIcon, { backgroundColor: brandingColors.primary }]}>
                  <Ionicons name="checkmark" size={18} color={Colors.light.white} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger button
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
  },
  triggerCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  triggerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  triggerTextCompact: {
    fontSize: 12,
  },

  // Options list
  optionsList: {
    paddingVertical: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 12,
  },
  optionItemBorder: {
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  optionItemSelected: {},
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.light.text,
    marginBottom: 2,
  },
  optionLabelSelected: {},
  optionDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  checkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
