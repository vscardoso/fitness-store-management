/**
 * WizardStep3 - Vincular Entrada de Estoque
 *
 * Após criar o produto, oferece opções:
 * - Nova Entrada (cria entrada nova com produto)
 * - Entrada Existente (vincula a entrada já criada) - só aparece se houver entradas
 * - Manter no Catálogo (produto aguarda reposição)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Keyboard,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';
import { formatCurrency } from '@/utils/format';
import { getStockEntries } from '@/services/stockEntryService';
import type { StockEntry } from '@/types';
import { useBrandingColors } from '@/store/brandingStore';

interface WizardStep3Props {
  wizard: UseProductWizardReturn;
}

const QUICK_QTY_OPTIONS = [1, 5, 10];

export default function WizardStep3({ wizard }: WizardStep3Props) {
  const { state } = wizard;
  const brandingColors = useBrandingColors();
  const visual = useMemo(
    () => ({
      primarySoft: `${brandingColors.primary}10`,
      primaryBorder: `${brandingColors.primary}35`,
      secondarySoft: `${brandingColors.secondary}10`,
      secondaryBorder: `${brandingColors.secondary}35`,
      primaryStrong: `${brandingColors.primary}20`,
      secondaryStrong: `${brandingColors.secondary}20`,
    }),
    [brandingColors.primary, brandingColors.secondary],
  );

  // Variantes do produto criado (se houver)
  const productVariants: any[] = useMemo(
    () => (state.createdProduct as any)?.variants ?? [],
    [state.createdProduct],
  );
  const hasVariants = useMemo(() => {
    const productAny = state.createdProduct as any;
    if (!productAny) return false;

    // Regra principal: flag explícita do wizard (evita estado fantasma entre restores).
    if (typeof productAny._hasWizardVariants === 'boolean') {
      return productAny._hasWizardVariants;
    }

    // Fluxo atômico sempre representa produto com variantes.
    if (productAny._atomicVariants === true) {
      return true;
    }

    // Produto virtual simples não deve abrir modal de variantes.
    if (productAny._virtual === true && state.hasVariants === false) {
      return false;
    }

    return productVariants.length > 0;
  }, [state.createdProduct, state.hasVariants, productVariants]);

  // Modal de quantidade unificado para produto simples (nova/existente)
  const [quantityModalVisible, setQuantityModalVisible] = useState(false);
  const [quantityMode, setQuantityMode] = useState<'new' | 'existing'>('new');
  const [quantityValue, setQuantityValue] = useState('');
  const [quantityError, setQuantityError] = useState('');

  // Modal para Nova Entrada — modo variantes
  const [variantQtyModalVisible, setVariantQtyModalVisible] = useState(false);
  // 'new' = nova entrada, 'existing' = entrada existente
  const [variantQtyMode, setVariantQtyMode] = useState<'new' | 'existing'>('new');
  const [variantQtys, setVariantQtys] = useState<Record<number, string>>({});

  // Estado para verificar se existem entradas
  const [hasExistingEntries, setHasExistingEntries] = useState<boolean | null>(null);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);

  // Buscar entradas existentes ao montar o componente
  useEffect(() => {
    const checkExistingEntries = async () => {
      try {
        setIsLoadingEntries(true);
        const entries = await getStockEntries({ limit: 1 });
        // Considera que existem entradas se houver pelo menos 1
        setHasExistingEntries(entries.length > 0);
      } catch (error) {
        console.error('Erro ao buscar entradas:', error);
        setHasExistingEntries(false);
      } finally {
        setIsLoadingEntries(false);
      }
    };

    checkExistingEntries();
  }, []);

  // Abre o modal de variantes no modo correto
  const openVariantQtyModal = (mode: 'new' | 'existing') => {
    const initial: Record<number, string> = {};
    productVariants.forEach((v: any) => { initial[v.id] = ''; });
    setVariantQtys(initial);
    setVariantQtyMode(mode);
    setVariantQtyModalVisible(true);
  };

  // Handler para Nova Entrada — abre modal adequado
  const handleNewEntryPress = () => {
    if (hasVariants) {
      openVariantQtyModal('new');
    } else {
      setQuantityMode('new');
      setQuantityModalVisible(true);
      setQuantityValue('');
      setQuantityError('');
    }
  };

  // Confirma quantidade para produto simples (nova/existente)
  const handleConfirmSimpleEntry = () => {
    const qty = parseInt(quantityValue);
    if (isNaN(qty) || qty <= 0) {
      setQuantityError('Quantidade deve ser maior que zero');
      return;
    }

    Keyboard.dismiss();
    setQuantityModalVisible(false);

    if (quantityMode === 'existing') {
      wizard.goToExistingEntry(qty);
      return;
    }

    wizard.goToNewEntry(qty);
  };

  // Confirma quantidades por variante (Nova Entrada ou Entrada Existente)
  const handleConfirmVariantEntry = () => {
    Keyboard.dismiss();
    setVariantQtyModalVisible(false);

    const qtys: Record<number, number> = {};
    productVariants.forEach((v: any) => {
      qtys[v.id] = parseInt(variantQtys[v.id] ?? '0') || 0;
    });

    if (variantQtyMode === 'existing') {
      wizard.goToExistingEntryWithVariants(qtys);
    } else {
      wizard.goToNewEntryWithVariants(qtys);
    }
  };

  // Handler para Entrada Existente - abre modal adequado (variantes ou simples)
  const handleExistingEntryPress = () => {
    if (hasVariants) {
      openVariantQtyModal('existing');
    } else {
      setQuantityMode('existing');
      setQuantityModalVisible(true);
      setQuantityValue('');
      setQuantityError('');
    }
  };

  const getVariantLabel = (v: any): string => {
    const parts = [v.size, v.color].filter(Boolean);
    return parts.length > 0 ? parts.join(' - ') : v.sku ?? `Variante ${v.id}`;
  };

  const product = state.createdProduct;
  // No fluxo atômico de variantes, o produto ainda não existe no banco —
  // ele só é criado quando o usuário confirma a entrada em entries/add.
  const isAtomicVariants = (product as any)?._atomicVariants === true;

  // Faixa de preço: mostra "min – max" quando há variantes com preços distintos
  const priceDisplay = useMemo(() => {
    if (productVariants.length > 0) {
      const prices = productVariants.map((v: any) => Number(v.price)).filter((p: number) => p > 0);
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
      }
    }
    return formatCurrency(product?.price ?? 0);
  }, [productVariants, product]);

  const renderPrimaryModalAction = (label: string, onPress: () => void) => (
    <TouchableOpacity style={styles.modalConfirmButton} onPress={onPress} activeOpacity={0.8}>
      <LinearGradient
        colors={brandingColors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.modalConfirmGradient}
      >
        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
        <Text style={styles.modalConfirmText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <>
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      {/* Header — contexto diferente para fluxo atômico vs produto já criado */}
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          <Ionicons
            name={isAtomicVariants ? 'cube-outline' : 'checkmark-circle'}
            size={56}
            color={isAtomicVariants ? brandingColors.primary : Colors.light.success}
          />
        </View>
        <Text style={[styles.successTitle, isAtomicVariants && { color: brandingColors.primary }]}>
          {isAtomicVariants ? 'Dados Configurados' : 'Produto Criado!'}
        </Text>
        {isAtomicVariants && (
          <Text style={styles.pendingSubtitle}>
            O produto e suas variações serão criados junto com a entrada de estoque
          </Text>
        )}

        {/* Resumo inline do produto */}
        {product && (
          <View style={[styles.productSummary, { backgroundColor: visual.primarySoft, borderColor: visual.primaryBorder }]}>
            <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
            <View style={styles.productMeta}>
              <Text style={styles.productSku}>{product.sku}</Text>
              <Text style={[styles.productPrice, { color: VALUE_COLORS.neutral }]}>{priceDisplay}</Text>
            </View>
            {isAtomicVariants && productVariants.length > 0 && (
              <Text style={[styles.variantCountLabel, { color: brandingColors.primary }]}>
                {productVariants.length} {productVariants.length === 1 ? 'variação' : 'variações'} configuradas
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Aviso contextual */}
      <View
        style={[
          styles.stockWarning,
          {
            backgroundColor: isAtomicVariants ? visual.secondarySoft : visual.primarySoft,
            borderColor: isAtomicVariants ? visual.secondaryBorder : visual.primaryBorder,
          },
        ]}
      >
        <Ionicons
          name={isAtomicVariants ? 'information-circle' : 'alert-circle'}
          size={18}
          color={isAtomicVariants ? brandingColors.secondary : brandingColors.primary}
        />
        <Text style={[styles.stockWarningText, { color: isAtomicVariants ? brandingColors.secondary : brandingColors.primary }]}>
          {isAtomicVariants
            ? 'Produto ainda não foi criado — escolha uma entrada abaixo para concluir o cadastro'
            : 'Estoque atual: 0 unidades — vincule a uma entrada para rastreabilidade FIFO'}
        </Text>
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {/* Nova Entrada - Recomendado */}
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: visual.primarySoft, borderColor: visual.primaryBorder }]}
          onPress={handleNewEntryPress}
          activeOpacity={0.8}
        >
          <View style={[styles.optionIconContainer, { backgroundColor: visual.primaryStrong }]}>
            <Ionicons name="add-circle" size={28} color={brandingColors.primary} />
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
          <Ionicons name="chevron-forward" size={24} color={brandingColors.primary} />
        </TouchableOpacity>

        {/* Entrada Existente - Só aparece se houver entradas cadastradas */}
        {isLoadingEntries ? (
          <View style={[styles.optionCard, styles.optionCardSecondary, styles.loadingCard]}>
            <ActivityIndicator size="small" color={brandingColors.secondary} />
            <Text style={styles.loadingText}>Verificando entradas...</Text>
          </View>
        ) : hasExistingEntries ? (
          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: visual.secondarySoft, borderColor: visual.secondaryBorder }]}
            onPress={handleExistingEntryPress}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: visual.secondaryStrong }]}>
              <Ionicons name="link" size={28} color={brandingColors.secondary} />
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
            <Ionicons name="chevron-forward" size={24} color={brandingColors.secondary} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.optionCard, styles.optionCardDisabled]}>
            <View style={[styles.optionIconContainer, styles.optionIconContainerDisabled]}>
              <Ionicons name="link" size={28} color={Colors.light.textTertiary} />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitleDisabled}>Entrada Existente</Text>
              <Text style={styles.optionDescriptionDisabled}>
                Nenhuma entrada disponível
              </Text>
              <Text style={styles.optionHintDisabled}>
                Crie uma nova entrada acima
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.light.textTertiary} />
          </View>
        )}
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="cube-outline" size={20} color={brandingColors.secondary} />
        <Text style={styles.infoText}>
          Produtos no catálogo ficam disponíveis para adicionar em qualquer entrada futura.
        </Text>
      </View>
    </ScrollView>

      {/* Modal de Quantidade por Variante para Nova Entrada */}
      <Modal
        visible={variantQtyModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          Keyboard.dismiss();
          setVariantQtyModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop — toque fora fecha sem bloquear o scroll do container */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => { Keyboard.dismiss(); setVariantQtyModalVisible(false); }}
            activeOpacity={1}
          />
          {/* View simples: não interfere no sistema de responder do ScrollView */}
          <View style={[styles.modalContainer, styles.variantModalContainer]}>
            {/* Header */}
            <View style={[styles.modalHeader, { backgroundColor: visual.primarySoft }]}>
              <View style={[styles.modalIconContainer, { backgroundColor: visual.primaryStrong }]}>
                <Ionicons name="layers" size={28} color={brandingColors.primary} />
              </View>
              <Text style={styles.modalTitle}>Quantidades por Variação</Text>
              <Text style={styles.modalSubtitle}>
                {variantQtyMode === 'existing'
                  ? 'Informe quantos itens de cada variação estão nessa entrada'
                  : 'Informe quantos itens de cada variação você está adicionando'}
              </Text>
            </View>

            {/* Lista de variantes */}
            <ScrollView
              style={styles.variantList}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              bounces={false}
            >
              {productVariants.map((v: any) => (
                <View key={v.id} style={styles.variantRow}>
                  <View style={styles.variantInfo}>
                    <Text style={styles.variantLabel}>{getVariantLabel(v)}</Text>
                    <Text style={[styles.variantPrice, { color: VALUE_COLORS.neutral }]}>{formatCurrency(v.price)}</Text>
                  </View>
                  {/* Quick buttons */}
                  <View style={styles.variantQuickButtons}>
                    {QUICK_QTY_OPTIONS.map((num) => (
                      <TouchableOpacity
                        key={num}
                        style={[styles.variantQuickButton, { backgroundColor: visual.primarySoft, borderColor: visual.primaryBorder }]}
                        onPress={() => {
                          setVariantQtys((prev) => ({ ...prev, [v.id]: String(num) }));
                          Keyboard.dismiss();
                        }}
                      >
                        <Text style={[styles.variantQuickButtonText, { color: brandingColors.primary }]}>{num}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Input */}
                  <TextInput
                    value={variantQtys[v.id] ?? ''}
                    onChangeText={(text) =>
                      setVariantQtys((prev) => ({
                        ...prev,
                        [v.id]: text.replace(/[^0-9]/g, ''),
                      }))
                    }
                    mode="outlined"
                    keyboardType="number-pad"
                    returnKeyType="done"
                    blurOnSubmit
                    style={styles.variantQtyInput}
                    placeholder="0"
                    dense
                  />
                </View>
              ))}
            </ScrollView>

            {/* Footer */}
            <View style={styles.modalFooter}>
              <Button
                mode="outlined"
                onPress={() => {
                  Keyboard.dismiss();
                  setVariantQtyModalVisible(false);
                }}
                style={styles.modalCancelButton}
              >
                Cancelar
              </Button>
              {renderPrimaryModalAction('Continuar', handleConfirmVariantEntry)}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Quantidade Unificado (produto sem variantes) */}
      <Modal
        visible={quantityModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          Keyboard.dismiss();
          setQuantityModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => { Keyboard.dismiss(); setQuantityModalVisible(false); }} activeOpacity={1} />
          <View style={styles.modalContainer}>
            <View style={[styles.modalHeader, { backgroundColor: visual.primarySoft }]}>
              <View
                style={[
                  styles.modalIconContainer,
                  {
                    backgroundColor:
                      quantityMode === 'existing'
                        ? visual.secondaryStrong
                        : visual.primaryStrong,
                  },
                ]}
              >
                <Ionicons
                  name={quantityMode === 'existing' ? 'link' : 'add-circle'}
                  size={28}
                  color={quantityMode === 'existing' ? brandingColors.secondary : brandingColors.primary}
                />
              </View>
              <Text style={styles.modalTitle}>
                {quantityMode === 'existing' ? 'Entrada Existente' : 'Nova Entrada'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {quantityMode === 'existing'
                  ? 'Quantos itens deste produto você está adicionando?'
                  : 'Quantos itens deste produto você está adicionando ao estoque?'}
              </Text>
            </View>

            <View style={styles.modalContent}>
              <TextInput
                label="Quantidade *"
                value={quantityValue}
                onChangeText={(text) => {
                  setQuantityValue(text.replace(/[^0-9]/g, ''));
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
                placeholder="Digite a quantidade"
              />
              {quantityError ? (
                <Text style={styles.errorText}>{quantityError}</Text>
              ) : null}

              <View style={styles.quickButtons}>
                {QUICK_QTY_OPTIONS.map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[styles.quickButton, { backgroundColor: visual.primarySoft, borderColor: visual.primaryBorder }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setQuantityValue(String(num));
                      setQuantityError('');
                    }}
                  >
                    <Text style={[styles.quickButtonText, { color: brandingColors.primary }]}>{num}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.modalHint, { backgroundColor: visual.secondarySoft }] }>
                <Ionicons name="information-circle" size={16} color={brandingColors.secondary} />
                <Text style={[styles.modalHintText, { color: brandingColors.secondary }]}>
                  {quantityMode === 'existing'
                    ? 'Você será levado para selecionar a entrada existente'
                    : 'Você será levado para criar a entrada de estoque'}
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
              {renderPrimaryModalAction('Continuar', handleConfirmSimpleEntry)}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
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
    color: Colors.light.primary,
    marginBottom: theme.spacing.sm,
  },
  pendingTitle: {
    color: Colors.light.primary,
  },
  pendingSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    lineHeight: 18,
  },
  variantCountLabel: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '600',
    marginTop: 6,
  },
  productSummary: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: theme.spacing.md,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
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
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  stockWarningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
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
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.border,
  },
  loadingCard: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
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
    backgroundColor: Colors.light.card,
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
    backgroundColor: Colors.light.card,
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
    backgroundColor: Colors.light.background,
    padding: theme.spacing.md,
    borderRadius: 12,
  },
  modalHintText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.textSecondary,
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
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  modalConfirmGradient: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // Variant qty modal
  variantModalContainer: {
    maxHeight: '90%',
  },
  variantList: {
    maxHeight: 320,
    paddingHorizontal: theme.spacing.lg,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  variantInfo: {
    flex: 1,
  },
  variantLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  variantPrice: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '500',
    marginTop: 2,
  },
  variantQuickButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  variantQuickButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Colors.light.primary + '15',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.primary + '30',
  },
  variantQuickButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  variantQtyInput: {
    backgroundColor: Colors.light.card,
    width: 72,
  },
  
  // Option Card Disabled
  optionCardDisabled: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderColor: Colors.light.border,
    borderWidth: 1,
    opacity: 0.6,
  },
  optionIconContainerDisabled: {
    backgroundColor: Colors.light.backgroundSecondary + '80',
  },
  optionTitleDisabled: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.textTertiary,
    marginBottom: 4,
  },
  optionDescriptionDisabled: {
    fontSize: 13,
    color: Colors.light.textTertiary,
    marginBottom: 4,
  },
  optionHintDisabled: {
    fontSize: 12,
    color: Colors.light.textTertiary,
  },
});
