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
import { SafeAreaView } from 'react-native-safe-area-context';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
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

  /**
   * Função para voltar garantindo que vai para a lista de entradas
   */
  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/entries');
    }
  };

  // Estados
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  /**
   * Query: Buscar entrada
   */
  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-entry', entryId],
    queryFn: () => getStockEntryById(entryId),
    enabled: isValidId,
    retry: false, // Não tentar novamente em caso de 404
  });

  /**
   * Mutation: Deletar entrada
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteStockEntry(entryId),
    onSuccess: (result: any) => {
      setShowDeleteDialog(false);

      // Mensagem detalhada sobre o que foi excluído
      const messages = [`Entrada ${result.entry_code} excluída`];

      if (result.orphan_products_deleted > 0) {
        messages.push(`${result.orphan_products_deleted} produto(s) órfão(s) excluído(s)`);
      }

      if (result.total_stock_removed > 0) {
        messages.push(`${result.total_stock_removed} unidades removidas do estoque`);
      }

      // 1. Navegar de volta PRIMEIRO (evita refetch 404)
      handleGoBack();

      // 2. DEPOIS limpar cache (após navegação)
      setTimeout(() => {
        // Remover query específica desta entrada do cache
        queryClient.removeQueries({ queryKey: ['stock-entry', entryId] });

        // Invalidar outras queries para atualizar listas
        queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['active-products'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['low-stock'] });

        // Mostrar mensagem de sucesso
        Alert.alert('Sucesso!', messages.join('\n'));
      }, 100);
    },
    onError: (error: any) => {
      setShowDeleteDialog(false);
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
    setShowDeleteDialog(true);
  };

  /**
   * Confirmar exclusão no diálogo
   */
  const confirmDelete = () => {
    deleteMutation.mutate();
  };

  /**
   * Preparar detalhes da exclusão
   */
  const getDeleteDetails = (): string[] => {
    if (!entry) return [];

    const details: string[] = [];

    details.push(`${entry.total_quantity || 0} unidades de estoque serão removidas`);

    // Contar produtos únicos
    const uniqueProducts = entry.entry_items?.length || 0;
    details.push(`${uniqueProducts} produto(s) vinculado(s) a esta entrada`);

    // Avisar sobre produtos órfãos
    if (uniqueProducts > 0) {
      details.push('⚠️ Produtos que existem APENAS nesta entrada serão excluídos permanentemente');
    }

    details.push('Esta ação não pode ser desfeita');

    return details;
  };

  /**
   * Renderizar badge de tipo
   */
  const renderTypeBadge = (type: EntryType) => {
    const typeConfig: Record<EntryType, { label: string; icon: string }> = {
      [EntryType.TRIP]: { label: 'Viagem', icon: 'car-outline' },
      [EntryType.ONLINE]: { label: 'Online', icon: 'cart-outline' },
      [EntryType.LOCAL]: { label: 'Local', icon: 'business-outline' },
      [EntryType.INITIAL_INVENTORY]: { label: 'Estoque Inicial', icon: 'archive-outline' },
      [EntryType.ADJUSTMENT]: { label: 'Ajuste', icon: 'construct-outline' },
      [EntryType.RETURN]: { label: 'Devolução', icon: 'return-up-back-outline' },
      [EntryType.DONATION]: { label: 'Doação', icon: 'gift-outline' },
    };

    const config = typeConfig[type];

    return (
      <View style={styles.typeBadge}>
        <Ionicons name={config.icon as any} size={16} color="#fff" />
        <Text style={styles.typeBadgeText}>
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
   * Erro: ID inválido ou entrada não encontrada
   */
  if (!isValidId || !entry) {
    const errorMessage = !isValidId 
      ? 'ID de entrada inválido' 
      : 'Entrada não encontrada ou foi excluída';
    
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={64} color={Colors.light.error} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Text style={styles.errorSubtext}>
              A entrada pode ter sido excluída ou o link está incorreto.
            </Text>
            <Button mode="contained" onPress={handleGoBack} style={styles.errorButton}>
              Voltar para Lista
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Garantir que entry existe antes de usar
  const { bestSellers, slowMovers } = analyzeProducts(entry?.entry_items || []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{entry.entry_code}</Text>
            {renderTypeBadge(entry.entry_type)}
          </View>
          <View style={styles.headerPlaceholder} />
        </View>

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
            <Text style={styles.cardTitle}>Informações</Text>

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
            icon="delete"
            textColor={Colors.light.error}
            style={styles.deleteButton}
          >
            Excluir Entrada
          </Button>
        </View>
      </ScrollView>

        {/* Confirm Delete Dialog */}
        <ConfirmDialog
          visible={showDeleteDialog}
          title="Excluir Entrada de Estoque?"
          message={`Você está prestes a excluir a entrada ${entry?.entry_code || ''}. Esta ação terá as seguintes consequências:`}
          details={getDeleteDetails()}
          confirmText="Sim, Excluir"
          cancelText="Cancelar"
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteDialog(false)}
          type="danger"
          icon="trash"
          loading={deleteMutation.isPending}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  errorButton: {
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 16,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#4A90E2', // Azul claro contrastante
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
    marginBottom: 16,
  },
  deleteButton: {
    borderColor: Colors.light.error,
    borderWidth: 1.5,
    borderRadius: 12,
  },
});
