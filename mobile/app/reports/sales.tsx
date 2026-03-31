/**
 * Relatório de Vendas
 * Análise completa de vendas, lucro, margem e breakdown
 */
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import useBackToList from '@/hooks/useBackToList';
import {
  getSalesReport,
  PeriodFilter as PeriodFilterType,
  type TopProduct,
} from '@/services/reportService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import PeriodFilter from '@/components/PeriodFilter';
import type { PeriodFilterValue } from '@/components/PeriodFilter';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PageHeader from '@/components/layout/PageHeader';
import { useBrandingColors } from '@/store/brandingStore';

export default function SalesReportScreen() {
  const { goBack } = useBackToList('/(tabs)/more');
  const brandingColors = useBrandingColors();
  const [period, setPeriod] = useState<PeriodFilterType>('this_month');
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  const { data: report, isLoading, refetch } = useQuery({
    queryKey: ['sales-report', period],
    queryFn: () => getSalesReport(period),
  });

  const periodLabels: Record<PeriodFilterType, string> = {
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

  const getVariantLabel = (product: TopProduct): string | null => {
    if (product.variant_label && product.variant_label.trim().length > 0) {
      return product.variant_label;
    }

    const pieces = [product.variant_color, product.variant_size].filter(
      (value): value is string => Boolean(value && value.trim().length > 0)
    );

    return pieces.length > 0 ? pieces.join(' • ') : null;
  };

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  useFocusEffect(
    useCallback(() => {
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
      return () => clearTimeout(t);
    }, [])
  );

  /**
   * Gerar HTML para PDF
   */
  const generateHTMLContent = () => {
    if (!report) return '';

    const currentDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const paymentRows = report.payment_breakdown
      .map(
        (item) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${
            paymentLabels[item.method] || item.method
          }</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${
            item.count
          }</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${formatCurrency(
            item.total
          )}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #6366f1;">${item.percentage.toFixed(
            1
          )}%</td>
        </tr>
      `
      )
      .join('');

    const productRows = report.top_products
      .map(
        (product, index) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; width: 40px; text-align: center;">
            <div style="background: #eef2ff; color: #6366f1; width: 32px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; margin: 0 auto;">#{index + 1}</div>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${
              product.product_name
            }</div>
            <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;">
              ${getVariantLabel(product) || 'Variação padrão'}${product.variant_sku ? ` • SKU: ${product.variant_sku}` : ''}
            </div>
            <div style="font-size: 12px; color: #6b7280;">${
              product.quantity_sold
            } unidades • Margem: ${product.margin.toFixed(1)}%</div>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
            <div style="font-weight: 700; color: #1f2937; margin-bottom: 4px;">${formatCurrency(
              product.revenue
            )}</div>
            <div style="font-size: 12px; color: #10b981; font-weight: 600;">+${formatCurrency(
              product.profit
            )}</div>
          </td>
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @page {
            margin: 120px 40px 80px 40px;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            color: #1f2937;
            background: #fff;
          }
          
          .header {
            position: fixed;
            top: -100px;
            left: 0;
            right: 0;
            text-align: center;
            padding: 20px 40px;
            background: #fff;
            border-bottom: 3px solid #6366f1;
          }
          .logo {
            font-size: 28px;
            font-weight: 800;
            color: #6366f1;
            margin-bottom: 8px;
          }
          .report-title {
            font-size: 20px;
            font-weight: 600;
            color: #4b5563;
          }
          .period {
            font-size: 14px;
            color: #6b7280;
            margin-top: 8px;
          }
          .date {
            font-size: 12px;
            color: #9ca3af;
            margin-top: 4px;
          }
          .metrics {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 40px;
          }
          .metric-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 24px;
            border-radius: 12px;
            color: #fff;
          }
          .metric-card.secondary {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          }
          .metric-label {
            font-size: 13px;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          .metric-value {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .metric-subtitle {
            font-size: 13px;
            opacity: 0.8;
          }
          .section {
            margin-bottom: 40px;
          }
          .section-title {
            font-size: 18px;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 20px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e5e7eb;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
          }
          thead {
            background: #f9fafb;
          }
          th {
            padding: 12px;
            text-align: left;
            font-size: 13px;
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .footer {
            position: fixed;
            bottom: -60px;
            left: 0;
            right: 0;
            padding: 20px 40px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
            background: #fff;
          }
          
          .content {
            margin-top: 20px;
          }
          
          .section {
            page-brecontent">
          <div class="ak-inside: avoid;
          }
          
          table {
            page-break-inside: auto;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          thead {
            display: table-header-group;
          }
          
          tfoot {
            display: table-footer-group;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Fitness Store</div>
          <div class="report-title">Relatório de Vendas</div>
          <div class="period">${periodLabels[period]}</div>
          <div class="date">Gerado em ${currentDate}</div>
        </div>

        <div class="metrics">
          <div class="metric-card">
            <div class="metric-label">Total de Vendas</div>
            <div class="metric-value">${formatCurrency(report.total_revenue)}</div>
            <div class="metric-subtitle">${report.total_sales} vendas realizadas</div>
          </div>
          <div class="metric-card secondary">
            <div class="metric-label">Lucro Líquido</div>
            <div class="metric-value">${formatCurrency(report.total_profit)}</div>
            <div class="metric-subtitle">Margem: ${report.profit_margin.toFixed(1)}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Ticket Médio</div>
            <div class="metric-value">${formatCurrency(report.average_ticket)}</div>
            <div class="metric-subtitle">Por venda</div>
          </div>
          <div class="metric-card secondary">
            <div class="metric-label">CMV (FIFO)</div>
            <div class="metric-value">${formatCurrency(report.total_cost)}</div>
            <div class="metric-subtitle">Custo total</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Formas de Pagamento</div>
        </div>
          <table>
            <thead>
              <tr>
                <th>Método</th>
                <th style="text-align: center;">Vendas</th>
                <th style="text-align: right;">Total</th>
                <th style="text-align: right;">%</th>
              </tr>
            </thead>
            <tbody>
              ${paymentRows}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Top Produtos</div>
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Produto</th>
                <th style="text-align: right;">Receita</th>
              </tr>
            </thead>
            <tbody>
              ${productRows}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <div>Sistema de Gestão Fitness Store Management</div>
          <div style="margin-top: 4px;">© 2026 Todos os direitos reservados</div>
        </div>
      </body>
      </html>
    `;
  };

  /**
   * Exportar relatório em PDF
   */
  const handleExportPDF = async () => {
    if (!report) {
      setErrorMessage('Nenhum relatório disponível para exportar');
      setShowErrorDialog(true);
      return;
    }

    try {
      setIsExporting(true);

      // Gerar HTML
      const html = generateHTMLContent();

      // Gerar PDF
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      // Salvar em diretório de documentos
      const fileName = `relatorio-vendas-${period}-${Date.now()}.pdf`;
      const pdfPath = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.moveAsync({
        from: uri,
        to: pdfPath,
      });

      // Compartilhar PDF
      await shareAsync(pdfPath, {
        mimeType: 'application/pdf',
        dialogTitle: 'Exportar Relatório de Vendas',
        UTI: 'com.adobe.pdf',
      });

      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      setErrorMessage('Não foi possível exportar o relatório');
      setShowErrorDialog(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Relatório de Vendas"
          subtitle={report ? `${periodLabels[period]} • ${report.total_sales} vendas` : periodLabels[period]}
          showBackButton
          onBack={goBack}
          rightActions={[
            {
              icon: isExporting ? 'hourglass-outline' : 'download-outline',
              onPress: handleExportPDF,
            },
          ]}
        />
      </Animated.View>

      <Animated.View style={[styles.contentAnimation, contentAnimStyle]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              colors={[brandingColors.primary]}
              tintColor={brandingColors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.periodContainer}>
            <PeriodFilter
              value={period as PeriodFilterValue}
              onChange={(value) => setPeriod(value as PeriodFilterType)}
            />
          </View>

          {isLoading && (
            <View style={styles.loadingStateCard}>
              <ActivityIndicator size="large" color={brandingColors.primary} />
              <Text style={styles.loadingText}>Carregando relatório...</Text>
            </View>
          )}

          {!isLoading && !report && (
            <View style={styles.emptyStateCard}>
              <View style={[styles.emptyStateIconWrap, { backgroundColor: brandingColors.primary + '12' }]}>
                <Ionicons name="bar-chart-outline" size={28} color={brandingColors.primary} />
              </View>
              <Text style={styles.emptyStateTitle}>Sem dados para este período</Text>
              <Text style={styles.emptyStateDescription}>
                Ajuste o filtro para visualizar vendas, lucro e ticket médio.
              </Text>
            </View>
          )}

          {!isLoading && report && (
            <>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCardWide}>
                  <View style={styles.metricHeader}>
                    <View style={[styles.metricIconWrap, { backgroundColor: VALUE_COLORS.positive + '18' }]}>
                      <Ionicons name="cash-outline" size={18} color={VALUE_COLORS.positive} />
                    </View>
                    <Text style={styles.metricLabel}>Receita</Text>
                  </View>
                  <Text style={[styles.metricValue, { color: VALUE_COLORS.positive }]}>{formatCurrency(report.total_revenue)}</Text>
                  <Text style={styles.metricCount}>{report.total_sales} vendas</Text>
                </View>

                <View style={styles.metricCardWide}>
                  <View style={styles.metricHeader}>
                    <View style={[styles.metricIconWrap, { backgroundColor: VALUE_COLORS.positive + '18' }]}>
                      <Ionicons name="trending-up" size={18} color={VALUE_COLORS.positive} />
                    </View>
                    <Text style={styles.metricLabel}>Lucro</Text>
                  </View>
                  <Text style={[styles.metricValue, { color: VALUE_COLORS.positive }]}>{formatCurrency(report.total_profit)}</Text>
                  <Text style={styles.metricCount}>Margem: {report.profit_margin.toFixed(1)}%</Text>
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.metricHeader}>
                    <View style={[styles.metricIconWrap, { backgroundColor: Colors.light.info + '18' }]}>
                      <Ionicons name="receipt-outline" size={18} color={Colors.light.info} />
                    </View>
                    <Text style={styles.metricLabel}>Ticket Médio</Text>
                  </View>
                  <Text style={[styles.metricValue, { color: VALUE_COLORS.neutral }]}>{formatCurrency(report.average_ticket)}</Text>
                  <Text style={styles.metricCount}>por venda</Text>
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.metricHeader}>
                    <View style={[styles.metricIconWrap, { backgroundColor: VALUE_COLORS.warning + '18' }]}>
                      <Ionicons name="pricetag-outline" size={18} color={VALUE_COLORS.warning} />
                    </View>
                    <Text style={styles.metricLabel}>CMV (FIFO)</Text>
                  </View>
                  <Text style={[styles.metricValue, { color: VALUE_COLORS.negative }]}>{formatCurrency(report.total_cost)}</Text>
                  <Text style={styles.metricCount}>custo total</Text>
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: brandingColors.primary + '12' }]}>
                    <Ionicons name="card-outline" size={16} color={brandingColors.primary} />
                  </View>
                  <Text style={styles.cardTitle}>Formas de Pagamento</Text>
                </View>

                {report.payment_breakdown.length === 0 ? (
                  <Text style={styles.sectionEmptyText}>Nenhum pagamento registrado no período.</Text>
                ) : (
                  report.payment_breakdown.map((item, index) => (
                    <View key={`${item.method}-${index}`} style={styles.paymentRow}>
                      <View style={styles.paymentInfo}>
                        <Text style={styles.paymentMethod} numberOfLines={1}>
                          {paymentLabels[item.method] || item.method}
                        </Text>
                        <Text style={styles.paymentCount}>{item.count} vendas</Text>
                      </View>
                      <View style={styles.paymentValues}>
                        <Text style={styles.paymentTotal}>{formatCurrency(item.total)}</Text>
                        <Text style={styles.paymentPercent}>{item.percentage.toFixed(1)}%</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: VALUE_COLORS.warning + '18' }]}>
                    <Ionicons name="trophy-outline" size={16} color={VALUE_COLORS.warning} />
                  </View>
                  <Text style={styles.cardTitle}>Top Produtos</Text>
                </View>

                {report.top_products.length === 0 ? (
                  <Text style={styles.sectionEmptyText}>Nenhum produto vendido no período.</Text>
                ) : (
                  report.top_products.map((product, index) => (
                    <View
                      key={`${product.product_id}-${product.variant_id ?? 'base'}-${index}`}
                      style={styles.productRow}
                    >
                      <View style={styles.productRank}>
                        <Text style={styles.rankNumber}>#{index + 1}</Text>
                      </View>
                      <View style={styles.productInfo}>
                        <Text style={styles.productName} numberOfLines={1}>{product.product_name}</Text>
                        {(getVariantLabel(product) || product.variant_sku) && (
                          <View style={styles.productVariantRow}>
                            {getVariantLabel(product) && (
                              <View style={styles.variantBadge}>
                                <Ionicons name="color-filter-outline" size={11} color={Colors.light.info} />
                                <Text style={styles.variantBadgeText} numberOfLines={1}>
                                  {getVariantLabel(product)}
                                </Text>
                              </View>
                            )}
                            {product.variant_sku && (
                              <View style={styles.skuBadge}>
                                <Text style={styles.skuBadgeText} numberOfLines={1}>SKU {product.variant_sku}</Text>
                              </View>
                            )}
                          </View>
                        )}
                        <Text style={styles.productStats} numberOfLines={1}>
                          {product.quantity_sold} un • Margem: {product.margin.toFixed(1)}%
                        </Text>
                      </View>
                      <View style={styles.productValues}>
                        <Text style={styles.productRevenue}>{formatCurrency(product.revenue)}</Text>
                        <Text style={styles.productProfit}>+{formatCurrency(product.profit)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>

      {/* Diálogos */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message="Relatório exportado com sucesso"
        confirmText="OK"
        cancelText=""
        onConfirm={() => setShowSuccessDialog(false)}
        onCancel={() => setShowSuccessDialog(false)}
        type="success"
        icon="checkmark-circle"
      />

      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro"
        message={errorMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
        type="danger"
        icon="alert-circle"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerAnimation: {
    zIndex: 2,
  },
  contentAnimation: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  periodContainer: {
    alignItems: 'flex-start',
  },
  loadingStateCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  emptyStateCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  emptyStateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyStateTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  emptyStateDescription: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs + 2,
  },
  metricCardWide: {
    width: '100%',
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
  },
  metricCard: {
    width: '48%',
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
  },
  metricHeader: {
    marginBottom: theme.spacing.xs,
    gap: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  metricCount: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: theme.spacing.xxs,
  },
  sectionCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  sectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
  },
  sectionEmptyText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    paddingVertical: theme.spacing.xs,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs + 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  paymentInfo: {
    flex: 1,
    minWidth: 0,
  },
  paymentMethod: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  paymentCount: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: theme.spacing.xxs,
  },
  paymentValues: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  paymentTotal: {
    fontSize: theme.fontSize.base,
    fontWeight: '800',
    color: VALUE_COLORS.neutral,
  },
  paymentPercent: {
    fontSize: theme.fontSize.xs,
    color: VALUE_COLORS.positive,
    fontWeight: '700',
    marginTop: theme.spacing.xxs,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    gap: theme.spacing.xs + 2,
    marginBottom: theme.spacing.xs,
  },
  productRank: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.info + '14',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rankNumber: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.info,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productVariantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xxs + 2,
    marginTop: theme.spacing.xxs + 1,
  },
  variantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.info + '14',
  },
  variantBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.light.info,
    maxWidth: 140,
  },
  skuBadge: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    backgroundColor: VALUE_COLORS.warning + '1f',
  },
  skuBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: VALUE_COLORS.warning,
    maxWidth: 120,
  },
  productName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  productStats: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: theme.spacing.xxs + 1,
  },
  productValues: {
    alignItems: 'flex-end',
    flexShrink: 0,
    marginTop: 2,
  },
  productRevenue: {
    fontSize: theme.fontSize.base,
    fontWeight: '800',
    color: VALUE_COLORS.neutral,
  },
  productProfit: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: VALUE_COLORS.positive,
    marginTop: theme.spacing.xxs,
  },
});
