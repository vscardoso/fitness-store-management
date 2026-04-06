import { useLocalSearchParams } from 'expo-router';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Text,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, useCallback } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import PageHeader from '@/components/layout/PageHeader';
import useBackToList from '@/hooks/useBackToList';
import { getSaleById } from '@/services/saleService';
import { getReturnHistory } from '@/services/returnService';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { SaleReturn } from '@/services/returnService';
import { Colors, VALUE_COLORS, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useAuthStore } from '@/store/authStore';
import SaleReceipt from '@/components/receipt/SaleReceipt';
import ReturnModal from '@/components/sale/ReturnModal';
import AppButton from '@/components/ui/AppButton';
import type { SaleWithDetails } from '@/types';

const statusMap: Record<string, { label: string; color: string; solid?: boolean; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:            { label: 'Pendente',     color: '#F59E0B', icon: 'time-outline' },
  completed:          { label: 'Concluída',    color: VALUE_COLORS.positive, solid: true, icon: 'checkmark-circle' },
  cancelled:          { label: 'Cancelada',    color: VALUE_COLORS.negative, icon: 'close-circle' },
  partially_refunded: { label: 'Dev. Parcial', color: '#F59E0B', icon: 'refresh-circle' },
  refunded:           { label: 'Devolvida',    color: '#7B1FA2', solid: true, icon: 'arrow-undo-circle' },
};

const paymentLabel: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Crédito',
  debit_card: 'Débito',
  pix: 'Pix',
  bank_transfer: 'Transferência',
  installments: 'Parcelado',
  loyalty_points: 'Pontos de Fidelidade',
};

const paymentIcon: Record<string, string> = {
  cash: 'cash',
  credit_card: 'card',
  debit_card: 'card',
  pix: 'qr-code-outline',
  bank_transfer: 'swap-horizontal',
  installments: 'card',
  loyalty_points: 'star-outline',
};

