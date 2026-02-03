/**
 * Relatório de Vendas
 * Análise completa de vendas, lucro, margem e breakdown
 */
import { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import useBackToList from '@/hooks/useBackToList';
import { getSalesReport, PeriodFilter as PeriodFilterType } from '@/services/reportService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import PeriodFilter from '@/components/PeriodFilter';
import type { PeriodFilterValue } from '@/components/PeriodFilter';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function SalesReportScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/more');
  const [period, setPeriod] = useState<PeriodFilterType>('this_month');
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={goBack} style={styles.backIconButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>Relatório de Vendas</Text>
              <Text style={styles.headerSubtitle}>Análise de Performance</Text>
            </View>
            <TouchableOpacity 
              onPress={handleExportPDF} 
              style={styles.exportButton}
              disabled={isExporting || isLoading}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="download-outline" size={24} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      >
        {report && (
          <>
            {/* Period Filter */}
            <View style={styles.periodContainer}>
              <PeriodFilter 
                value={period as PeriodFilterValue} 
                onChange={(value) => setPeriod(value as PeriodFilterType)} 
              />
            </View>

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
              <Card style={[styles.metricCard, styles.metricCardPrimary]}>
                <Card.Content>
                  <View style={styles.metricHeader}>
                    <Ionicons name="trending-up" size={24} color={Colors.light.success} />
                  </View>
                  <Text style={styles.metricLabel}>Lucro</Text>
                  <Text style={styles.metricValue}>
                    {formatCurrency(report.total_profit)}
                  </Text>
                  <Text style={styles.metricCount}>
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
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <Ionicons name="card-outline" size={20} color={Colors.light.primary} />
                  <Text style={styles.cardTitle}>Formas de Pagamento</Text>
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
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <Ionicons name="trophy-outline" size={20} color={Colors.light.primary} />
                  <Text style={styles.cardTitle}>Top Produtos</Text>
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
  // Header Premium
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  backIconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
  },
  headerPlaceholder: {
    width: 40,
  },
  exportButton: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  periodContainer: {
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    width: '48%',
    borderRadius: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  metricCardPrimary: {
    width: '100%',
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
  card: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
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
    borderBottomColor: Colors.light.border,
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
