import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Alert } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import useBackToList from '@/hooks/useBackToList';
import { getSaleById } from '@/services/saleService';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useAuthStore } from '@/store/authStore';
import SaleReceipt from '@/components/receipt/SaleReceipt';
import type { SaleWithDetails, SaleStatus } from '@/types';

const statusMap: Record<SaleStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendente', color: '#F57C00', bg: '#FFF3E0' },
  completed: { label: 'Concluída', color: '#2E7D32', bg: '#E8F5E9' },
  cancelled: { label: 'Cancelada', color: '#C62828', bg: '#FFEBEE' },
};

const paymentLabel: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Cartão Crédito',
  debit_card: 'Cartão Débito',
  pix: 'Pix',
  transfer: 'Transferência',
};

const paymentIcon: Record<string, string> = {
  cash: 'cash',
  credit_card: 'card',
  debit_card: 'card',
  pix: 'qrcode',
  transfer: 'swap-horizontal',
};

export default function SaleDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const saleId = Number(id);
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/sales');
  const receiptRef = useRef<View>(null);
  const { user } = useAuthStore();

  const { data: sale, isLoading, isError, refetch } = useQuery<SaleWithDetails>({
    queryKey: ['sale', saleId],
    queryFn: () => getSaleById(saleId),
  });

  const handleShareReceipt = async () => {
    if (!sale || !receiptRef.current) return;

    try {
      const uri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Erro', 'Compartilhamento não disponível neste dispositivo');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Recibo - ${sale.sale_number}`,
      });
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
      Alert.alert('Erro', 'Não foi possível compartilhar o recibo');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <SafeAreaView edges={['top']} style={styles.safeArea}>
              <View style={styles.headerTop}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={goBack}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Venda</Text>
                <View style={styles.actionPlaceholder} />
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>
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
        <StatusBar barStyle="light-content" />
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <SafeAreaView edges={['top']} style={styles.safeArea}>
              <View style={styles.headerTop}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={goBack}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Venda</Text>
                <View style={styles.actionPlaceholder} />
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>
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

  const statusStyle = statusMap[sale.status];
  const formattedDateTime = formatDateTime(sale.created_at);
  const [formattedDate, formattedTime] = formattedDateTime.split(' - ');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <SafeAreaView edges={['top']} style={styles.safeArea}>
            <View style={styles.headerTop}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={goBack}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Venda</Text>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleShareReceipt}
                activeOpacity={0.8}
              >
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.headerInfo}>
              <Text style={styles.headerEntityName}>{sale.sale_number}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Ionicons name="checkmark-circle" size={14} color={statusStyle.color} />
                  <Text style={[styles.statusText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Cards de Data e Total */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={styles.metricIconContainer}>
              <Ionicons name="calendar-outline" size={20} color={Colors.light.primary} />
            </View>
            <View style={styles.metricContent}>
              <Text style={styles.metricLabel}>DATA</Text>
              <Text style={styles.metricValue}>{formattedDate}</Text>
              <Text style={styles.metricSubValue}>{formattedTime}</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconContainer}>
              <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
            </View>
            <View style={styles.metricContent}>
              <Text style={styles.metricLabel}>TOTAL</Text>
              <Text style={styles.metricValue}>{formatCurrency(sale.total_amount)}</Text>
              <Text style={styles.metricSubValue}>{sale.items.length} {sale.items.length === 1 ? 'item' : 'itens'}</Text>
            </View>
          </View>
        </View>

        {/* Card de Rentabilidade FIFO */}
        {sale.total_profit != null && (
          <View style={styles.profitCard}>
            <View style={styles.profitHeader}>
              <Ionicons name="trending-up" size={20} color="#2E7D32" />
              <Text style={styles.profitTitle}>Rentabilidade (FIFO)</Text>
            </View>
            <View style={styles.profitMetrics}>
              <View style={styles.profitMetricItem}>
                <Text style={styles.profitMetricLabel}>Custo</Text>
                <Text style={styles.profitMetricValue}>{formatCurrency(sale.total_cost || 0)}</Text>
              </View>
              <View style={styles.profitMetricDivider} />
              <View style={styles.profitMetricItem}>
                <Text style={styles.profitMetricLabel}>Lucro</Text>
                <Text style={[styles.profitMetricValue, { color: (sale.total_profit ?? 0) >= 0 ? '#2E7D32' : '#C62828' }]}>
                  {formatCurrency(sale.total_profit ?? 0)}
                </Text>
              </View>
              <View style={styles.profitMetricDivider} />
              <View style={styles.profitMetricItem}>
                <Text style={styles.profitMetricLabel}>Margem</Text>
                <Text style={[styles.profitMetricValue, { color: (sale.profit_margin_percent ?? 0) >= 0 ? '#2E7D32' : '#C62828' }]}>
                  {(sale.profit_margin_percent ?? 0).toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Recibo Compartilhável */}
        <SaleReceipt 
          ref={receiptRef}
          sale={sale}
          storeName={user?.store_name}
        />

        {/* Resumo Financeiro */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calculator-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.sectionTitle}>Resumo Financeiro</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Subtotal</Text>
              <Text style={styles.infoValue}>{formatCurrency(sale.subtotal)}</Text>
            </View>
            {sale.discount_amount > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Desconto</Text>
                <Text style={[styles.infoValue, styles.discountText]}>-{formatCurrency(sale.discount_amount)}</Text>
              </View>
            )}
            {sale.tax_amount > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Impostos</Text>
                <Text style={styles.infoValue}>{formatCurrency(sale.tax_amount)}</Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(sale.total_amount)}</Text>
            </View>
          </View>
        </View>

        {/* Itens */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.sectionTitle}>Itens da Venda ({sale.items.length})</Text>
          </View>

          {sale.items.map((item, index) => (
            <View key={item.id} style={[styles.card, styles.itemCard]}>
              <View style={styles.itemHeader}>
                <View style={styles.itemNumber}>
                  <Text style={styles.itemNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.product?.name || `Produto ${item.product_id}`}</Text>
                  <Text style={styles.itemSku}>SKU: {item.product?.sku || 'N/A'}</Text>
                </View>
              </View>

              <View style={styles.itemBody}>
                <View style={styles.itemDetail}>
                  <Ionicons name="cube-outline" size={14} color="#666" />
                  <Text style={styles.itemDetailLabel}>Quantidade:</Text>
                  <Text style={styles.itemDetailValue}>{item.quantity}</Text>
                </View>
                <View style={styles.itemDetail}>
                  <Ionicons name="pricetag-outline" size={14} color="#666" />
                  <Text style={styles.itemDetailLabel}>Preço Unit.:</Text>
                  <Text style={styles.itemDetailValue}>{formatCurrency(item.unit_price)}</Text>
                </View>
                {item.unit_cost != null && (
                  <View style={styles.itemDetail}>
                    <Ionicons name="receipt-outline" size={14} color="#666" />
                    <Text style={styles.itemDetailLabel}>Custo Unit.:</Text>
                    <Text style={styles.itemDetailValue}>{formatCurrency(item.unit_cost)}</Text>
                  </View>
                )}
                <View style={styles.divider} />
                <View style={styles.itemTotal}>
                  <Text style={styles.itemTotalLabel}>Subtotal</Text>
                  <Text style={styles.itemTotalValue}>{formatCurrency(item.subtotal)}</Text>
                </View>
                {item.profit != null && (
                  <View style={styles.itemProfitRow}>
                    <View style={styles.itemProfitInfo}>
                      <Text style={styles.itemProfitLabel}>Lucro:</Text>
                      <Text style={[styles.itemProfitValue, { color: item.profit >= 0 ? '#2E7D32' : '#C62828' }]}>
                        {formatCurrency(item.profit)}
                      </Text>
                    </View>
                    <View style={[styles.itemMarginBadge, { backgroundColor: (item.margin_percent ?? 0) >= 30 ? '#E8F5E9' : '#FFF3E0' }]}>
                      <Text style={[styles.itemMarginText, { color: (item.margin_percent ?? 0) >= 30 ? '#2E7D32' : '#F57C00' }]}>
                        {(item.margin_percent ?? 0).toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ))}

          {/* Soma dos itens */}
          <View style={styles.itemsSummary}>
            <View style={styles.itemsSummaryRow}>
              <Text style={styles.itemsSummaryLabel}>Soma dos Itens</Text>
              <Text style={styles.itemsSummaryValue}>
                {formatCurrency(sale.items.reduce((sum, item) => sum + item.subtotal, 0))}
              </Text>
            </View>
            {sale.discount_amount > 0 && (
              <Text style={styles.itemsSummaryNote}>
                * Desconto aplicado no total da venda
              </Text>
            )}
          </View>
        </View>

        {/* Pagamentos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.sectionTitle}>Pagamentos ({sale.payments.length})</Text>
          </View>

          {sale.payments.map((payment) => (
            <View key={payment.id} style={[styles.card, styles.paymentCard]}>
              <View style={styles.paymentHeader}>
                <View style={styles.paymentIcon}>
                  <Ionicons
                    name={paymentIcon[payment.method] as any || 'cash'}
                    size={20}
                    color={Colors.light.primary}
                  />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentMethod}>{paymentLabel[payment.method] || payment.method}</Text>
                  <Text style={styles.paymentDate}>
                    {formatDateTime(payment.created_at)}
                  </Text>
                </View>
                <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
              </View>
            </View>
          ))}

          {/* Resumo dos pagamentos */}
          {sale.payments.length > 0 && (
            <View style={styles.paymentsSummary}>
              <View style={styles.paymentsSummaryRow}>
                <Text style={styles.paymentsSummaryLabel}>Total Pago</Text>
                <Text style={styles.paymentsSummaryValue}>
                  {formatCurrency(sale.payments.reduce((sum, p) => sum + p.amount, 0))}
                </Text>
              </View>
              {sale.discount_amount > 0 && (
                <Text style={styles.paymentsSummaryNote}>
                  * Valor já inclui desconto de {formatCurrency(sale.discount_amount)}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Cliente */}
        {sale.customer_id && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.sectionTitle}>Informações do Cliente</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.customerName}>{sale.customer_name || `Cliente #${sale.customer_id}`}</Text>
              {sale.notes && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.notesContainer}>
                    <Text style={styles.notesLabel}>Observações:</Text>
                    <Text style={styles.notesText}>{sale.notes}</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Observações sem cliente */}
        {!sale.customer_id && sale.notes && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.sectionTitle}>Observações</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.notesText}>{sale.notes}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  loadingText: {
    color: Colors.light.icon,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    marginTop: 12,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  retryButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 0, // SafeAreaView já cuida do espaço superior
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  safeArea: {
    flex: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    gap: 12,
  },
  headerEntityName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  metricIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.light.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricContent: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  metricSubValue: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  discountText: {
    color: '#F57C00',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  itemCard: {
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  itemNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  itemSku: {
    fontSize: 12,
    color: '#666',
  },
  itemBody: {
    gap: 8,
  },
  itemDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemDetailLabel: {
    fontSize: 13,
    color: '#666',
  },
  itemDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
  },
  itemTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  itemTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  paymentCard: {
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.light.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentMethod: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  paymentDate: {
    fontSize: 12,
    color: '#666',
  },
  paymentAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  paymentsSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  paymentsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentsSummaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  paymentsSummaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  paymentsSummaryNote: {
    fontSize: 12,
    color: '#F57C00',
    marginTop: 6,
    fontStyle: 'italic',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  notesContainer: {
    marginTop: 12,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#666',
    marginBottom: 6,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#444',
  },
  profitCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#2E7D32',
  },
  profitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  profitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  profitMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profitMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  profitMetricLabel: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  profitMetricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
  },
  profitMetricDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e0e0e0',
  },
  itemProfitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  itemProfitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemProfitLabel: {
    fontSize: 13,
    color: '#666',
  },
  itemProfitValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemMarginBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  itemMarginText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemsSummary: {
    marginTop: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  itemsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemsSummaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  itemsSummaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  itemsSummaryNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