export default function SaleDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const saleId = Number(id);
  const { goBack } = useBackToList('/(tabs)/sales');
  const receiptRef = useRef<View>(null);
  const { user } = useAuthStore();
  const brandingColors = useBrandingColors();
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const animated = useRef(false);

  // ── Animação de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  const { data: sale, isLoading, isError, refetch } = useQuery<SaleWithDetails>({
    queryKey: ['sale', saleId],
    queryFn: () => getSaleById(saleId),
  });

  const { data: returns = [], refetch: refetchReturns } = useQuery<SaleReturn[]>({
    queryKey: ['returns', saleId],
    queryFn: () => getReturnHistory(saleId),
    enabled: !!saleId,
  });

  // Dispara animação de entrada quando dados carregam
  const animateIn = useCallback(() => {
    headerOpacity.value  = 0;
    headerScale.value    = 0.94;
    contentOpacity.value = 0;
    contentTransY.value  = 24;
    headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
    headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
    const t = setTimeout(() => {
      contentOpacity.value = withTiming(1, { duration: 340 });
      contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
    }, 140);
    return t;
  }, []);

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const handleReturnSuccess = useCallback(() => {
    refetch();
    refetchReturns();
  }, [refetch, refetchReturns]);

  const handleShareReceipt = async () => {
    if (!sale || !receiptRef.current) return;
    try {
      const uri = await captureRef(receiptRef, { format: 'png', quality: 1 });
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Erro', 'Compartilhamento não disponível neste dispositivo');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Recibo - ${sale.sale_number}`,
      });
    } catch {
      Alert.alert('Erro', 'Não foi possível compartilhar o recibo');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Venda" showBackButton onBack={goBack} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
          <Text style={styles.loadingText}>Carregando venda...</Text>
        </View>
      </View>
    );
  }

  if (isError || !sale) {
    return (
      <View style={styles.container}>
        <PageHeader title="Venda" showBackButton onBack={goBack} />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#999" />
          <Text style={styles.errorTitle}>Erro ao carregar venda</Text>
          <Text style={styles.errorSubtitle}>Toque para tentar novamente</Text>
          <AppButton
            variant="primary"
            size="lg"
            icon="refresh-outline"
            label="Tentar novamente"
            onPress={() => refetch()}
            style={styles.retryButton}
          />
        </View>
      </View>
    );
  }

  const statusStyle = statusMap[sale.status] || statusMap.pending;
  const formattedDateTime = formatDateTime(sale.created_at);
  const [datePart, timePart] = formattedDateTime.split(' ');
  const hasDiscount = Number(sale.discount_amount) > 0;
  const hasTax = Number(sale.tax_amount) > 0;

  const daysSinceSale = Math.floor(
    (Date.now() - new Date(sale.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  const isWithinReturnWindow = daysSinceSale < 7;

  // Dispara animação uma vez após dados disponíveis
  if (!animated.current) {
    animated.current = true;
    animateIn();
  }

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title={sale.sale_number}
          subtitle={`${datePart} · ${timePart}`}
          showBackButton
          onBack={goBack}
          rightActions={[{ icon: 'share-outline', onPress: handleShareReceipt }]}
        >
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.solid ? statusStyle.color : statusStyle.color + '18' }]}>
            <Ionicons name={statusStyle.icon} size={13} color={statusStyle.solid ? '#fff' : statusStyle.color} />
            <Text style={[styles.statusText, { color: statusStyle.solid ? '#fff' : statusStyle.color }]}>{statusStyle.label}</Text>
          </View>
        </PageHeader>
      </Animated.View>

      <Animated.ScrollView contentContainerStyle={styles.scrollContent} style={contentAnimStyle}>

        {/* ── HERO: Total + Formas de pagamento ─────────────────── */}
        <LinearGradient
          colors={brandingColors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroLabel}>TOTAL DA VENDA</Text>
          <Text style={styles.heroAmount}>{formatCurrency(sale.total_amount)}</Text>
          <Text style={styles.heroItems}>
            {sale.items.length} {sale.items.length === 1 ? 'produto' : 'produtos'}
          </Text>

        </LinearGradient>

        {/* ── FORMAS DE PAGAMENTO ────────────────────────────────── */}
        {sale.payments.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="wallet-outline" size={17} color={Colors.light.primary} />
              <Text style={styles.sectionTitle}>
                {sale.payments.length === 1 ? 'Pagamento' : 'Pagamentos'}
              </Text>
            </View>
            {sale.payments.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <View style={styles.itemDivider} />}
                <View style={styles.paymentRow}>
                  <View style={styles.paymentIconWrap}>
                    <Ionicons name={(paymentIcon[p.method] ?? 'cash') as any} size={18} color={Colors.light.primary} />
                  </View>
                  <View style={styles.paymentMethodInfo}>
                    <Text style={styles.paymentMethodLabel}>{paymentLabel[p.method] || p.method}</Text>
                    {p.method === 'credit_card' && (p.installments ?? 1) > 1 && (
                      <Text style={styles.paymentInstallments}>
                        {p.installments}x de {formatCurrency(p.amount / (p.installments ?? 1))}
                      </Text>
                    )}
                    {p.method === 'credit_card' && (p.installments ?? 1) === 1 && (
                      <Text style={styles.paymentInstallments}>À vista</Text>
                    )}
                  </View>
                  <Text style={styles.paymentMethodAmount}>{formatCurrency(p.amount)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── RENTABILIDADE (FIFO) — só exibe quando disponível ── */}
        {sale.total_profit != null && (
          <View style={styles.profitCard}>
            <Ionicons name="trending-up" size={16} color={VALUE_COLORS.positive} />
            <Text style={styles.profitTitle}>Rentabilidade</Text>
            <View style={styles.profitSep} />
            <View style={styles.profitCol}>
              <Text style={styles.profitLbl}>Custo</Text>
              <Text style={[styles.profitVal, { color: VALUE_COLORS.negative }]}>{formatCurrency(sale.total_cost || 0)}</Text>
            </View>
            <View style={styles.profitSep} />
            <View style={styles.profitCol}>
              <Text style={styles.profitLbl}>Lucro</Text>
              <Text style={[styles.profitVal, { color: (sale.total_profit ?? 0) >= 0 ? VALUE_COLORS.positive : VALUE_COLORS.negative }]}>
                {formatCurrency(sale.total_profit ?? 0)}
              </Text>
            </View>
            <View style={styles.profitSep} />
            <View style={styles.profitCol}>
              <Text style={styles.profitLbl}>Margem</Text>
              <Text style={[styles.profitVal, { color: (sale.profit_margin_percent ?? 0) >= 0 ? VALUE_COLORS.positive : VALUE_COLORS.negative }]}>
                {(sale.profit_margin_percent ?? 0).toFixed(1)}%
              </Text>
            </View>
          </View>
        )}

        {/* ── ITENS + TOTAIS (card unificado) ──────────────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list-outline" size={17} color={Colors.light.primary} />
            <Text style={styles.sectionTitle}>
              Itens ({sale.items.length})
            </Text>
          </View>

          {sale.items.map((item, index) => {
            const itemSubtotal = Number(item.subtotal);
            const saleSubtotal = Number(sale.subtotal);
            const saleDiscount = Number(sale.discount_amount);
            const discountShare = hasDiscount && saleSubtotal > 0
              ? saleDiscount * (itemSubtotal / saleSubtotal)
              : 0;
            const effectiveSubtotal = itemSubtotal - discountShare;
            const hasMargin = item.margin_percent != null;

            return (
              <View key={item.id}>
                {index > 0 && <View style={styles.itemDivider} />}
                <View style={styles.itemRow}>
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {item.product?.name || `Produto ${item.product_id}`}
                    </Text>
                    <Text style={styles.itemQtyPrice}>
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </Text>
                  </View>
                  <View style={styles.itemRight}>
                    {discountShare > 0 && (
                      <Text style={styles.itemStrike}>{formatCurrency(itemSubtotal)}</Text>
                    )}
                    <Text style={styles.itemSubtotal}>
                      {formatCurrency(discountShare > 0 ? effectiveSubtotal : itemSubtotal)}
                    </Text>
                    {hasMargin && (
                      <View style={[
                        styles.marginBadge,
                        { backgroundColor: (item.margin_percent ?? 0) >= 30 ? '#E8F5E9' : '#FFF3E0' },
                      ]}>
                        <Text style={[
                          styles.marginBadgeText,
                          { color: (item.margin_percent ?? 0) >= 30 ? '#2E7D32' : '#F57C00' },
                        ]}>
                          {(item.margin_percent ?? 0).toFixed(0)}%
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}

          {/* Rodapé de totais — única fonte de verdade */}
          <View style={styles.totalsFooter}>
            {(hasDiscount || hasTax) && (
              <View style={styles.totalLine}>
                <Text style={styles.totalLineLabel}>Subtotal</Text>
                <Text style={styles.totalLineValue}>{formatCurrency(sale.subtotal)}</Text>
              </View>
            )}
            {hasDiscount && (
              <View style={styles.totalLine}>
                <Text style={[styles.totalLineLabel, { color: '#F57C00' }]}>Desconto</Text>
                <Text style={[styles.totalLineValue, { color: '#F57C00' }]}>
                  -{formatCurrency(sale.discount_amount)}
                </Text>
              </View>
            )}
            {hasTax && (
              <View style={styles.totalLine}>
                <Text style={styles.totalLineLabel}>Impostos</Text>
                <Text style={styles.totalLineValue}>{formatCurrency(sale.tax_amount)}</Text>
              </View>
            )}
            <View style={styles.grandTotalLine}>
              <Text style={styles.grandTotalLabel}>TOTAL</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(sale.total_amount)}</Text>
            </View>
            {sale.payments.length > 0 && (
              <Text style={styles.paymentMethodText}>
                {sale.payments.map(p => {
                  const label = paymentLabel[p.method] || p.method;
                  const inst = p.installments ?? 1;
                  const instSuffix = p.method === 'credit_card'
                    ? inst > 1
                      ? ` ${inst}x de ${formatCurrency(p.amount / inst)}`
                      : ' (à vista)'
                    : '';
                  return sale.payments.length > 1
                    ? `${label}${instSuffix} ${formatCurrency(p.amount)}`
                    : `${label}${instSuffix}`;
                }).join(' · ')}
              </Text>
            )}
          </View>
        </View>

        {/* ── CLIENTE & VENDEDOR ────────────────────────────────── */}
        {(sale.customer_id || sale.seller_name || sale.seller_id) && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people-outline" size={17} color={Colors.light.primary} />
              <Text style={styles.sectionTitle}>Envolvidos</Text>
            </View>

            {sale.customer_id && (
              <View style={styles.personRow}>
                <View style={styles.personAvatar}>
                  <Ionicons name="person" size={17} color={Colors.light.primary} />
                </View>
                <View style={styles.personInfo}>
                  <Text style={styles.personLabel}>CLIENTE</Text>
                  <Text style={styles.personName}>{sale.customer_name || '—'}</Text>
                </View>
              </View>
            )}

            {(sale.seller_name || sale.seller_id) && (
              <View style={[styles.personRow, sale.customer_id ? styles.personRowSpacing : {}]}>
                <View style={[styles.personAvatar, { backgroundColor: `${Colors.light.success}15` }]}>
                  <Ionicons name="briefcase" size={17} color={Colors.light.success} />
                </View>
                <View style={styles.personInfo}>
                  <Text style={styles.personLabel}>VENDEDOR</Text>
                  <Text style={styles.personName}>
                    {sale.seller_name || `#${sale.seller_id}`}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── OBSERVAÇÕES ───────────────────────────────────────── */}
        {sale.notes && (
          <View style={styles.notesCard}>
            <Ionicons name="document-text-outline" size={16} color={Colors.light.info} />
            <Text style={styles.notesText}>{sale.notes}</Text>
          </View>
        )}

        {/* ── DEVOLUÇÕES ────────────────────────────────────────── */}
        {returns.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="refresh-outline" size={17} color={Colors.light.error} />
              <Text style={[styles.sectionTitle, { color: Colors.light.error }]}>
                Devoluções ({returns.length})
              </Text>
            </View>

            {returns.map((ret, i) => (
              <View key={ret.id}>
                {i > 0 && <View style={[styles.itemDivider, { marginVertical: 14 }]} />}
                <View style={styles.returnMeta}>
                  <Text style={styles.returnNumber}>{ret.return_number}</Text>
                  <Text style={styles.returnDate}>{formatDateTime(ret.created_at)}</Text>
                </View>
                {ret.items.map((item, idx) => (
                  <View key={idx} style={styles.returnItem}>
                    <Text style={styles.returnItemName} numberOfLines={1}>{item.product_name}</Text>
                    <Text style={styles.returnItemQty}>×{item.quantity_returned}</Text>
                    <Text style={styles.returnItemVal}>{formatCurrency(item.refund_amount)}</Text>
                  </View>
                ))}
                <View style={styles.returnTotal}>
                  <Text style={styles.returnTotalLabel}>Reembolso</Text>
                  <Text style={styles.returnTotalValue}>{formatCurrency(ret.total_refund)}</Text>
                </View>
                {ret.reason && (
                  <Text style={styles.returnReason}>Motivo: {ret.reason}</Text>
                )}
              </View>
            ))}

            {returns.length > 1 && (
              <View style={styles.returnGrandTotal}>
                <Text style={styles.returnGrandTotalLabel}>Total Devolvido</Text>
                <Text style={styles.returnGrandTotalValue}>
                  {formatCurrency(returns.reduce((s, r) => s + r.total_refund, 0))}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── BOTÃO DEVOLUÇÃO ───────────────────────────────────── */}
        {(sale.status === 'completed' || sale.status === 'partially_refunded') && isWithinReturnWindow && (
          <View style={styles.returnSection}>
            <AppButton
              variant="danger-outline"
              size="lg"
              fullWidth
              icon="refresh-outline"
              label={sale.status === 'partially_refunded' ? 'Nova Devolução' : 'Realizar Devolução'}
              onPress={() => setReturnModalVisible(true)}
              style={styles.returnButton}
            />
            <Text style={styles.returnInfoText}>Prazo de até 7 dias após a venda</Text>
          </View>
        )}
      </Animated.ScrollView>

      {/* Recibo invisível — apenas para captura e compartilhamento */}
      <View style={styles.hiddenReceipt} pointerEvents="none">
        <SaleReceipt ref={receiptRef} sale={sale} storeName={user?.store_name} />
      </View>

      <ReturnModal
        visible={returnModalVisible}
        saleId={saleId}
        saleNumber={sale.sale_number}
        onDismiss={() => setReturnModalVisible(false)}
        onSuccess={handleReturnSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg, gap: theme.spacing.md },
  loadingText: { color: Colors.light.textSecondary, fontSize: theme.fontSize.sm },
  errorTitle: { fontSize: theme.fontSize.lg, fontWeight: '700', color: Colors.light.text, marginTop: theme.spacing.sm },
  errorSubtitle: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  retryButton: {
    marginTop: theme.spacing.sm,
    width: '100%',
    maxWidth: 260,
  },

  // Header status badge
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.borderRadius.sm,
  },
  statusText: { fontSize: theme.fontSize.xxs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  scrollContent: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },

  // ── Hero ──────────────────────────────────────────────────
  heroCard: {
    borderRadius: theme.borderRadius.xxl, padding: theme.spacing.lg, marginBottom: theme.spacing.sm,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  heroLabel: {
    fontSize: theme.fontSize.xxs, fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
  },
  heroAmount: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  heroItems: { fontSize: theme.fontSize.xs, color: 'rgba(255,255,255,0.65)', marginTop: 4 },

  // ── Rentabilidade ─────────────────────────────────────────
  profitCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.sm + 6, marginBottom: theme.spacing.sm, gap: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  profitTitle: { fontSize: theme.fontSize.xs, fontWeight: '700', color: VALUE_COLORS.positive, flex: 1 },
  profitSep: { width: 1, height: 24, backgroundColor: Colors.light.border },
  profitCol: { alignItems: 'center', flex: 1 },
  profitLbl: {
    fontSize: theme.fontSize.xxs, color: Colors.light.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },
  profitVal: { fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.text },

  // ── Card genérico ─────────────────────────────────────────
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl, padding: theme.spacing.md, marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm + 2 },
  sectionTitle: { fontSize: theme.fontSize.base, fontWeight: '700', color: Colors.light.text },

  // ── Itens ─────────────────────────────────────────────────
  itemDivider: { height: 1, backgroundColor: Colors.light.border, marginVertical: theme.spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  itemLeft: { flex: 1, minWidth: 0, paddingRight: theme.spacing.sm },
  itemName: { fontSize: theme.fontSize.sm, fontWeight: '600', color: Colors.light.text, marginBottom: 3 },
  itemQtyPrice: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  itemRight: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  itemStrike: { fontSize: theme.fontSize.xxs + 1, color: Colors.light.textTertiary, textDecorationLine: 'line-through' },
  itemSubtotal: { fontSize: theme.fontSize.base - 1, fontWeight: '700', color: Colors.light.text },
  marginBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.borderRadius.sm },
  marginBadgeText: { fontSize: theme.fontSize.xxs + 1, fontWeight: '700' },

  // ── Formas de pagamento ───────────────────────────────────
  paymentRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 4,
  },
  paymentIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center', alignItems: 'center',
  },
  paymentMethodInfo: { flex: 1 },
  paymentMethodLabel: { fontSize: theme.fontSize.base - 1, fontWeight: '600', color: Colors.light.text },
  paymentInstallments: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: 1 },
  paymentMethodAmount: { fontSize: theme.fontSize.base - 1, fontWeight: '700', color: VALUE_COLORS.positive, flexShrink: 0 },

  // ── Rodapé de totais ──────────────────────────────────────
  totalsFooter: {
    marginTop: theme.spacing.sm, paddingTop: theme.spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.light.border, gap: theme.spacing.sm,
  },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLineLabel: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  totalLineValue: { fontSize: theme.fontSize.sm, fontWeight: '600', color: Colors.light.text },
  grandTotalLine: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: Colors.light.border, marginTop: 2,
  },
  grandTotalLabel: {
    fontSize: theme.fontSize.sm, fontWeight: '800', color: Colors.light.text,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  grandTotalValue: { fontSize: 22, fontWeight: '800' },
  paymentMethodLine: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: theme.spacing.sm,
  },
  paymentMethodText: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },

  // ── Envolvidos ────────────────────────────────────────────
  personRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  personRowSpacing: { marginTop: theme.spacing.sm },
  personAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center', alignItems: 'center',
  },
  personInfo: { flex: 1 },
  personLabel: {
    fontSize: theme.fontSize.xxs, color: Colors.light.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2,
  },
  personName: { fontSize: theme.fontSize.base - 1, fontWeight: '600', color: Colors.light.text },

  // ── Notas ─────────────────────────────────────────────────
  notesCard: {
    flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg, padding: theme.spacing.sm + 2, marginBottom: theme.spacing.sm,
    borderLeftWidth: 3, borderLeftColor: Colors.light.info,
    borderWidth: 1, borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  notesText: { flex: 1, fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, lineHeight: 20 },

  // ── Devoluções ────────────────────────────────────────────
  returnMeta: { marginBottom: theme.spacing.sm },
  returnNumber: { fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.text },
  returnDate: { fontSize: theme.fontSize.xxs + 1, color: Colors.light.textSecondary, marginTop: 1 },
  returnItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  returnItemName: { flex: 1, minWidth: 0, fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  returnItemQty: { fontSize: theme.fontSize.xs, color: Colors.light.textTertiary, marginHorizontal: theme.spacing.sm },
  returnItemVal: { fontSize: theme.fontSize.sm, fontWeight: '600', color: VALUE_COLORS.negative, flexShrink: 0 },
  returnTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: theme.spacing.sm, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  returnTotalLabel: { fontSize: theme.fontSize.sm, fontWeight: '600', color: Colors.light.textSecondary },
  returnTotalValue: { fontSize: theme.fontSize.sm, fontWeight: '700', color: VALUE_COLORS.negative },
  returnReason: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: 6, fontStyle: 'italic' },
  returnGrandTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: theme.spacing.sm, marginTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  returnGrandTotalLabel: { fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.text },
  returnGrandTotalValue: { fontSize: theme.fontSize.base, fontWeight: '800', color: VALUE_COLORS.negative },

  // ── Botão devolução ───────────────────────────────────────
  returnSection: { width: '100%', alignItems: 'center', marginTop: theme.spacing.xs, marginBottom: theme.spacing.lg },
  returnButton: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  returnInfoText: {
    fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: theme.spacing.sm, textAlign: 'center',
  },

  // ── Recibo oculto (somente para captura/share) ────────────
  hiddenReceipt: { position: 'absolute', left: -5000, top: 0, width: 400 },
});


