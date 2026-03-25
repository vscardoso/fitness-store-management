import { useLocalSearchParams } from 'expo-router';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text, ActivityIndicator, Button } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, useCallback } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import PageHeader from '@/components/layout/PageHeader';
import useBackToList from '@/hooks/useBackToList';
import { getSaleById } from '@/services/saleService';
import { getReturnHistory } from '@/services/returnService';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { SaleReturn } from '@/services/returnService';
import { Colors } from '@/constants/Colors';
import { useAuthStore } from '@/store/authStore';
import SaleReceipt from '@/components/receipt/SaleReceipt';
import ReturnModal from '@/components/sale/ReturnModal';
import type { SaleWithDetails } from '@/types';

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  pending:            { label: 'Pendente',     color: '#F57C00', bg: '#FFF3E0' },
  completed:          { label: 'Concluída',    color: '#2E7D32', bg: '#E8F5E9' },
  cancelled:          { label: 'Cancelada',    color: '#C62828', bg: '#FFEBEE' },
  partially_refunded: { label: 'Dev. Parcial', color: '#F57C00', bg: '#FFF3E0' },
  refunded:           { label: 'Devolvida',    color: '#7B1FA2', bg: '#F3E5F5' },
};

const paymentLabel: Record<string, string> = {
  cash: 'Dinheiro', credit_card: 'Crédito', debit_card: 'Débito',
  pix: 'Pix', transfer: 'Transferência',
};

const paymentIcon: Record<string, string> = {
  cash: 'cash', credit_card: 'card', debit_card: 'card',
  pix: 'qr-code-outline', transfer: 'swap-horizontal',
};

