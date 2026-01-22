import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  Text,
  Card,
  Button,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import DetailHeader from '@/components/layout/DetailHeader';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProductById, deleteProduct } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';

export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/products');
  const queryClient = useQueryClient();

  // Validar ID do produto
  const productId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(productId) && productId > 0;

  // Se ID inválido, redirecionar imediatamente
  useEffect(() => {
    if (id && !isValidId) {
      router.replace('/(tabs)/products');
    }
  }, [id, isValidId]);

  // Estados do modal de estoque - REMOVIDOS (agora usa sistema FIFO com Entradas)

  const toBRNumber = (n: number) => {
    try {
      return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    } catch (e) {
      return n.toFixed(2).replace('.', ',');
    }
  };

  const maskCurrencyBR = (text: string) => {
    const digits = (text || '').replace(/\D/g, '');
    if (!digits) return '';
    const number = parseInt(digits, 10);
    const value = (number / 100);
    return toBRNumber(value);
  };

  // Estado para controlar diálogos de confirmação
  const [dialog, setDialog] = useState<{
    visible: boolean;
    type: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {},
  });

  /**
   * Query: Buscar produto
   */
  const { data: product, isLoading, refetch: refetchProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProductById(productId),
    enabled: isValidId,
    retry: false, // Não tentar novamente em caso de 404
  });

  /**
   * Query: Buscar estoque
   */
  const { data: inventory, refetch: refetchInventory } = useQuery({
    queryKey: ['inventory', productId],
    queryFn: () => getProductStock(productId),
    enabled: isValidId,
  });

  /**
   * Estado de refresh
   */
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Função de refresh
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchProduct(), refetchInventory()]);
    setRefreshing(false);
  };

  // Mutation de movimentação de estoque REMOVIDA - agora usa sistema FIFO com Entradas

  /**
   * Mutation: Deletar produto
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(productId),
    onSuccess: () => {
      // Navegar de volta IMEDIATAMENTE
      goBack();

      // Invalidar queries DEPOIS da navegação (com delay para garantir que a tela carregou)
      setTimeout(async () => {
        await Promise.all([
          queryClient.removeQueries({ queryKey: ['product', productId] }),
          queryClient.invalidateQueries({ queryKey: ['products'] }),
          queryClient.invalidateQueries({ queryKey: ['active-products'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
          queryClient.invalidateQueries({ queryKey: ['low-stock'] }),
        ]);
      }, 100);
    },
    onError: (error: any) => {
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Erro',
        message: error.message || 'Erro ao deletar produto',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
    },
  });

  /**
   * Confirmar deleção
   */
  const handleDelete = () => {
    setDialog({
      visible: true,
      type: 'danger',
      title: 'Confirmar exclusão',
      message: `Tem certeza que deseja deletar "${product?.name}"?`,
      confirmText: 'Deletar',
      cancelText: 'Cancelar',
      onConfirm: () => {
        setDialog({ ...dialog, visible: false });
        deleteMutation.mutate();
      },
    });
  };

  // Funções de movimentação de estoque REMOVIDAS - agora usa sistema FIFO com Entradas

  // Verificar ID inválido
  if (!isValidId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
        <Text style={styles.errorTitle}>ID inválido</Text>
        <Text style={styles.errorMessage}>O ID do produto fornecido não é válido.</Text>
        <Text
          style={styles.errorLink}
          onPress={goBack}
        >
          Voltar para produtos
        </Text>
      </View>
    );
  }

  if (isLoading || !product) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando produto...</Text>
        </View>
      </View>
    );
  }

  const currentStock = inventory?.quantity || 0;
  const minStock = product.min_stock_threshold || inventory?.min_stock || 5;
  const isLowStock = currentStock > 0 && currentStock <= minStock;
  const isOutOfStock = currentStock === 0;

  // Preparar badges de status
  const badges = [
    ...(isOutOfStock
      ? [{ icon: 'alert-circle' as const, label: 'SEM ESTOQUE', type: 'error' as const }]
      : isLowStock
      ? [{ icon: 'warning' as const, label: 'ESTOQUE BAIXO', type: 'warning' as const }]
      : [{ icon: 'checkmark-circle' as const, label: 'DISPONÍVEL', type: 'success' as const }]),
    ...(product.brand
      ? [{ icon: 'pricetag' as const, label: product.brand, type: 'info' as const }]
      : []),
  ];

  // Preparar métricas do header
  const metrics = [
    { icon: 'cube-outline' as const, label: 'Estoque', value: `${currentStock} un` },
    { icon: 'cash-outline' as const, label: 'Preço', value: formatCurrency(product.price) },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      <DetailHeader
        title="Detalhes do Produto"
        entityName={product.name}
        backRoute="/(tabs)/products"
        editRoute={`/products/edit/${productId}`}
        onDelete={handleDelete}
        badges={badges}
        metrics={[]}
      />

      <ScrollView 
        style={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.light.primary]}
          />
        }
      >
        {/* Informações principais */}
        <Card style={styles.card}>
        <Card.Content>
          {/* Estoque atual */}
          <View style={styles.stockSection}>
            <View style={styles.stockCard}>
              <View style={styles.stockHeader}>
                <Ionicons name="cube" size={40} color={Colors.light.primary} />
                <View style={styles.stockNumbers}>
                  <Text variant="bodySmall" style={styles.stockLabel}>
                    Estoque Atual
                  </Text>
                  <Text variant="displaySmall" style={styles.stockValue}>
                    {currentStock}
                  </Text>
                  <Text variant="bodySmall" style={styles.stockUnit}>
                    unidades disponíveis
                  </Text>
                </View>
              </View>

              {/* Indicador visual de status */}
              <View style={[
                styles.stockStatusBar,
                isOutOfStock ? styles.stockStatusEmpty :
                isLowStock ? styles.stockStatusLow :
                styles.stockStatusGood
              ]} />
            </View>

            {/* Informação sobre gerenciamento FIFO */}
            <View style={styles.fifoInfoBox}>
              <Ionicons name="layers-outline" size={20} color={Colors.light.primary} />
              <View style={styles.fifoInfoContent}>
                <Text style={styles.fifoInfoTitle}>Gerenciamento FIFO</Text>
                <Text style={styles.fifoInfoText}>
                  Estoque é gerenciado via Entradas. Veja o histórico abaixo ou crie uma nova entrada.
                </Text>
              </View>
            </View>

            {/* Botão para criar nova entrada */}
            <Button
              mode="contained"
              icon="plus-circle-outline"
              onPress={() => router.push('/(tabs)/entries')}
              style={styles.newEntryButton}
              buttonColor={Colors.light.primary}
            >
              Nova Entrada de Estoque
            </Button>
          </View>

          {/* Informações do produto */}
          <View style={styles.infoSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.light.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Detalhes do Produto
              </Text>
            </View>

            <View style={styles.infoGrid}>
              <InfoRow label="SKU:" value={product.sku} />

              {product.barcode && (
                <InfoRow label="Código de Barras:" value={product.barcode} />
              )}

              {product.brand && (
                <InfoRow label="Marca:" value={product.brand} />
              )}

              <InfoRow
                label="Categoria:"
                value={product.category?.name || 'Sem categoria'}
              />

              {product.description && (
                <InfoRow label="Descrição:" value={product.description} />
              )}
            </View>
          </View>

          {/* Preços */}
          <View style={styles.priceSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Informações de Preço
              </Text>
            </View>

            <View style={styles.priceGrid}>
              {product.cost_price && (
                <StatCard
                  label="Custo Unitário"
                  value={formatCurrency(product.cost_price)}
                  icon="trending-down-outline"
                  valueColor="#f57c00"
                />
              )}

              <StatCard
                label="Preço de Venda"
                value={formatCurrency(product.price)}
                icon="pricetag"
                valueColor={Colors.light.primary}
              />

              {product.cost_price && product.cost_price > 0 && (
                <StatCard
                  label="Margem de Lucro"
                  value={(
                    ((product.price - product.cost_price) / product.cost_price) * 100
                  ).toFixed(1)}
                  suffix="%"
                  icon="trending-up"
                  valueColor={Colors.light.success}
                />
              )}
            </View>
          </View>

          {/* Informações adicionais */}
          <View style={styles.additionalInfo}>
            <Text variant="bodySmall" style={styles.additionalText}>
              Estoque mínimo: {minStock} unidades
            </Text>
            <Text variant="bodySmall" style={styles.additionalText}>
              Cadastrado em: {formatDate(product.created_at)}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Histórico FIFO - Entradas do Produto */}
      {product.entry_items && product.entry_items.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Ionicons name="list-outline" size={20} color={Colors.light.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Histórico de Entradas (FIFO)
              </Text>
            </View>

            <Text variant="bodySmall" style={styles.fifoExplanation}>
              Mostra de onde veio o estoque deste produto, ordenado do mais antigo para o mais recente (FIFO).
            </Text>

            {product.entry_items.map((item, index) => (
              <TouchableOpacity
                key={item.entry_item_id}
                style={styles.entryItemCard}
                onPress={() => router.push(`/entries/${item.entry_id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.entryItemHeader}>
                  <View style={styles.entryItemTitleRow}>
                    <Ionicons name="cube-outline" size={18} color={Colors.light.primary} />
                    <Text variant="titleSmall" style={styles.entryCode}>
                      {item.entry_code}
                    </Text>
                    {item.quantity_sold > 0 && (
                      <View style={styles.soldBadge}>
                        <Text style={styles.soldBadgeText}>
                          {item.quantity_sold} vendidos
                        </Text>
                      </View>
                    )}
                  </View>

                  {item.supplier_name && (
                    <Text variant="bodySmall" style={styles.supplierName}>
                      {item.supplier_name}
                    </Text>
                  )}
                </View>

                <View style={styles.entryItemMetrics}>
                  <View style={styles.entryMetric}>
                    <Text style={styles.entryMetricLabel}>Recebido</Text>
                    <Text style={styles.entryMetricValue}>
                      {item.quantity_received} un
                    </Text>
                  </View>

                  <View style={styles.entryMetric}>
                    <Text style={styles.entryMetricLabel}>Restante</Text>
                    <Text style={[
                      styles.entryMetricValue,
                      item.quantity_remaining === 0 && styles.entryMetricValueDepleted
                    ]}>
                      {item.quantity_remaining} un
                    </Text>
                  </View>

                  <View style={styles.entryMetric}>
                    <Text style={styles.entryMetricLabel}>Custo Unit.</Text>
                    <Text style={styles.entryMetricValue}>
                      {formatCurrency(item.unit_cost)}
                    </Text>
                  </View>
                </View>

                <View style={styles.entryItemFooter}>
                  <Text variant="bodySmall" style={styles.entryDate}>
                    {formatDate(item.entry_date)}
                  </Text>
                  <View style={styles.viewEntryButton}>
                    <Text style={styles.viewEntryButtonText}>Ver Entrada</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.light.primary} />
                  </View>
                </View>

                {item.quantity_remaining === 0 && (
                  <View style={styles.depletedOverlay}>
                    <Text style={styles.depletedText}>ESGOTADO</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </Card.Content>
        </Card>
      )}
      </ScrollView>

      {/* Confirm Dialog */}
      <ConfirmDialog
        visible={dialog.visible}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm}
        onCancel={() => setDialog({ ...dialog, visible: false })}
      />
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
  },
  loadingText: {
    marginTop: 12,
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  scrollContent: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 16,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  stockSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  stockCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e9ecef',
  },
  stockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  stockNumbers: {
    flex: 1,
  },
  stockLabel: {
    color: Colors.light.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stockValue: {
    fontWeight: '800',
    color: Colors.light.primary,
    fontSize: 36,
    lineHeight: 42,
  },
  stockUnit: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  stockStatusBar: {
    height: 4,
    borderRadius: 2,
    marginTop: 16,
  },
  stockStatusGood: {
    backgroundColor: Colors.light.success,
  },
  stockStatusLow: {
    backgroundColor: Colors.light.warning,
  },
  stockStatusEmpty: {
    backgroundColor: Colors.light.error,
  },
  fifoInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.light.primary + '10',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
  },
  fifoInfoContent: {
    flex: 1,
  },
  fifoInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  fifoInfoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  newEntryButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  infoSection: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  infoGrid: {
    gap: 12,
  },
  priceSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: Colors.light.text,
  },
  priceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  additionalInfo: {
    gap: 8,
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
  },
  additionalText: {
    color: Colors.light.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  input: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.error,
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 32,
  },
  errorLink: {
    fontSize: 14,
    color: Colors.light.primary,
    marginTop: 16,
    textDecorationLine: 'underline',
  },
  // Histórico FIFO
  fifoExplanation: {
    color: Colors.light.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  entryItemCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
    position: 'relative',
  },
  entryItemHeader: {
    marginBottom: 12,
  },
  entryItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  entryCode: {
    fontWeight: '700',
    color: Colors.light.text,
    fontSize: 15,
  },
  soldBadge: {
    backgroundColor: Colors.light.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 4,
  },
  soldBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  supplierName: {
    color: Colors.light.textSecondary,
    marginLeft: 26,
  },
  entryItemMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginBottom: 12,
  },
  entryMetric: {
    alignItems: 'center',
  },
  entryMetricLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  entryMetricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  entryMetricValueDepleted: {
    color: Colors.light.error,
  },
  entryItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDate: {
    color: Colors.light.textSecondary,
  },
  viewEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewEntryButtonText: {
    color: Colors.light.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  depletedOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.light.error,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
  },
  depletedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
