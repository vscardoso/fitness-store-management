import { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { getExpenseCategories, createExpense } from '@/services/expenseService';
import { searchProducts } from '@/services/productService';
import { useConditionalProcessingStore } from '@/store/conditionalProcessingStore';
import { useBrandingColors } from '@/store/brandingStore';
import type { Product } from '@/types';

export default function StockLossRegisterScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();
  const params = useLocalSearchParams<{
    shipmentId: string;
    itemId: string;
    productName?: string;
    variantLabel?: string;
    quantitySent?: string;
    unitCost?: string;
  }>();

  const shipmentId = Number(params.shipmentId);
  const itemId = Number(params.itemId);
  const quantitySent = Number(params.quantitySent || '0');
  const unitCost = Number(params.unitCost || '0');
  const productName = params.productName || `Produto #${itemId}`;
  const variantLabel = params.variantLabel || '';

  const draftItem = useConditionalProcessingStore((state) => state.drafts[shipmentId]?.[itemId]);
  const updateShipmentItem = useConditionalProcessingStore((state) => state.updateShipmentItem);

  const [quantityDamaged, setQuantityDamaged] = useState(String(draftItem?.quantity_damaged || 0));
  const [quantityLost, setQuantityLost] = useState(String(draftItem?.quantity_lost || 0));
  const [notes, setNotes] = useState(draftItem?.notes || '');

  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [unitCostInput, setUnitCostInput] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [errorDialog, setErrorDialog] = useState(false);
  const [successDialog, setSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showConfirmCreate, setShowConfirmCreate] = useState(false);

  const headerAnim = useMemo(() => new Animated.Value(0), []);
  const contentAnim = useMemo(() => new Animated.Value(0), []);

  const quantityKept = draftItem?.quantity_kept || 0;
  const quantityReturned = draftItem?.quantity_returned || 0;

  const parsedDamaged = Math.max(0, parseInt(quantityDamaged) || 0);
  const parsedLost = Math.max(0, parseInt(quantityLost) || 0);
  const totalAllocated = quantityKept + quantityReturned + parsedDamaged + parsedLost;
  const remainingToAllocate = Math.max(0, quantitySent - quantityKept - quantityReturned);

  const hasDraftContext = shipmentId > 0 && itemId > 0 && !!draftItem;
  const isStandaloneMode = !hasDraftContext;
  const isValid = shipmentId > 0 && itemId > 0 && totalAllocated <= quantitySent;
  const isValidExpenseDate = /^\d{4}-\d{2}-\d{2}$/.test(expenseDate);

  const lostExpenseAmount = parsedLost * unitCost;
  const standaloneUnitCost = Number(unitCostInput || selectedProduct?.cost_price || 0);
  const standaloneAmount = parsedLost * standaloneUnitCost;
  const standaloneReady = Boolean(selectedProduct) && parsedLost > 0 && standaloneUnitCost > 0 && isValidExpenseDate;

  const summaryRows = useMemo(
    () => [
      { label: 'Enviados', value: `${quantitySent} un` },
      { label: 'Comprados', value: `${quantityKept} un` },
      { label: 'Devolvidos', value: `${quantityReturned} un` },
      { label: 'Disponíveis para prejuízo', value: `${remainingToAllocate} un` },
    ],
    [quantityKept, quantityReturned, quantitySent, remainingToAllocate]
  );

  const { data: categories = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: getExpenseCategories,
    enabled: isStandaloneMode,
  });

  const stockLossCategory = useMemo(
    () => categories.find((category) => category.name === 'Perdas de Estoque'),
    [categories]
  );

  const { data: searchResults = [], isFetching: isSearchingProducts } = useQuery({
    queryKey: ['stock-losses-product-search', productQuery.trim()],
    queryFn: () => searchProducts(productQuery.trim()),
    enabled: isStandaloneMode && productQuery.trim().length >= 2,
  });

  const filteredProducts = useMemo(
    () => (searchResults ?? []).filter((item) => item.is_active).slice(0, 8),
    [searchResults]
  );

  const createStandaloneLossMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error('Selecione um produto para registrar o prejuízo.');
      if (!stockLossCategory?.id) throw new Error('Categoria de prejuízo indisponível. Tente novamente.');
      if (parsedLost <= 0) throw new Error('Informe a quantidade perdida.');
      if (standaloneUnitCost <= 0) throw new Error('Informe um custo unitário maior que zero.');

      const details = [
        notes?.trim(),
        `Produto ID: ${selectedProduct.id}`,
        selectedProduct.sku ? `SKU: ${selectedProduct.sku}` : null,
        `Quantidade perdida: ${parsedLost}`,
        `Custo unitário: ${formatCurrency(standaloneUnitCost)}`,
      ].filter(Boolean);

      return createExpense({
        amount: standaloneAmount,
        description: `Prejuízo - ${selectedProduct.name}`,
        expense_date: expenseDate,
        notes: details.join(' | '),
        category_id: stockLossCategory.id,
        is_recurring: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-losses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setSuccessMessage('Novo prejuízo cadastrado com sucesso.');
      setSuccessDialog(true);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Falha ao cadastrar o prejuízo.';
      setErrorMessage(message);
      setErrorDialog(true);
    },
  });

  const handleSave = () => {
    if (isStandaloneMode) {
      if (!selectedProduct) {
        setErrorMessage('Selecione um produto para registrar o novo prejuízo.');
        setErrorDialog(true);
        return;
      }
      if (parsedLost <= 0) {
        setErrorMessage('Informe uma quantidade perdida maior que zero.');
        setErrorDialog(true);
        return;
      }
      if (standaloneUnitCost <= 0) {
        setErrorMessage('Informe um custo unitário maior que zero para confirmar o prejuízo.');
        setErrorDialog(true);
        return;
      }
      if (!isValidExpenseDate) {
        setErrorMessage('Informe a data no formato YYYY-MM-DD.');
        setErrorDialog(true);
        return;
      }
      if (!stockLossCategory?.id) {
        setErrorMessage('Categoria de prejuízo indisponível. Aguarde e tente novamente.');
        setErrorDialog(true);
        return;
      }
      setShowConfirmCreate(true);
      return;
    }

    if (!hasDraftContext) {
      setErrorMessage('Não foi possível carregar o contexto deste item. Volte para o envio e tente novamente.');
      setErrorDialog(true);
      return;
    }

    if (!isValid) {
      setErrorMessage('A soma entre comprado, devolvido, danificado e perdido não pode exceder a quantidade enviada.');
      setErrorDialog(true);
      return;
    }

    updateShipmentItem(shipmentId, itemId, {
      quantity_damaged: parsedDamaged,
      quantity_lost: parsedLost,
      notes,
    });

    setSuccessMessage('As quantidades foram registradas no rascunho do envio. Continue para finalizar o processamento.');
    setSuccessDialog(true);
  };

  useFocusEffect(
    useMemo(
      () => () => {
        headerAnim.setValue(0);
        contentAnim.setValue(0);

        Animated.spring(headerAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 120,
          mass: 0.9,
        }).start();

        Animated.spring(contentAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 16,
          stiffness: 110,
          mass: 1,
          delay: 140,
        }).start();
      },
      [contentAnim, headerAnim]
    )
  );

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [{ scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }}
      >
        <PageHeader
          title="Registrar Prejuízo"
          subtitle={hasDraftContext ? productName : 'Novo lançamento avulso'}
          showBackButton
          onBack={() => router.back()}
        />
      </Animated.View>

      <Animated.View
        style={{
          flex: 1,
          opacity: contentAnim,
          transform: [{ translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        }}
      >
        <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {isStandaloneMode && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                    <Ionicons name="search-outline" size={18} color={brandingColors.primary} />
                  </View>
                  <Text style={styles.sectionTitle}>Selecionar Produto</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Buscar por nome ou SKU</Text>
                  <TextInput
                    value={productQuery}
                    onChangeText={setProductQuery}
                    style={styles.input}
                    placeholder="Ex: Camiseta preta P"
                    placeholderTextColor={Colors.light.textTertiary}
                  />
                  {isSearchingProducts ? (
                    <View style={styles.searchLoadingRow}>
                      <ActivityIndicator size="small" color={brandingColors.primary} />
                      <Text style={styles.searchLoadingText}>Buscando produtos...</Text>
                    </View>
                  ) : null}
                </View>

                {filteredProducts.length > 0 && (
                  <View style={styles.productResultsList}>
                    {filteredProducts.map((product) => (
                      <TouchableOpacity
                        key={product.id}
                        style={[
                          styles.productResultItem,
                          selectedProduct?.id === product.id && styles.productResultItemSelected,
                        ]}
                        onPress={() => {
                          setSelectedProduct(product);
                          setProductQuery(product.name);
                          setUnitCostInput(String(product.cost_price ?? ''));
                        }}
                        activeOpacity={0.75}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.productResultName} numberOfLines={1}>{product.name}</Text>
                          <Text style={styles.productResultMeta} numberOfLines={1}>
                            {product.sku ? `SKU ${product.sku}` : `ID ${product.id}`} • Custo {formatCurrency(Number(product.cost_price ?? 0))}
                          </Text>
                        </View>
                        {selectedProduct?.id === product.id ? (
                          <Ionicons name="checkmark-circle" size={20} color={brandingColors.primary} />
                        ) : (
                          <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {selectedProduct && (
                  <View style={styles.selectedProductPill}>
                    <Ionicons name="cube-outline" size={16} color={brandingColors.primary} />
                    <Text style={styles.selectedProductText} numberOfLines={1}>
                      Produto selecionado: {selectedProduct.name}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                  <Ionicons name="cube-outline" size={18} color={brandingColors.primary} />
                </View>
                <Text style={styles.sectionTitle}>Resumo do Item</Text>
              </View>

              {hasDraftContext ? (
                <>
                  <Text style={styles.itemName}>{productName}</Text>
                  {!!variantLabel && <Text style={styles.itemVariant}>{variantLabel}</Text>}

                  <View style={styles.summaryGrid}>
                    {summaryRows.map((row) => (
                      <View key={row.label} style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{row.label}</Text>
                        <Text style={styles.summaryValue}>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={18} color={brandingColors.primary} />
                  <Text style={styles.infoText}>
                    Cadastre um prejuízo direto por produto, sem depender de envio condicional.
                  </Text>
                </View>
              )}
            </View>

            {isStandaloneMode && (
              <View style={styles.validationsRow}>
                <View style={[styles.validationChip, selectedProduct ? styles.validationChipOk : styles.validationChipWarn]}>
                  <Text style={[styles.validationChipText, selectedProduct ? styles.validationChipTextOk : styles.validationChipTextWarn]}>Produto</Text>
                </View>
                <View style={[styles.validationChip, parsedLost > 0 ? styles.validationChipOk : styles.validationChipWarn]}>
                  <Text style={[styles.validationChipText, parsedLost > 0 ? styles.validationChipTextOk : styles.validationChipTextWarn]}>Quantidade</Text>
                </View>
                <View style={[styles.validationChip, standaloneUnitCost > 0 ? styles.validationChipOk : styles.validationChipWarn]}>
                  <Text style={[styles.validationChipText, standaloneUnitCost > 0 ? styles.validationChipTextOk : styles.validationChipTextWarn]}>Custo</Text>
                </View>
                <View style={[styles.validationChip, isValidExpenseDate ? styles.validationChipOk : styles.validationChipWarn]}>
                  <Text style={[styles.validationChipText, isValidExpenseDate ? styles.validationChipTextOk : styles.validationChipTextWarn]}>Data</Text>
                </View>
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: VALUE_COLORS.warning + '15' }]}>
                  <Ionicons name="warning-outline" size={18} color={VALUE_COLORS.warning} />
                </View>
                <Text style={styles.sectionTitle}>Classificação</Text>
              </View>

              {hasDraftContext && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Quantidade danificada</Text>
                  <TextInput
                    value={quantityDamaged}
                    onChangeText={(text) => setQuantityDamaged(text.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={Colors.light.textTertiary}
                  />
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Quantidade perdida</Text>
                <TextInput
                  value={quantityLost}
                  onChangeText={(text) => setQuantityLost(text.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={Colors.light.textTertiary}
                />
              </View>

              {isStandaloneMode && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Custo unitário</Text>
                  <TextInput
                    value={unitCostInput}
                    onChangeText={(text) => setUnitCostInput(text.replace(',', '.').replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor={Colors.light.textTertiary}
                  />
                </View>
              )}

              {isStandaloneMode && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Data do lançamento</Text>
                  <TextInput
                    value={expenseDate}
                    onChangeText={setExpenseDate}
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.light.textTertiary}
                  />
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Observações</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  style={[styles.input, styles.notesInput]}
                  placeholder="Detalhe o motivo, contexto ou responsável"
                  placeholderTextColor={Colors.light.textTertiary}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: VALUE_COLORS.negative + '15' }]}>
                  <Ionicons name="receipt-outline" size={18} color={VALUE_COLORS.negative} />
                </View>
                <Text style={styles.sectionTitle}>Impacto Financeiro</Text>
              </View>

              <View style={styles.impactRow}>
                <Text style={styles.impactLabel}>Custo unitário</Text>
                <Text style={styles.impactValue}>{formatCurrency(hasDraftContext ? unitCost : standaloneUnitCost)}</Text>
              </View>
              <View style={styles.impactRow}>
                <Text style={styles.impactLabel}>Despesa prevista por perda</Text>
                <Text style={[styles.impactValue, styles.impactValueNegative]}>
                  {formatCurrency(hasDraftContext ? lostExpenseAmount : standaloneAmount)}
                </Text>
              </View>
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={brandingColors.primary} />
                <Text style={styles.infoText}>
                  {hasDraftContext
                    ? 'Este lançamento aparecerá no módulo separado de Prejuízos depois que o envio for finalizado.'
                    : 'Este lançamento será criado imediatamente no módulo separado de Prejuízos.'}
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()} activeOpacity={0.75}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, (createStandaloneLossMutation.isPending || (isStandaloneMode && !standaloneReady)) && styles.primaryButtonDisabled]}
                onPress={handleSave}
                activeOpacity={0.8}
                disabled={createStandaloneLossMutation.isPending || (isStandaloneMode && !standaloneReady)}
              >
                <LinearGradient colors={brandingColors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryGradient}>
                  {createStandaloneLossMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="save-outline" size={18} color="#fff" />
                  )}
                  <Text style={styles.primaryButtonText}>{isStandaloneMode ? 'Confirmar Prejuízo' : 'Salvar Registro'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <ConfirmDialog
        visible={showConfirmCreate}
        type="warning"
        title="Confirmar prejuízo"
        message={`Será criado um novo lançamento de ${formatCurrency(standaloneAmount)} para ${selectedProduct?.name || 'produto selecionado'}.`}
        confirmText="Confirmar"
        cancelText="Cancelar"
        loading={createStandaloneLossMutation.isPending}
        onConfirm={() => {
          setShowConfirmCreate(false);
          createStandaloneLossMutation.mutate();
        }}
        onCancel={() => setShowConfirmCreate(false)}
      />

      <ConfirmDialog
        visible={errorDialog}
        type="danger"
        title="Atenção"
        message={errorMessage}
        confirmText="OK"
        onConfirm={() => setErrorDialog(false)}
        onCancel={() => setErrorDialog(false)}
      />

      <ConfirmDialog
        visible={successDialog}
        type="success"
        title="Prejuízo salvo"
        message={successMessage}
        confirmText="Continuar"
        cancelText=""
        onConfirm={() => {
          setSuccessDialog(false);
          router.back();
        }}
        onCancel={() => {
          setSuccessDialog(false);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  section: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
  },
  itemName: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
  },
  itemVariant: {
    marginTop: 4,
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  summaryGrid: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  summaryLabel: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '700',
  },
  fieldGroup: {
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    minHeight: 52,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
  },
  notesInput: {
    minHeight: 96,
    paddingTop: theme.spacing.md,
  },
  impactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  impactLabel: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  impactValue: {
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    fontWeight: '700',
  },
  impactValueNegative: {
    color: VALUE_COLORS.negative,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  infoText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.card,
  },
  secondaryButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  primaryButton: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryGradient: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  primaryButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  searchLoadingRow: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  searchLoadingText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  productResultsList: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    overflow: 'hidden',
  },
  productResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  productResultItemSelected: {
    backgroundColor: Colors.light.primary + '10',
  },
  productResultName: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '700',
  },
  productResultMeta: {
    marginTop: 2,
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  selectedProductPill: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: Colors.light.card,
  },
  selectedProductText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '600',
  },
  validationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  validationChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  validationChipOk: {
    backgroundColor: VALUE_COLORS.positive + '15',
    borderColor: VALUE_COLORS.positive + '40',
  },
  validationChipWarn: {
    backgroundColor: VALUE_COLORS.warning + '12',
    borderColor: VALUE_COLORS.warning + '40',
  },
  validationChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  validationChipTextOk: {
    color: VALUE_COLORS.positive,
  },
  validationChipTextWarn: {
    color: VALUE_COLORS.warning,
  },
});
