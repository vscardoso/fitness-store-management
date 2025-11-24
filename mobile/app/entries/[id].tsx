/**
 * Stock Entry Details Screen - Detalhes da Entrada
 * 
 * Funcionalidades:
 * - Informações completas da entrada
 * - Lista de produtos com métricas FIFO
 * - Sell-through por produto
 * - Best sellers da entrada
 * - Produtos com baixa movimentação
 * - Gráfico de performance
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  ProgressBar,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import { getStockEntryById, deleteStockEntry } from '@/services/stockEntryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { EntryType, EntryItemResponse } from '@/types';

export default function StockEntryDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Validar ID
  const entryId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(entryId) && entryId > 0;

  // Estados
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Query: Buscar entrada
   */
  const { data: entry, isLoading, refetch } = useQuery({
    queryKey: ['stock-entry', entryId],
    queryFn: () => getStockEntryById(entryId),
    enabled: isValidId,
  });

  /**
   * Mutation: Deletar entrada
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteStockEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      Alert.alert('Sucesso', 'Entrada excluída com sucesso', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.message || 'Erro ao excluir entrada');
    },
  });

  /**
   * Refresh
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  /**
   * Confirmar exclusão
   */
  const handleDelete = () => {
    Alert.alert(
      'Excluir Entrada',
      'Tem certeza que deseja excluir esta entrada? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  /**
   * Renderizar badge de tipo
   */
  const renderTypeBadge = (type: EntryType) => {
    const typeConfig = {
      trip: { label: 'Viagem', color: Colors.light.info, icon: 'car-outline' },
      online: { label: 'Online', color: Colors.light.warning, icon: 'cart-outline' },
      local: { label: 'Local', color: Colors.light.success, icon: 'business-outline' },
    };

    const config = typeConfig[type] || typeConfig.local;

    return (
      <View style={[styles.typeBadge, { backgroundColor: config.color + '20' }]}>
        <Ionicons name={config.icon as any} size={16} color={config.color} />
        <Text style={[styles.typeBadgeText, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    );
  };

  /**
   * Calcular best sellers e slow movers
   */
  const analyzeProducts = (items: EntryItemResponse[]) => {
    const itemsWithDepletion = items.map(item => ({
      ...item,
      depletionRate: ((item.quantity_received - item.quantity_remaining) / item.quantity_received) * 100,
    }));

    // Best sellers: maior taxa de depleção
    const bestSellers = [...itemsWithDepletion]
      .sort((a, b) => b.depletionRate - a.depletionRate)
      .slice(0, 3);

    // Slow movers: menor taxa de depleção e ainda tem estoque
    const slowMovers = [...itemsWithDepletion]
      .filter(item => item.quantity_remaining > 0)
      .sort((a, b) => a.depletionRate - b.depletionRate)
      .slice(0, 3);

    return { bestSellers, slowMovers };
  };

  /**
   * Renderizar item de produto
   */
  const renderProductItem = (item: EntryItemResponse) => {
    const depletionRate = ((item.quantity_received - item.quantity_remaining) / item.quantity_received) * 100;
    const isSlowMover = depletionRate < 30 && item.quantity_remaining > 0;
    const isBestSeller = depletionRate >= 70;

    return (
      <Card key={item.id} style={styles.productCard}>
        <Card.Content>
          <View style={styles.productHeader}>
            <Text style={styles.productName}>Produto #{item.product_id}</Text>
            {isBestSeller && (
              <Chip icon="trophy" style={styles.bestSellerChip} textStyle={styles.chipText}>
                Best Seller
              </Chip>
            )}
            {isSlowMover && (
              <Chip icon="alert" style={styles.slowMoverChip} textStyle={styles.chipText}>
                Parado
              </Chip>
            )}
          </View>

          {/* Métricas */}
          <View style={styles.productMetrics}>
            <View style={styles.productMetricItem}>
              <Text style={styles.productMetricLabel}>Comprado</Text>
              <Text style={styles.productMetricValue}>{item.quantity_received} un</Text>
            </View>
            <View style={styles.productMetricItem}>
              <Text style={styles.productMetricLabel}>Vendido</Text>
              <Text style={[styles.productMetricValue, { color: Colors.light.success }]}>
                {item.quantity_sold} un
              </Text>
            </View>
            <View style={styles.productMetricItem}>
              <Text style={styles.productMetricLabel}>Restante</Text>
              <Text style={[styles.productMetricValue, { color: Colors.light.warning }]}>
                {item.quantity_remaining} un
              </Text>
            </View>
          </View>

          {/* Barra de progresso */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Sell-Through</Text>
              <Text style={[
                styles.progressPercentage,
                { color: depletionRate >= 70 ? Colors.light.success : depletionRate >= 40 ? Colors.light.warning : Colors.light.error }
              ]}>
                {depletionRate.toFixed(1)}%
              </Text>
            </View>
            <ProgressBar
              progress={depletionRate / 100}
              color={depletionRate >= 70 ? Colors.light.success : depletionRate >= 40 ? Colors.light.warning : Colors.light.error}
              style={styles.progressBar}
            />
          </View>

          {/* Custo */}
          <View style={styles.productFooter}>
            <Text style={styles.productCostLabel}>Custo Unit.: {formatCurrency(item.unit_cost)}</Text>
            <Text style={styles.productTotalCost}>Total: {formatCurrency(item.total_cost)}</Text>
          </View>
        </Card.Content>
      </Card>
    );
  };

  /**
   * Loading
   */
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={styles.loadingText}>Carregando entrada...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /**
   * Erro: Entrada não encontrada
   */
  if (!entry) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={64} color={Colors.light.error} />
            <Text style={styles.errorText}>Entrada não encontrada</Text>
            <Button mode="contained" onPress={() => router.back()} style={styles.backButton}>
              Voltar
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const { bestSellers, slowMovers } = analyzeProducts(entry.entry_items || []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header Gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.primary]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerSubtitle}>Entrada de Estoque</Text>
            <Text style={styles.headerTitle}>{entry.entry_code}</Text>
          </View>
          <View style={styles.headerPlaceholder} />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Info Básica */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.infoHeader}>
              <Text style={styles.cardTitle}>Informações</Text>
              {renderTypeBadge(entry.entry_type)}
            </View>

            <InfoRow label="Data de Entrada" value={formatDate(entry.entry_date)} icon="calendar-outline" />
            <InfoRow label="Fornecedor" value={entry.supplier_name} icon="briefcase-outline" />
            {entry.supplier_cnpj && (
              <InfoRow label="CNPJ" value={entry.supplier_cnpj} icon="card-outline" />
            )}
            {entry.supplier_contact && (
              <InfoRow label="Contato" value={entry.supplier_contact} icon="call-outline" />
            )}
            {entry.invoice_number && (
              <InfoRow label="Nota Fiscal" value={entry.invoice_number} icon="document-text-outline" />
            )}
            {entry.payment_method && (
              <InfoRow label="Pagamento" value={entry.payment_method} icon="cash-outline" />
            )}
            {entry.trip_code && (
              <InfoRow 
                label="Viagem" 
                value={`${entry.trip_code}${entry.trip_destination ? ` - ${entry.trip_destination}` : ''}`}
                icon="airplane-outline" 
              />
            )}
            {entry.notes && (
              <InfoRow label="Observações" value={entry.notes} icon="document-outline" />
            )}
          </Card.Content>
        </Card>

        {/* KPIs */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Custo Total"
            value={formatCurrency(entry.total_cost)}
            icon="cash-outline"
          />
          <StatCard
            label="Total Items"
            value={`${entry.total_items} (${entry.total_quantity} un)`}
            icon="cube-outline"
          />
          <StatCard
            label="Vendidos"
            value={`${entry.items_sold}`}
            icon="cart-outline"
          />
          <StatCard
            label="Sell-Through"
            value={`${entry.sell_through_rate.toFixed(1)}%`}
            icon="trending-up-outline"
          />
          {entry.roi !== null && entry.roi !== undefined && (
            <StatCard
              label="ROI"
              value={`${entry.roi >= 0 ? '+' : ''}${entry.roi.toFixed(1)}%`}
              icon="analytics-outline"
            />
          )}
        </View>

        {/* Best Sellers */}
        {bestSellers.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Ionicons name="trophy-outline" size={20} color={Colors.light.success} />
                <Text style={styles.sectionTitle}>Best Sellers</Text>
              </View>
              {bestSellers.map((item, index) => (
                <View key={item.id} style={styles.rankItem}>
                  <View style={[styles.rankBadge, { backgroundColor: Colors.light.success + '20' }]}>
                    <Text style={[styles.rankNumber, { color: Colors.light.success }]}>#{index + 1}</Text>
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankName}>Produto #{item.product_id}</Text>
                    <Text style={styles.rankMetric}>
                      {item.quantity_sold} vendidos de {item.quantity_received} ({item.depletionRate.toFixed(0)}%)
                    </Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        {/* Slow Movers */}
        {slowMovers.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Ionicons name="alert-circle-outline" size={20} color={Colors.light.warning} />
                <Text style={styles.sectionTitle}>Produtos Parados</Text>
              </View>
              {slowMovers.map((item, index) => (
                <View key={item.id} style={styles.rankItem}>
                  <View style={[styles.rankBadge, { backgroundColor: Colors.light.warning + '20' }]}>
                    <Ionicons name="alert" size={16} color={Colors.light.warning} />
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankName}>Produto #{item.product_id}</Text>
                    <Text style={styles.rankMetric}>
                      Restam {item.quantity_remaining} de {item.quantity_received} ({item.depletionRate.toFixed(0)}% vendido)
                    </Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        {/* Lista de Produtos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleLarge}>
            Produtos ({entry.entry_items?.length || 0})
          </Text>
          {entry.entry_items && entry.entry_items.length > 0 ? (
            entry.entry_items.map(renderProductItem)
          ) : (
            <Card style={styles.card}>
              <Card.Content>
                <Text style={styles.emptyText}>Nenhum produto nesta entrada</Text>
              </Card.Content>
            </Card>
          )}
        </View>

        {/* Ações */}
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={handleDelete}
            loading={deleteMutation.isPending}
            disabled={deleteMutation.isPending}
            icon="trash-outline"
            textColor={Colors.light.error}
            style={styles.deleteButton}
          >
            Excluir Entrada
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.light.textSecondary,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  headerPlaceholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    backgroundColor: Colors.light.card,
    elevation: 2,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
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
    color: Colors.light.text,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  rankInfo: {
    flex: 1,
  },
  rankName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  rankMetric: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitleLarge: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12,
  },
  productCard: {
    marginBottom: 12,
    backgroundColor: Colors.light.card,
    elevation: 1,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  bestSellerChip: {
    backgroundColor: Colors.light.success + '20',
    height: 24,
  },
  slowMoverChip: {
    backgroundColor: Colors.light.warning + '20',
    height: 24,
  },
  chipText: {
    fontSize: 11,
    marginVertical: 0,
  },
  productMetrics: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  productMetricItem: {
    flex: 1,
  },
  productMetricLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  productMetricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  progressPercentage: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  productCostLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  productTotalCost: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  actions: {
    marginTop: 8,
  },
  deleteButton: {
    borderColor: Colors.light.error,
  },
});
