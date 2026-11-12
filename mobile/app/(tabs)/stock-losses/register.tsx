/**
 * Registrar prejuízo. Dois caminhos na mesma tela, cada um com o mínimo de campos:
 *  - Avulso (sem envio): 1. Qual peça? (busca e escolha)  2. O que se perdeu (peças, custo de cada uma, dia)  3. Observação (recolhida).
 *  - Dentro de um envio condicional: resumo do item (enviadas, compradas, devolvidas) e as quantidades danificadas e perdidas.
 * O rodapé fixo mostra o valor da perda enquanto se digita, o que ainda falta para confirmar e o botão principal.
 */
import { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { FormFooter, FormSection, MoreOptions } from '@/components/expenses/FormParts';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { getExpenseCategories, createExpense } from '@/services/expenseService';
import { searchProducts } from '@/services/productService';
import { useConditionalProcessingStore } from '@/store/conditionalProcessingStore';
import { useBrandingColors } from '@/store/brandingStore';
import type { Product } from '@/types';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { dateToIso, isoToDate } from '@/utils/dateBr';

export default function StockLossRegisterScreen() {
  const desktopContent = useDesktopContentStyle();
  const router = useRouter();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();
  const styles = useMemo(() => createStyles(brandingColors.primary), [brandingColors.primary]);
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
  const [notesOpen, setNotesOpen] = useState(!!draftItem?.notes);

  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [unitCostInput, setUnitCostInput] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [errorDialog, setErrorDialog] = useState(false);
  const [successDialog, setSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showConfirmCreate, setShowConfirmCreate] = useState(false);

  const quantityKept = draftItem?.quantity_kept || 0;
  const quantityReturned = draftItem?.quantity_returned || 0;

  const parsedDamaged = Math.max(0, parseInt(quantityDamaged) || 0);
  const parsedLost = Math.max(0, parseInt(quantityLost) || 0);
  const totalAllocated = quantityKept + quantityReturned + parsedDamaged + parsedLost;
  const remainingToAllocate = Math.max(0, quantitySent - quantityKept - quantityReturned);

  const hasDraftContext = shipmentId > 0 && itemId > 0 && !!draftItem;

  // Esta tela fica em outra aba: router.back() saía da aba e caía na Início, longe do envio em processamento
  const leave = () => {
    if (shipmentId > 0) router.replace(`/(tabs)/conditional/${shipmentId}` as any);
    else router.back();
  };
  const isStandaloneMode = !hasDraftContext;
  const isValid = shipmentId > 0 && itemId > 0 && totalAllocated <= quantitySent;
  const isValidExpenseDate = /^\d{4}-\d{2}-\d{2}$/.test(expenseDate);

  // no envio condicional a peça danificada também não volta ao estoque: o custo dela vira despesa, como a perdida
  const lostExpenseAmount = (parsedDamaged + parsedLost) * unitCost;
  const standaloneUnitCost = Number(unitCostInput || selectedProduct?.cost_price || 0);
  const standaloneAmount = parsedLost * standaloneUnitCost;
  const standaloneReady = Boolean(selectedProduct) && parsedLost > 0 && standaloneUnitCost > 0 && isValidExpenseDate;

  // o que ainda falta para confirmar (avulso)
  const missing = [
    !selectedProduct ? 'a peça' : null,
    parsedLost <= 0 ? 'quantas peças se perderam' : null,
    standaloneUnitCost <= 0 ? 'o custo de cada peça' : null,
    !isValidExpenseDate ? 'o dia' : null,
  ].filter(Boolean) as string[];

  const summaryRows = useMemo(
    () => [
      { label: 'Enviadas', value: `${quantitySent} un` },
      { label: 'Compradas', value: `${quantityKept} un` },
      { label: 'Devolvidas', value: `${quantityReturned} un` },
      { label: 'Podem virar prejuízo', value: `${remainingToAllocate} un` },
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

  const notesField = (
    <TextInput
      value={notes}
      onChangeText={setNotes}
      style={[styles.input, styles.notesInput]}
      placeholder="Detalhe o motivo, o contexto ou quem foi o responsável"
      placeholderTextColor={Colors.light.textTertiary}
      multiline
      textAlignVertical="top"
    />
  );

  const footerSummary = hasDraftContext
    ? `Despesa prevista: ${formatCurrency(lostExpenseAmount)} (danificadas e perdidas). Aparece em Prejuízos quando o envio for finalizado.`
    : `Perda de ${formatCurrency(standaloneAmount)}${selectedProduct ? ` · ${selectedProduct.name}` : ''}`;

  return (
    <View style={styles.container}>
      <PageHeader
        title="Registrar Prejuízo"
        subtitle={hasDraftContext ? productName : 'Peça perdida ou estragada'}
        showBackButton
        onBack={() => leave()}
      />

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, desktopContent]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {isStandaloneMode ? (
            <>
              <FormSection title="Qual peça?" subtitle="Busque pelo nome ou pelo SKU">
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

                {filteredProducts.length > 0 && (
                  <View style={styles.productResultsList}>
                    {filteredProducts.map((product) => (
                      <TouchableOpacity
                        key={product.id}
                        style={[styles.productResultItem, selectedProduct?.id === product.id && styles.productResultItemSelected]}
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
                    <Text style={styles.selectedProductText} numberOfLines={1}>Peça escolhida: {selectedProduct.name}</Text>
                  </View>
                )}
              </FormSection>

              <FormSection title="O que se perdeu">
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
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Custo de cada peça</Text>
                  <View style={styles.moneyField}>
                    <Text style={styles.moneyPrefix}>R$</Text>
                    <TextInput
                      value={unitCostInput}
                      onChangeText={(text) => setUnitCostInput(text.replace(',', '.').replace(/[^0-9.]/g, ''))}
                      keyboardType="decimal-pad"
                      style={styles.moneyInput}
                      placeholder="0.00"
                      placeholderTextColor={Colors.light.textTertiary}
                    />
                  </View>
                </View>
                <DateTimeInput
                  label="Dia da perda"
                  value={isValidExpenseDate ? isoToDate(expenseDate) : undefined}
                  onChange={(d) => d && setExpenseDate(dateToIso(d))}
                  mode="date"
                  maximumDate={new Date()}
                />
              </FormSection>

              <MoreOptions
                title="Observação"
                filled={notes.trim() || 'motivo, contexto ou responsável'}
                open={notesOpen}
                onToggle={() => setNotesOpen((v) => !v)}
              >
                {notesField}
              </MoreOptions>
            </>
          ) : (
            <>
              <FormSection title={productName} subtitle={variantLabel || undefined}>
                <View style={styles.summaryGrid}>
                  {summaryRows.map((row) => (
                    <View key={row.label} style={styles.summaryCell}>
                      <Text style={styles.summaryValue}>{row.value}</Text>
                      <Text style={styles.summaryLabel}>{row.label}</Text>
                    </View>
                  ))}
                </View>
              </FormSection>

              <FormSection title="O que se perdeu" subtitle="Peça danificada ou perdida não volta ao estoque: o custo dela vira prejuízo">
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
                {totalAllocated > quantitySent && (
                  <Text style={styles.warnText}>A soma de compradas, devolvidas, danificadas e perdidas passa do que foi enviado ({quantitySent} un).</Text>
                )}
              </FormSection>

              <MoreOptions
                title="Observação"
                filled={notes.trim() || 'motivo, contexto ou responsável'}
                open={notesOpen}
                onToggle={() => setNotesOpen((v) => !v)}
              >
                {notesField}
              </MoreOptions>
            </>
          )}
        </ScrollView>

        <FormFooter
          summary={footerSummary}
          hint={isStandaloneMode && missing.length > 0 ? `Falta informar: ${missing.join(', ')}.` : undefined}
          primaryLabel={isStandaloneMode ? 'Confirmar Prejuízo' : 'Salvar Registro'}
          primaryIcon="save-outline"
          onPrimary={handleSave}
          disabled={isStandaloneMode && !standaloneReady}
          loading={createStandaloneLossMutation.isPending}
          onSecondary={() => leave()}
        />
      </KeyboardAvoidingView>

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
          leave();
        }}
        onCancel={() => {
          setSuccessDialog(false);
          leave();
        }}
      />
    </View>
  );
}

const createStyles = (brand: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  keyboardView: { flex: 1 },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  summaryCell: {
    flexGrow: 1, flexBasis: 120, backgroundColor: Colors.light.backgroundSecondary, borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: Colors.light.border, padding: theme.spacing.sm, gap: 2,
  },
  summaryValue: { fontSize: theme.fontSize.lg, color: Colors.light.text, fontWeight: theme.fontWeight.bold },
  summaryLabel: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary },
  input: {
    backgroundColor: Colors.light.backgroundSecondary, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md, minHeight: 52, fontSize: theme.fontSize.base, color: Colors.light.text,
  },
  notesInput: { minHeight: 96, paddingTop: theme.spacing.md },
  moneyField: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.backgroundSecondary, borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: theme.spacing.md, minHeight: 52, gap: theme.spacing.sm,
  },
  moneyPrefix: { fontSize: theme.fontSize.base, color: Colors.light.textSecondary, fontWeight: theme.fontWeight.semibold },
  moneyInput: { flex: 1, fontSize: theme.fontSize.base, color: Colors.light.text, minHeight: 50 },
  warnText: { fontSize: theme.fontSize.sm, color: Colors.light.error, fontWeight: theme.fontWeight.semibold },
  searchLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  searchLoadingText: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  productResultsList: {
    borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.backgroundSecondary,
    overflow: 'hidden',
  },
  productResultItem: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.light.border,
  },
  productResultItemSelected: { backgroundColor: brand + '10' },
  productResultName: { fontSize: theme.fontSize.md, color: Colors.light.text, fontWeight: theme.fontWeight.bold },
  productResultMeta: { marginTop: 2, fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  selectedProductPill: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, borderRadius: theme.borderRadius.lg, borderWidth: 1,
    borderColor: Colors.light.border, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, backgroundColor: Colors.light.card,
  },
  selectedProductText: { flex: 1, fontSize: theme.fontSize.md, color: Colors.light.text, fontWeight: theme.fontWeight.semibold },
});
