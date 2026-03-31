/**
 * PeriodFilter Component
 *
 * Componente de filtro de período predefinido para o dashboard.
 * Exibe um dropdown elegante com opções como "Este Mês", "Últimos 30 dias", etc.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

const { width } = Dimensions.get('window');

export type PeriodFilterValue =
  | 'this_month'
  | 'last_30_days'
  | 'last_2_months'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year';

export interface PeriodOption {
  value: PeriodFilterValue;
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

interface PeriodFilterProps {
  value: PeriodFilterValue;
  onChange: (value: PeriodFilterValue) => void;
  compact?: boolean;
}

export default function PeriodFilter({
  value,
  onChange,
  compact = false,
}: PeriodFilterProps) {
  const brandingColors = useBrandingColors();
  const [modalVisible, setModalVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const selectedOption = PERIOD_OPTIONS.find((opt) => opt.value === value);

  const openModal = () => {
    setModalVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setModalVisible(false));
  };

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

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.overlay} onPress={closeModal}>
          <Animated.View
            style={[
              styles.modalContainer,
              {
                opacity: fadeAnim,
                transform: [
                  {
                    scale: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable style={styles.modalContent} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Selecionar Período</Text>
                <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={Colors.light.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.optionsList}>
                {PERIOD_OPTIONS.map((option, index) => {
                  const isSelected = option.value === value;
                  const isLast = index === PERIOD_OPTIONS.length - 1;

                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.optionItem,
                        isSelected && { backgroundColor: brandingColors.primary + '12' },
                        !isLast && styles.optionItemBorder,
                      ]}
                      onPress={() => handleSelect(option.value)}
                      activeOpacity={0.6}
                    >
                      <View style={styles.optionContent}>
                        <Text
                          style={[
                            styles.optionLabel,
                            isSelected && { color: brandingColors.primary, fontWeight: '600' },
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text style={styles.optionDescription}>
                          {option.description}
                        </Text>
                      </View>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: brandingColors.primary }]}>
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
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

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: width - 40,
    maxWidth: 380,
  },
  modalContent: {
    backgroundColor: Colors.light.card,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },

  // Header
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundSecondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
  closeButton: {
    padding: 4,
  },

  // Options list
  optionsList: {
    paddingVertical: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  optionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundSecondary,
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
