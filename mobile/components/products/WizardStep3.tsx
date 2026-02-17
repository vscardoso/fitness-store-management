/**
 * WizardStep3 - Vincular Entrada de Estoque
 *
 * Após criar o produto, oferece opções:
 * - Nova Entrada (recomendado FIFO)
 * - Entrada Existente
 * - Pular (com aviso)
 */

import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';

interface WizardStep3Props {
  wizard: UseProductWizardReturn;
}

export default function WizardStep3({ wizard }: WizardStep3Props) {
  const { state } = wizard;

  // Detectar se é produto novo ou existente (duplicado)
  const isExistingProduct = state.duplicates.length > 0 && 
                           state.duplicates.some(d => d.product_id === state.createdProduct?.id);

  const handleNewEntry = () => {
    wizard.goToNewEntry();
  };

  const handleSkip = () => {
    wizard.skipEntry();
  };

  return (
    <View style={styles.container}>
      {/* Success Header */}
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          <Ionicons 
            name={isExistingProduct ? "cube" : "checkmark-circle"} 
            size={64} 
            color={isExistingProduct ? Colors.light.primary : Colors.light.success} 
          />
        </View>
        <Text style={styles.successTitle}>
          {isExistingProduct ? 'Produto Selecionado!' : 'Produto Criado!'}
        </Text>
        <Text style={styles.successProduct}>
          "{state.createdProduct?.name}"
        </Text>
        <Text style={styles.successSubtitle}>
          {isExistingProduct 
            ? 'Agora você pode adicionar estoque a este produto.'
            : 'foi cadastrado com sucesso no seu catálogo.'
          }
        </Text>
      </View>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Vincular estoque?</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {/* Nova Entrada - Recomendado */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={handleNewEntry}
          activeOpacity={0.8}
        >
          <View style={styles.optionIconContainer}>
            <Ionicons name="add-circle" size={28} color={Colors.light.primary} />
          </View>
          <View style={styles.optionContent}>
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>Nova Entrada</Text>
              <View style={styles.recommendedBadge}>
                <Ionicons name="star" size={12} color={Colors.light.warning} />
                <Text style={styles.recommendedText}>Recomendado</Text>
              </View>
            </View>
            <Text style={styles.optionDescription}>
              Criar uma entrada de estoque com este produto
            </Text>
            <Text style={styles.optionHint}>
              Melhor para rastreabilidade FIFO
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.light.primary} />
        </TouchableOpacity>

        {/* Pular */}
        <TouchableOpacity
          style={[styles.optionCard, styles.optionCardOutline]}
          onPress={handleSkip}
          activeOpacity={0.8}
        >
          <View style={[styles.optionIconContainer, styles.optionIconContainerOutline]}>
            <Ionicons name="arrow-forward-circle" size={28} color={Colors.light.textSecondary} />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitleOutline}>Pular por Agora</Text>
            <Text style={styles.optionDescription}>
              Voltar para lista de produtos
            </Text>
            <View style={styles.warningRow}>
              <Ionicons name="alert-circle" size={14} color={Colors.light.warning} />
              <Text style={styles.warningText}>
                Sem rastreabilidade FIFO
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.light.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={20} color={Colors.light.info} />
        <Text style={styles.infoText}>
          Vincular a uma entrada permite rastrear custo real, ROI e sell-through de cada compra.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: theme.spacing.md,
  },

  // Success
  successContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  successIcon: {
    marginBottom: theme.spacing.md,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  successProduct: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.primary,
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.light.border,
  },
  dividerText: {
    paddingHorizontal: theme.spacing.md,
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },

  // Options
  optionsContainer: {
    gap: theme.spacing.md,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.primary + '08',
    borderWidth: 2,
    borderColor: Colors.light.primary,
    borderRadius: 16,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  optionCardOutline: {
    backgroundColor: '#fff',
    borderColor: Colors.light.border,
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.light.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconContainerOutline: {
    backgroundColor: Colors.light.backgroundSecondary,
  },
  optionContent: {
    flex: 1,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  optionTitleOutline: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  recommendedText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.warning,
  },
  optionDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  optionHint: {
    fontSize: 12,
    color: Colors.light.success,
    fontWeight: '500',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  warningText: {
    fontSize: 12,
    color: Colors.light.warning,
  },

  // Info
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.light.info + '10',
    borderRadius: 12,
    padding: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 18,
  },
});
