/**
 * WizardStep3 - Vincular Entrada de Estoque
 *
 * Após criar o produto, oferece opções:
 * - Nova Entrada (cria entrada nova com produto)
 * - Entrada Existente (vincula a entrada já criada)
 * - Manter no Catálogo (produto aguarda reposição)
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';
import { formatCurrency } from '@/utils/format';

interface WizardStep3Props {
  wizard: UseProductWizardReturn;
}

export default function WizardStep3({ wizard }: WizardStep3Props) {
  const { state } = wizard;
  const [quantityModalVisible, setQuantityModalVisible] = useState(false);
  const [quantityInput, setQuantityInput] = useState('1');
  const [quantityError, setQuantityError] = useState('');

  const handleExistingEntryPress = () => {
    setQuantityModalVisible(true);
    setQuantityInput('1');
    setQuantityError('');
  };

  const handleConfirmQuantity = () => {
    const qty = parseInt(quantityInput);
    if (isNaN(qty) || qty <= 0) {
      setQuantityError('Quantidade deve ser maior que zero');
      return;
    }

    Keyboard.dismiss();
    setQuantityModalVisible(false);
    // Passar a quantidade para o wizard
    wizard.goToExistingEntry(qty);
  };

  const product = state.createdProduct;

  return (
    <>
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      {/* Success Header com resumo do produto */}
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          <Ionicons
            name="checkmark-circle"
            size={56}
            color={Colors.light.success}
          />
        </View>
        <Text style={styles.successTitle}>Produto Criado!</Text>

        {/* Resumo inline do produto */}
        {product && (
          <View style={styles.productSummary}>
            <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
            <View style={styles.productMeta}>
              <Text style={styles.productSku}>{product.sku}</Text>
              <Text style={styles.productPrice}>{formatCurrency(product.price)}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Aviso de Estoque */}
      <View style={styles.stockWarning}>
        <Ionicons name="alert-circle" size={18} color={Colors.light.warning} />
        <Text style={styles.stockWarningText}>
          Estoque atual: 0 unidades - Vincule a uma entrada para rastreabilidade FIFO
        </Text>
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
          onPress={handleExistingEntryPress}
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
    </ScrollView>

      {/* Modal de Quantidade para Entrada Existente */}
      <Modal
        visible={quantityModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          Keyboard.dismiss();
          setQuantityModalVisible(false);
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="calculator" size={28} color={Colors.light.primary} />
              </View>
              <Text style={styles.modalTitle}>Quantidade de Itens</Text>
              <Text style={styles.modalSubtitle}>
                Quantos itens deste produto você está adicionando?
              </Text>
            </View>

            <View style={styles.modalContent}>
              <TextInput
                label="Quantidade *"
                value={quantityInput}
                onChangeText={(text) => {
                  setQuantityInput(text.replace(/[^0-9]/g, ''));
                  setQuantityError('');
                }}
                mode="outlined"
                keyboardType="number-pad"
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => Keyboard.dismiss()}
                style={styles.quantityInput}
                left={<TextInput.Icon icon="package-variant" />}
                error={!!quantityError}
              />
              {quantityError ? (
                <Text style={styles.errorText}>{String(quantityError)}</Text>
              ) : null}

              <View style={styles.quickButtons}>
                {[1, 5, 10, 20, 50].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={styles.quickButton}
                    onPress={() => {
                      Keyboard.dismiss();
                      setQuantityInput(String(num));
                      setQuantityError('');
                    }}
                  >
                    <Text style={styles.quickButtonText}>{num}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalHint}>
                <Ionicons name="information-circle" size={16} color={Colors.light.info} />
                <Text style={styles.modalHintText}>
                  Você será levado para selecionar a entrada existente
                </Text>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <Button
                mode="outlined"
                onPress={() => {
                  Keyboard.dismiss();
                  setQuantityModalVisible(false);
                }}
                style={styles.modalCancelButton}
              >
                Cancelar
              </Button>
              <Button
                mode="contained"
                onPress={handleConfirmQuantity}
                style={styles.modalConfirmButton}
                icon="check"
              >
                Continuar
              </Button>
            </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    padding: theme.spacing.md,
    paddingBottom: 40,
  },

  // Success Header com resumo
  successContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  successIcon: {
    marginBottom: theme.spacing.sm,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.success,
    marginBottom: theme.spacing.sm,
  },
  productSummary: {
    backgroundColor: Colors.light.primary + '08',
    borderRadius: 12,
    padding: theme.spacing.md,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.primary + '20',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  productMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  productSku: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.primary,
  },

  // Aviso de estoque
  stockWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: theme.spacing.md,
    backgroundColor: Colors.light.warning + '12',
    borderRadius: 12,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.light.warning + '30',
  },
  stockWarningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.warning,
    fontWeight: '500',
    lineHeight: 18,
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

  // Modal de Quantidade
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 8,
  },
  modalHeader: {
    backgroundColor: Colors.light.primary + '10',
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  modalContent: {
    padding: theme.spacing.lg,
  },
  quantityInput: {
    backgroundColor: '#fff',
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: Colors.light.error,
    fontSize: 12,
    marginTop: -8,
    marginBottom: theme.spacing.md,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  quickButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: Colors.light.primary + '15',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.primary + '30',
  },
  quickButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  modalHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.info + '10',
    padding: theme.spacing.md,
    borderRadius: 12,
  },
  modalHintText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.info,
    lineHeight: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  modalCancelButton: {
    flex: 1,
    borderColor: Colors.light.border,
  },
  modalConfirmButton: {
    flex: 2,
    backgroundColor: Colors.light.primary,
  },
});
