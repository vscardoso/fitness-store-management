/**
 * Add Stock — Adicionar estoque a produto existente
 *
 * Tela focada e guiada para quando o usuário seleciona um produto similar
 * durante o scanner/wizard. Evita o formulário completo de entrada (add.tsx)
 * que requer carregar todos os produtos (race condition) e é excessivamente
 * complexo para esse caso de uso.
 *
 * Fluxo: produto confirmado → tipo de entrada → quantidade → custo → confirmar
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProductById } from '@/services/productService';
import { createStockEntry } from '@/services/stockEntryService';
import { formatCurrency } from '@/utils/format';
import { EntryType, StockEntryCreate } from '@/types';

// ─── Tipos de entrada disponíveis nesse fluxo ────────────────────────────────

const ENTRY_TYPES: {
  type: EntryType;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { type: EntryType.LOCAL,       label: 'Compra Local', icon: 'bag-handle-outline' },
  { type: EntryType.ONLINE,      label: 'Online',       icon: 'globe-outline'      },
  { type: EntryType.TRIP,        label: 'Viagem',       icon: 'airplane-outline'   },
  { type: EntryType.ADJUSTMENT,  label: 'Ajuste',       icon: 'construct-outline'  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMoney(raw: string): number {
  const clean = raw.replace(/[^0-9,]/g, '').replace(',', '.');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function formatMoneyInput(raw: string): string {
  // Remove não-numéricos exceto vírgula
  return raw.replace(/[^0-9,]/g, '');
}

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function AddStockScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  const params = useLocalSearchParams<{
    productId: string;
    quantity: string;
    // Dados de exibição imediata (sem esperar fetch)
    productName?: string;
    productSku?: string;
    currentStock?: string;
    costPrice?: string;
  }>();

  const productId = parseInt(params.productId);
  const initialQty = Math.max(1, parseInt(params.quantity || '1'));

  // ── Estado do formulário ──
  const [entryType, setEntryType] = useState<EntryType>(EntryType.LOCAL);
  const [quantity, setQuantity] = useState(initialQty);
  const [costInput, setCostInput] = useState(
    params.costPrice && parseFloat(params.costPrice) > 0
      ? parseFloat(params.costPrice).toFixed(2).replace('.', ',')
      : ''
  );
  const [notes, setNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // ── Produto (fetch em paralelo, exibe dados imediatos dos params) ──
  const { data: product, isLoading: loadingProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProductById(productId),
    enabled: !isNaN(productId),
    staleTime: 30_000,
  });

  // Usar dados do produto ou fallback nos params (para exibição imediata)
  const displayName  = product?.name        ?? params.productName  ?? '—';
  const displaySku   = product?.sku         ?? params.productSku   ?? '';
  const displayStock = product?.current_stock ?? (params.currentStock ? parseInt(params.currentStock) : undefined);
  const displayCost  = product?.cost_price  ?? (params.costPrice ? parseFloat(params.costPrice) : 0);

  // Pre-preencher custo quando produto carrega (se não digitado ainda)
  React.useEffect(() => {
    if (product && !costInput && product.cost_price > 0) {
      setCostInput(product.cost_price.toFixed(2).replace('.', ','));
    }
  }, [product]);

  // ── Mutation ──
  const mutation = useMutation({
    mutationFn: (payload: StockEntryCreate) => createStockEntry(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      setShowSuccess(true);
    },
    onError: (err: any) => {
      // Erro tratado no ConfirmDialog via state
    },
  });

  // ── Animação de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(20);

  useFocusEffect(useCallback(() => {
    headerOpacity.value  = 0;
    headerScale.value    = 0.94;
    contentOpacity.value = 0;
    contentTransY.value  = 20;

    headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
    headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
    const t = setTimeout(() => {
      contentOpacity.value = withTiming(1, { duration: 340 });
      contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
    }, 140);
    return () => clearTimeout(t);
  }, []));

  const headerAnimStyle  = useAnimatedStyle(() => ({ opacity: headerOpacity.value, transform: [{ scale: headerScale.value }] }));
  const contentAnimStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value, transform: [{ translateY: contentTransY.value }] }));

  // ── Ações ──
  const changeQty = (delta: number) => setQuantity(q => Math.max(1, q + delta));

  const handleSubmit = () => {
    if (!productId) return;
    const unitCost = parseMoney(costInput);

    // Gerar código único automático para entradas rápidas via scanner
    const autoCode = `SCN-${Date.now().toString().slice(-8)}`;

    // Data local no formato YYYY-MM-DD (backend espera date, não datetime)
    const today = new Date();
    const entryDateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Nome do fornecedor derivado do tipo selecionado (campo obrigatório no backend)
    const supplierByType: Record<string, string> = {
      local:      'Compra Local',
      online:     'Compra Online',
      trip:       'Viagem',
      adjustment: 'Ajuste Manual',
      initial:    'Estoque Inicial',
      return:     'Devolução',
      donation:   'Doação',
    };

    const payload: StockEntryCreate = {
      entry_code:    autoCode,
      entry_date:    entryDateISO,
      entry_type:    entryType,
      supplier_name: supplierByType[entryType] ?? 'Compra Direta',
      notes:         notes.trim() || undefined,
      items: [{
        product_id:        productId,
        quantity_received: quantity,
        unit_cost:         unitCost,
      }],
    };
    mutation.mutate(payload);
  };

  const handleSuccessConfirm = () => {
    setShowSuccess(false);
    router.back();
  };

  // ── Stock badge ──
  const stockColor =
    displayStock === undefined ? Colors.light.textTertiary :
    displayStock === 0         ? VALUE_COLORS.negative :
    displayStock <= 5          ? VALUE_COLORS.warning  :
    VALUE_COLORS.positive;

  const isSubmitting = mutation.isPending;
  const hasError     = !!mutation.error;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header animado */}
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Adicionar Estoque"
          subtitle="Produto existente"
          showBackButton
          onBack={() => router.back()}
        />
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Card do produto ── */}
          <View style={styles.sectionLabel}>
            <Ionicons name="cube-outline" size={13} color={Colors.light.textTertiary} />
            <Text style={styles.sectionLabelText}>PRODUTO SELECIONADO</Text>
          </View>

          <View style={styles.productCard}>
            {/* Acento esquerdo branding */}
            <View style={[styles.productAccent, { backgroundColor: brandingColors.primary }]} />

            <View style={[styles.productIconBox, { backgroundColor: brandingColors.primary + '15' }]}>
              {loadingProduct
                ? <ActivityIndicator size="small" color={brandingColors.primary} />
                : <Ionicons name="cube-outline" size={24} color={brandingColors.primary} />
              }
            </View>

            <View style={styles.productInfo}>
              <Text style={styles.productName} numberOfLines={2}>{displayName}</Text>
              {displaySku ? (
                <Text style={styles.productSku}>{displaySku}</Text>
              ) : null}
              {displayStock !== undefined && (
                <View style={styles.stockRow}>
                  <Ionicons name="layers-outline" size={13} color={stockColor} />
                  <Text style={[styles.stockText, { color: stockColor }]}>
                    {displayStock === 0 ? 'Sem estoque' : `${displayStock} em estoque`}
                  </Text>
                </View>
              )}
            </View>

            {displayCost > 0 && (
              <View style={styles.costBadge}>
                <Text style={styles.costBadgeLabel}>custo</Text>
                <Text style={styles.costBadgeValue}>{formatCurrency(displayCost)}</Text>
              </View>
            )}
          </View>

          {/* ── Tipo de entrada ── */}
          <View style={[styles.sectionLabel, { marginTop: theme.spacing.lg }]}>
            <Ionicons name="git-branch-outline" size={13} color={Colors.light.textTertiary} />
            <Text style={styles.sectionLabelText}>TIPO DE ENTRADA</Text>
          </View>

          <View style={styles.typeGrid}>
            {ENTRY_TYPES.map(({ type, label, icon }) => {
              const active = entryType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeChip,
                    active && { backgroundColor: brandingColors.primary, borderColor: brandingColors.primary },
                  ]}
                  onPress={() => setEntryType(type)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={icon}
                    size={18}
                    color={active ? '#fff' : Colors.light.textSecondary}
                  />
                  <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Quantidade ── */}
          <View style={[styles.sectionLabel, { marginTop: theme.spacing.lg }]}>
            <Ionicons name="layers-outline" size={13} color={Colors.light.textTertiary} />
            <Text style={styles.sectionLabelText}>QUANTIDADE</Text>
          </View>

          <View style={styles.qtyCard}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => changeQty(-1)}
              disabled={quantity <= 1}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="remove"
                size={22}
                color={quantity <= 1 ? Colors.light.border : brandingColors.primary}
              />
            </TouchableOpacity>

            <View style={styles.qtyCenter}>
              <Text style={[styles.qtyValue, { color: brandingColors.primary }]}>
                {quantity}
              </Text>
              <Text style={styles.qtyUnit}>unidades</Text>
            </View>

            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => changeQty(1)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={22} color={brandingColors.primary} />
            </TouchableOpacity>
          </View>

          {/* ── Custo unitário (opcional) ── */}
          <View style={[styles.sectionLabel, { marginTop: theme.spacing.lg }]}>
            <Ionicons name="cash-outline" size={13} color={Colors.light.textTertiary} />
            <Text style={styles.sectionLabelText}>CUSTO UNITÁRIO  <Text style={styles.optional}>(opcional)</Text></Text>
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.currencyPrefix}>R$</Text>
            <TextInput
              style={styles.moneyInput}
              value={costInput}
              onChangeText={v => setCostInput(formatMoneyInput(v))}
              placeholder="0,00"
              placeholderTextColor={Colors.light.textTertiary}
              keyboardType="numeric"
              selectTextOnFocus
            />
          </View>

          {/* ── Observações (opcional) ── */}
          <View style={[styles.sectionLabel, { marginTop: theme.spacing.lg }]}>
            <Ionicons name="document-text-outline" size={13} color={Colors.light.textTertiary} />
            <Text style={styles.sectionLabelText}>OBSERVAÇÕES  <Text style={styles.optional}>(opcional)</Text></Text>
          </View>

          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex: Reposição após promoção, lote especial..."
            placeholderTextColor={Colors.light.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* ── Erro ── */}
          {hasError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={VALUE_COLORS.negative} />
              <Text style={styles.errorText}>
                {(mutation.error as any)?.message || 'Erro ao registrar entrada. Tente novamente.'}
              </Text>
            </View>
          )}

          {/* Espaço para o botão fixo */}
          <View style={{ height: 80 }} />
        </ScrollView>
      </Animated.View>

      {/* ── Botão fixo no rodapé ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={[styles.submitBtn, isSubmitting && { opacity: 0.65 }]}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={brandingColors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.submitText}>
                  Registrar {quantity} {quantity === 1 ? 'unidade' : 'unidades'}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Diálogo de sucesso ── */}
      <ConfirmDialog
        visible={showSuccess}
        title="Estoque registrado!"
        message={`${quantity} ${quantity === 1 ? 'unidade adicionada' : 'unidades adicionadas'} ao estoque de "${displayName}".`}
        confirmText="Concluir"
        cancelText=""
        onConfirm={handleSuccessConfirm}
        onCancel={handleSuccessConfirm}
        type="success"
        icon="checkmark-circle"
      />
    </KeyboardAvoidingView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },

  // ── Seção label ──
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  sectionLabelText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  optional: {
    fontSize: theme.fontSize.xxs,
    fontWeight: theme.fontWeight.normal,
    color: Colors.light.textTertiary,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // ── Produto ──
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
    overflow: 'hidden',
  },
  productAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderBottomLeftRadius: theme.borderRadius.xl,
  },
  productIconBox: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  productInfo: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  productName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
    lineHeight: 22,
  },
  productSku: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
    fontFamily: 'monospace',
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  stockText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  costBadge: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  costBadgeLabel: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  costBadgeValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
  },

  // ── Tipo ──
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.card,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    minHeight: 44,
  },
  typeChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
  },
  typeChipTextActive: {
    color: '#fff',
  },

  // ── Quantidade ──
  qtyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyCenter: {
    alignItems: 'center',
    gap: 2,
  },
  qtyValue: {
    fontSize: 36,
    fontWeight: theme.fontWeight.extrabold,
    letterSpacing: -1,
    lineHeight: 40,
  },
  qtyUnit: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },

  // ── Custo ──
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    height: 52,
    gap: 8,
    ...theme.shadows.sm,
  },
  currencyPrefix: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
  },
  moneyInput: {
    flex: 1,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
    paddingVertical: 0,
  },

  // ── Notas ──
  notesInput: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    minHeight: 80,
    ...theme.shadows.sm,
  },

  // ── Erro ──
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: VALUE_COLORS.negative + '10',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: VALUE_COLORS.negative + '30',
    marginTop: theme.spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: VALUE_COLORS.negative,
    lineHeight: 18,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    paddingTop: theme.spacing.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  submitBtn: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  submitText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: '#fff',
    letterSpacing: 0.2,
  },
});
