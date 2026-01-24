/**
 * Relatório de Vendas
 * Análise completa de vendas, lucro, margem e breakdown
 */
import { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { getSalesReport, PeriodFilter } from '@/services/reportService';
import { formatCurrency } from '@/utils/format';
import { Colors } from '@/constants/Colors';
import PeriodFilter as PeriodFilterComponent from '@/components/PeriodFilter';

export default function SalesReportScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodFilter>('this_month');
  const [showPeriodFilter, setShowPeriodFilter] = useState(false);

  const { data: report, isLoading, refetch } = useQuery({
    queryKey: ['sales-report', period],
    queryFn: () => getSalesReport(period),
  });

  const periodLabels: Record<PeriodFilter, string> = {
    'this_month': 'Este Mês',
    'last_30_days': 'Últimos 30 Dias',
    'last_2_months': 'Últimos 2 Meses',
    'last_3_months': 'Últimos 3 Meses',
    'last_6_months': 'Últimos 6 Meses',
    'this_year': 'Este Ano',
  };

  const paymentLabels: Record<string, string> = {
    'cash': 'Dinheiro',
    'credit_card': 'Cartão de Crédito',
    'debit_card': 'Cartão de Débito',
    'pix': 'PIX',
    'bank_transfer': 'Transferência',
    'installments': 'Parcelado',
    'loyalty_points': 'Pontos',
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerRow}>
            <Ionicons
              name="arrow-back"
              size={24}
              color="#fff"
              onPress={() => router.back()}
            />
            <Text style={styles.headerTitle}>Relatório de Vendas</Text>
            <View style={{ width: 24 }} />
          </View>
          <Text style={styles.headerSubtitle}>Análise de Performance</Text>
        </View>
      </LinearGradient>

      {/* Period Filter */}
      <Card style={styles.periodCard} onPress={() => setShowPeriodFilter(true)}>
        <Card.Content style={styles.periodContent}>
          <Ionicons name="calendar-outline" size={20} color={Colors.light.primary} />
          <Text style={styles.periodText}>{periodLabels[period]}</Text>
          <Ionicons name="chevron-down" size={20} color={Colors.light.primary} />
        </Card.Content>
      </Card>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      >
        {report && (
          <>
            {/* Métricas Principais */}
            <View style={styles.metricsGrid}>
              {/* Total de Vendas */}
              <Card style={[styles.metricCard, styles.metricCardPrimary]}>
                <Card.Content>
                  <View style={styles.metricHeader}>
                    <Ionicons name="cash-outline" size={24} color={Colors.light.success} />
                  </View>
                  <Text style={styles.metricLabel}>Total de Vendas</Text>
                  <Text style={styles.metricValue}>{formatCurrency(report.total_revenue)}</Text>
                  <Text style={styles.metricCount}>{report.total_sales} vendas</Text>
                </Card.Content>
              </Card>

              {/* Lucro */}
              <Card style={[styles.metricCard, styles.metricCardSuccess]}>
                <Card.Content>
                  <View style={styles.metricHeader}>
                    <Ionicons name="trending-up" size={24} color="#fff" />
                  </View>
                  <Text style={[styles.metricLabel, { color: '#fff' }]}>Lucro</Text>
                  <Text style={[styles.metricValue, { color: '#fff' }]}>
                    {formatCurrency(report.total_profit)}
                  </Text>
                  <Text style={[styles.metricCount, { color: '#fff', opacity: 0.9 }]}>
                    Margem: {report.profit_margin.toFixed(1)}%
                  </Text>
                </Card.Content>
              </Card>

              {/* Ticket Médio */}
              <Card style={styles.metricCard}>
                <Card.Content>
                  <View style={styles.metricHeader}>
                    <Ionicons name="receipt-outline" size={24} color={Colors.light.primary} />
                  </View>
                  <Text style={styles.metricLabel}>Ticket Médio</Text>
                  <Text style={styles.metricValue}>{formatCurrency(report.average_ticket)}</Text>
                  <Text style={styles.metricCount}>por venda</Text>
                </Card.Content>
              </Card>

              {/* CMV */}
              <Card style={styles.metricCard}>
                <Card.Content>
                  <View style={styles.metricHeader}>
                    <Ionicons name="pricetag-outline" size={24} color={Colors.light.warning} />
                  </View>
                  <Text style={styles.metricLabel}>CMV (FIFO)</Text>
                  <Text style={styles.metricValue}>{formatCurrency(report.total_cost)}</Text>
                  <Text style={styles.metricCount}>custo total</Text>
                </Card.Content>
              </Card>
            </View>

            {/* Formas de Pagamento */}
            <Card style={styles.sectionCard}>
              <Card.Content>
                <View style={styles.sectionHeader}>
                  <Ionicons name="card-outline" size={22} color={Colors.light.primary} />
                  <Text style={styles.sectionTitle}>Formas de Pagamento</Text>
                </View>

                {report.payment_breakdown.map((item, index) => (
                  <View key={index} style={styles.paymentRow}>
                    <View style={styles.paymentInfo}>
                      <Text style={styles.paymentMethod}>
                        {paymentLabels[item.method] || item.method}
                      </Text>
                      <Text style={styles.paymentCount}>{item.count} vendas</Text>
                    </View>
                    <View style={styles.paymentValues}>
                      <Text style={styles.paymentTotal}>{formatCurrency(item.total)}</Text>
                      <Text style={styles.paymentPercent}>{item.percentage.toFixed(1)}%</Text>
                    </View>
                  </View>
                ))}
              </Card.Content>
            </Card>

            {/* Top Produtos */}
            <Card style={styles.sectionCard}>
              <Card.Content>
                <View style={styles.sectionHeader}>
                  <Ionicons name="trophy-outline" size={22} color={Colors.light.primary} />
                  <Text style={styles.sectionTitle}>Top 10 Produtos</Text>
                </View>

                {report.top_products.map((product, index) => (
                  <View key={index} style={styles.productRow}>
                    <View style={styles.productRank}>
                      <Text style={styles.rankNumber}>#{index + 1}</Text>
                    </View>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>{product.product_name}</Text>
                      <Text style={styles.productStats}>
                        {product.quantity_sold} un • Margem: {product.margin.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={styles.productValues}>
                      <Text style={styles.productRevenue}>{formatCurrency(product.revenue)}</Text>
                      <Text style={styles.productProfit}>+{formatCurrency(product.profit)}</Text>
                    </View>
                  </View>
                ))}
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Period Filter Modal */}
      <PeriodFilterComponent
        visible={showPeriodFilter}
        onClose={() => setShowPeriodFilter(false)}
        onSelect={(value) => {
          setPeriod(value as PeriodFilter);
          setShowPeriodFilter(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  periodCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    elevation: 2,
  },
  periodContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  periodText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  metricCard: {
    width: '48%',
    borderRadius: 12,
    elevation: 2,
  },
  metricCardPrimary: {
    width: '100%',
  },
  metricCardSuccess: {
    width: '100%',
    backgroundColor: Colors.light.success,
  },
  metricHeader: {
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
  },
  metricCount: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  sectionCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentMethod: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  paymentCount: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  paymentValues: {
    alignItems: 'flex-end',
  },
  paymentTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  paymentPercent: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  productRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  productStats: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  productValues: {
    alignItems: 'flex-end',
  },
  productRevenue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  productProfit: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.success,
    marginTop: 2,
  },
});
