import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
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
import PageHeader from '@/components/layout/PageHeader';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProductById, deleteProduct } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useTutorialContext } from '@/components/tutorial';

export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/products');
  const queryClient = useQueryClient();
  const { startTutorial } = useTutorialContext();

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
   * Query: Buscar produto por ID (funciona para produtos ativos e do catálogo)
   */
  const { data: product, isLoading, refetch: refetchProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProductById(productId),
    enabled: isValidId,
    retry: false,
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

  return (
    <View style={styles.container}>
      <PageHeader
        title={product.name}
        subtitle={[product.brand, product.color, product.size].filter(Boolean).join(' • ') || 'Produto'}
        showBackButton
        onBack={goBack}
        rightActions={[
          { icon: 'help-circle-outline', onPress: () => startTutorial('product-details') },
          { icon: 'pencil', onPress: () => router.push(`/products/edit/${productId}` as any) },
          { icon: 'trash', onPress: handleDelete },
        ]}
      />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.light.primary]}
          />
        }
      >
        {/* Card de Estoque */}
        <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.cardTitle}>Estoque</Text>
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
            <View style={styles.modernInfoBox}>
              <Ionicons name="cube-outline" size={20} color={Colors.light.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Controle de Estoque</Text>
                <Text style={styles.infoText}>
                  Gerencie seu estoque de forma inteligente com controle automático.
                </Text>
              </View>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Card de Informações do Produto */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Detalhes do Produto</Text>
          </View>

          <View style={styles.infoGrid}>
            <InfoRow label="SKU:" value={product.sku} />

            {product.barcode && (
              <InfoRow label="Código de Barras:" value={product.barcode} />
            )}

            {product.brand && (
              <InfoRow label="Marca:" value={product.brand} />
            )}

            {product.color && (
              <InfoRow label="Cor:" value={product.color} />
            )}

            {product.size && (
              <InfoRow label="Tamanho:" value={product.size} />
            )}

            <InfoRow
              label="Categoria:"
              value={product.category?.name || 'Sem categoria'}
            />

            {product.description && (
              <InfoRow label="Descrição:" value={product.description} />
            )}
          </View>
        </Card.Content>
      </Card>

      {/* Card de Preços */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Informações de Preço</Text>
          </View>

          <View style={styles.priceGrid}>
            {product.cost_price && (
              <StatCard
                label="Custo Unitário"
                value={formatCurrency(product.cost_price)}
                icon="trending-down-outline"
                valueColor={Colors.light.warning}
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

      {/* Card de Etiqueta */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <Ionicons name="qr-code-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Etiqueta do Produto</Text>
          </View>

          <View style={styles.labelInfoBox}>
            <Ionicons name="print-outline" size={24} color={Colors.light.primary} />
            <View style={styles.labelInfoContent}>
              <Text style={styles.labelInfoTitle}>Gerar Etiqueta com QR Code</Text>
              <Text style={styles.labelInfoText}>
                Crie etiquetas com QR Code para facilitar a identificação e venda do produto.
              </Text>
            </View>
          </View>

          <Button
            mode="contained"
            onPress={() => router.push(`/products/label/${productId}` as any)}
            icon="qrcode"
            style={styles.generateLabelButton}
          >
            Gerar Etiqueta
          </Button>
        </Card.Content>
      </Card>

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
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 16,
  },
  stockSection: {
    marginTop: 0,
    marginBottom: 0,
  },
  stockCard: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  stockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
  modernInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.light.primary,
    marginBottom: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  movementItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    marginBottom: 8,
  },
  movementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  movementTypeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  movementType: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  movementQuantity: {
    fontSize: 14,
    fontWeight: '700',
  },
  movementDate: {
    fontSize: 12,
    color: Colors.light.textTertiary,
  },
  fifoInfoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  infoGrid: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  priceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  additionalInfo: {
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 8,
    borderLeftWidth: 3,
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
    color: Colors.light.textSecondary,
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
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
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
    borderTopColor: Colors.light.border,
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
  // Label section
  labelInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    marginBottom: 16,
  },
  labelInfoContent: {
    flex: 1,
  },
  labelInfoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  labelInfoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  generateLabelButton: {
    borderRadius: 12,
  },
});