export default function SaleDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const saleId = Number(id);
  const { goBack } = useBackToList('/(tabs)/sales');
  const receiptRef = useRef<View>(null);
  const { user } = useAuthStore();
  const [returnModalVisible, setReturnModalVisible] = useState(false);

  const { data: sale, isLoading, isError, refetch } = useQuery<SaleWithDetails>({
    queryKey: ['sale', saleId],
    queryFn: () => getSaleById(saleId),
  });

  const { data: returns = [], refetch: refetchReturns } = useQuery<SaleReturn[]>({
    queryKey: ['returns', saleId],
    queryFn: () => getReturnHistory(saleId),
    enabled: !!saleId,
  });

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
          <ActivityIndicator size="large" color={Colors.light.primary} />
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
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const statusStyle = statusMap[sale.status] || statusMap.pending;
  const formattedDateTime = formatDateTime(sale.created_at);
  const [datePart, timePart] = formattedDateTime.split(' ');
  const hasDiscount = Number(sale.discount_amount) > 0;
  const hasTax = Number(sale.tax_amount) > 0;

  return (
    <View style={styles.container}>
      <PageHeader
        title={sale.sale_number}
        subtitle={`${datePart} · ${timePart}`}
        showBackButton
        onBack={goBack}
        rightActions={[{ icon: 'share-outline', onPress: handleShareReceipt }]}
      >
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Ionicons name="checkmark-circle" size={13} color={statusStyle.color} />
          <Text style={[styles.statusText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
        </View>
      </PageHeader>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── HERO: Total + Formas de pagamento ─────────────────── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>TOTAL DA VENDA</Text>
          <Text style={styles.heroAmount}>{formatCurrency(sale.total_amount)}</Text>
          <Text style={styles.heroItems}>
            {sale.items.length} {sale.items.length === 1 ? 'produto' : 'produtos'}
          </Text>

        </View>

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
            <Ionicons name="trending-up" size={16} color="#2E7D32" />
            <Text style={styles.profitTitle}>Rentabilidade</Text>
            <View style={styles.profitSep} />
            <View style={styles.profitCol}>
              <Text style={styles.profitLbl}>Custo</Text>
              <Text style={styles.profitVal}>{formatCurrency(sale.total_cost || 0)}</Text>
            </View>
            <View style={styles.profitSep} />
            <View style={styles.profitCol}>
              <Text style={styles.profitLbl}>Lucro</Text>
              <Text style={[styles.profitVal, { color: (sale.total_profit ?? 0) >= 0 ? '#2E7D32' : '#C62828' }]}>
                {formatCurrency(sale.total_profit ?? 0)}
              </Text>
            </View>
            <View style={styles.profitSep} />
            <View style={styles.profitCol}>
              <Text style={styles.profitLbl}>Margem</Text>
              <Text style={[styles.profitVal, { color: (sale.profit_margin_percent ?? 0) >= 0 ? '#2E7D32' : '#C62828' }]}>
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
        {(sale.status === 'completed' || sale.status === 'partially_refunded') && (
          <View style={styles.returnSection}>
            <Button
              mode="outlined"
              onPress={() => setReturnModalVisible(true)}
              style={styles.returnButton}
              textColor={Colors.light.error}
              icon="refresh"
            >
              {sale.status === 'partially_refunded' ? 'Nova Devolução' : 'Realizar Devolução'}
            </Button>
            <Text style={styles.returnInfoText}>Prazo de até 7 dias após a venda</Text>
          </View>
        )}
      </ScrollView>

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
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  loadingText: { color: Colors.light.textSecondary },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#222', marginTop: 12 },
  errorSubtitle: { fontSize: 14, color: '#666' },
  retryButton: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.light.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24,
  },
  retryText: { color: '#fff', fontWeight: '600' },

  // Header status badge
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  scrollContent: { padding: 16, paddingBottom: 48 },

  // ── Hero ──────────────────────────────────────────────────
  heroCard: {
    backgroundColor: Colors.light.primary,
    borderRadius: 20, padding: 24, marginBottom: 12,
    alignItems: 'center',
    elevation: 4,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  heroLabel: {
    fontSize: 11, fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
  },
  heroAmount: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  heroItems: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4, marginBottom: 16 },
  paymentLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  paymentLineText: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },

  // ── Rentabilidade ─────────────────────────────────────────
  profitCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, marginBottom: 12, gap: 8,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 3,
  },
  profitTitle: { fontSize: 12, fontWeight: '700', color: '#2E7D32', flex: 1 },
  profitSep: { width: 1, height: 24, backgroundColor: '#e5e7eb' },
  profitCol: { alignItems: 'center', flex: 1 },
  profitLbl: {
    fontSize: 10, color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },
  profitVal: { fontSize: 13, fontWeight: '700', color: '#222' },

  // ── Card genérico ─────────────────────────────────────────
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 4,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#222' },

  // ── Itens ─────────────────────────────────────────────────
  itemDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  itemLeft: { flex: 1, paddingRight: 12 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 3 },
  itemQtyPrice: { fontSize: 12, color: '#888' },
  itemRight: { alignItems: 'flex-end', gap: 3 },
  itemStrike: { fontSize: 11, color: '#bbb', textDecorationLine: 'line-through' },
  itemSubtotal: { fontSize: 15, fontWeight: '700', color: '#222' },
  marginBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  marginBadgeText: { fontSize: 11, fontWeight: '700' },

  // ── Formas de pagamento ───────────────────────────────────
  paymentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4,
  },
  paymentIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${Colors.light.primary}12`,
    justifyContent: 'center', alignItems: 'center',
  },
  paymentMethodInfo: { flex: 1 },
  paymentMethodLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  paymentInstallments: { fontSize: 12, color: '#888', marginTop: 1 },
  paymentMethodAmount: { fontSize: 15, fontWeight: '700', color: Colors.light.primary },

  // ── Rodapé de totais ──────────────────────────────────────
  totalsFooter: {
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#f0f0f0', gap: 8,
  },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLineLabel: { fontSize: 14, color: '#666' },
  totalLineValue: { fontSize: 14, fontWeight: '600', color: '#555' },
  grandTotalLine: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 2,
  },
  grandTotalLabel: {
    fontSize: 14, fontWeight: '800', color: '#111',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  grandTotalValue: { fontSize: 22, fontWeight: '800', color: Colors.light.primary },
  paymentMethodLine: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 8,
  },
  paymentMethodText: { fontSize: 13, color: Colors.light.textSecondary },

  // ── Envolvidos ────────────────────────────────────────────
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  personRowSpacing: { marginTop: 12 },
  personAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center', alignItems: 'center',
  },
  personInfo: { flex: 1 },
  personLabel: {
    fontSize: 10, color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2,
  },
  personName: { fontSize: 15, fontWeight: '600', color: '#222' },

  // ── Notas ─────────────────────────────────────────────────
  notesCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: Colors.light.info,
    elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2,
  },
  notesText: { flex: 1, fontSize: 14, color: '#444', lineHeight: 20 },

  // ── Devoluções ────────────────────────────────────────────
  returnMeta: { marginBottom: 8 },
  returnNumber: { fontSize: 13, fontWeight: '700', color: '#333' },
  returnDate: { fontSize: 11, color: '#888', marginTop: 1 },
  returnItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  returnItemName: { flex: 1, fontSize: 13, color: '#555' },
  returnItemQty: { fontSize: 12, color: '#888', marginHorizontal: 8 },
  returnItemVal: { fontSize: 13, fontWeight: '600', color: Colors.light.error },
  returnTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  returnTotalLabel: { fontSize: 13, fontWeight: '600', color: '#666' },
  returnTotalValue: { fontSize: 14, fontWeight: '700', color: Colors.light.error },
  returnReason: { fontSize: 12, color: '#888', marginTop: 6, fontStyle: 'italic' },
  returnGrandTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0',
  },
  returnGrandTotalLabel: { fontSize: 14, fontWeight: '700', color: '#333' },
  returnGrandTotalValue: { fontSize: 16, fontWeight: '800', color: Colors.light.error },

  // ── Botão devolução ───────────────────────────────────────
  returnSection: { alignItems: 'center', marginTop: 4, marginBottom: 24 },
  returnButton: { borderColor: Colors.light.error, borderWidth: 2 },
  returnInfoText: {
    fontSize: 12, color: Colors.light.textSecondary, marginTop: 8, textAlign: 'center',
  },

  // ── Recibo oculto (somente para captura/share) ────────────
  hiddenReceipt: { position: 'absolute', left: -5000, top: 0, width: 400 },
});

