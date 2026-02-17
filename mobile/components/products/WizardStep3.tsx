/**
 * WizardStep3 - Vincular Entrada de Estoque
 *
 * Após criar o produto, oferece opções:
 * - Nova Entrada (cria entrada nova com produto)
 * - Entrada Existente (vincula a entrada já criada)
 * - Manter no Catálogo (produto aguarda reposição)
 */

import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';

interface WizardStep3Props {
  wizard: UseProductWizardReturn;
}

export default function WizardStep3({ wizard }: WizardStep3Props) {
  const { state } = wizard;

  return (
    <View style={styles.container}>
      {/* Success Header */}
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          <Ionicons
            name="checkmark-circle"
            size={64}
            color={Colors.light.success}
          />
        </View>
        <Text style={styles.successTitle}>Produto Criado!</Text>
        <Text style={styles.successProduct}>
          "{state.createdProduct?.name}"
        </Text>
        <Text style={styles.successSubtitle}>
          Cadastrado no catálogo. Adicione estoque para ativar.
        </Text>
      </View>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Adicionar estoque</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {/* Nova Entrada - Recomendado */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => wizard.goToNewEntry()}
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
              Criar entrada de estoque com este produto
            </Text>
            <Text style={styles.optionHint}>
              Compra avulsa, reposição ou estoque inicial
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.light.primary} />
        </TouchableOpacity>

        {/* Entrada Existente */}
        <TouchableOpacity
          style={[styles.optionCard, styles.optionCardSecondary]}
          onPress={() => wizard.goToExistingEntry()}
          activeOpacity={0.8}
        >
          <View style={[styles.optionIconContainer, styles.optionIconContainerSecondary]}>
            <Ionicons name="link" size={28} color={Colors.light.secondary} />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Entrada Existente</Text>
            <Text style={styles.optionDescription}>
              Vincular a uma entrada já criada
            </Text>
            <Text style={styles.optionHint}>
              Viagem ou compra em andamento
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.light.secondary} />
        </TouchableOpacity>

        {/* Manter no Catálogo */}
        <TouchableOpacity
          style={[styles.optionCard, styles.optionCardOutline]}
          onPress={() => wizard.skipEntry()}
          activeOpacity={0.8}
        >
          <View style={[styles.optionIconContainer, styles.optionIconContainerOutline]}>
            <Ionicons name="albums-outline" size={28} color={Colors.light.textSecondary} />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitleOutline}>Manter no Catálogo</Text>
            <Text style={styles.optionDescription}>
              Produto fica aguardando reposição
            </Text>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle" size={14} color={Colors.light.info} />
              <Text style={styles.infoRowText}>
                Estoque = 0 até vincular entrada
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.light.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="cube-outline" size={20} color={Colors.light.info} />
        <Text style={styles.infoText}>
          Produtos no catálogo ficam disponíveis para adicionar em qualquer entrada futura.
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
  optionCardSecondary: {
    backgroundColor: Colors.light.secondary + '08',
    borderColor: Colors.light.secondary,
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
  optionIconContainerSecondary: {
    backgroundColor: Colors.light.secondary + '20',
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoRowText: {
    fontSize: 12,
    color: Colors.light.info,
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
