import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  TextInput,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import { getProductById, deleteProduct } from '@/services/productService';
import { addStock, removeStock, getProductStock } from '@/services/inventoryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { MovementType } from '@/types';

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

  // Estados do modal de estoque
  const [stockModalVisible, setStockModalVisible] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>(MovementType.IN);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

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

  /**
   * Mutation: Movimentar estoque
   */
  const stockMutation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(quantity);
      
      // Validação básica no frontend
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Quantidade inválida');
      }
      
      const movement = {
        product_id: productId,
        movement_type: movementType,
        quantity: qty,
        notes: notes.trim() || undefined,
      };

      // Validar estoque antes de remover
      if (movementType === MovementType.OUT) {
        // Refetch direto do servidor para evitar estado stale
        try {
          const fresh = await getProductStock(productId);
          const serverStock = fresh.quantity;
          if (qty > serverStock) {
            throw new Error(
              `Estoque insuficiente. Disponível (servidor): ${serverStock}, Solicitado: ${qty}`
            );
          }
        } catch (e) {
          // Se falhar, usar cache como fallback
          const currentStock = inventory?.quantity || 0;
          if (qty > currentStock) {
            throw new Error(
              `Estoque insuficiente (fallback). Disponível: ${currentStock}, Solicitado: ${qty}`
            );
          }
        }
      }

      if (movementType === MovementType.IN) {
        return addStock(movement);
      } else {
        return removeStock(movement);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setStockModalVisible(false);
      setQuantity('');
      setNotes('');
      Alert.alert('Sucesso!', 'Estoque atualizado');
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || error.message || 'Erro ao atualizar estoque';
      Alert.alert('Erro', errorMessage);
    },
  });

  /**
   * Mutation: Deletar produto
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      Alert.alert('Sucesso!', 'Produto deletado', [
        {
          text: 'OK',
          onPress: () => goBack(),
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.message || 'Erro ao deletar produto');
    },
  });

  /**
   * Confirmar deleção
   */
  const handleDelete = () => {
    Alert.alert(
      'Confirmar exclusão',
      `Tem certeza que deseja deletar "${product?.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  /**
   * Abrir modal de estoque
   */
  const handleStockModal = (type: MovementType) => {
    setMovementType(type);
    setQuantity('');
    setNotes('');
    setStockModalVisible(true);
  };

  /**
   * Fechar modal
   */
  const handleCloseModal = () => {
    setStockModalVisible(false);
    setQuantity('');
    setNotes('');
  };

  /**
   * Salvar movimentação
   */
  const handleSaveStock = () => {
    if (!quantity || parseInt(quantity) <= 0) {
      Alert.alert('Atenção', 'Informe uma quantidade válida');
      return;
    }

    stockMutation.mutate();
  };

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
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={{ marginTop: 16, color: '#666' }}>Carregando produto...</Text>
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header com gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, '#7c4dff']}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={goBack}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Detalhes do Produto</Text>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => router.push(`/products/edit/${productId}`)}
                style={styles.actionButton}
              >
                <Ionicons name="pencil" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
                <Ionicons name="trash" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerEntityName}>{product.name}</Text>

            {/* Badges de status */}
            {badges.length > 0 && (
              <View style={styles.badges}>
                {badges.map((badge, index) => (
                  <View key={index} style={[styles.badge,
                    badge.type === 'success' ? styles.badgeSuccess :
                    badge.type === 'warning' ? styles.badgeWarning :
                    badge.type === 'error' ? styles.badgeError : styles.badgeInfo
                  ]}>
                    <Ionicons
                      name={badge.icon}
                      size={14}
                      color="#fff"
                      style={styles.badgeIcon}
                    />
                    <Text style={styles.badgeText}>{badge.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Métricas principais */}
            <View style={styles.metrics}>
              <View style={styles.metricCard}>
                <Ionicons name="cube-outline" size={20} color="#fff" style={styles.metricIcon} />
                <Text style={styles.metricLabel}>Estoque</Text>
                <Text style={styles.metricValue}>{currentStock} un</Text>
              </View>
              <View style={styles.metricCard}>
                <Ionicons name="cash-outline" size={20} color="#fff" style={styles.metricIcon} />
                <Text style={styles.metricLabel}>Preço</Text>
                <Text style={styles.metricValue}>{formatCurrency(product.price)}</Text>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>

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

            {/* Botões de movimentação */}
            <View style={styles.stockButtons}>
              <Button
                mode="contained"
                icon="plus"
                onPress={() => handleStockModal(MovementType.IN)}
                style={styles.stockButton}
                buttonColor={Colors.light.success}
                contentStyle={styles.buttonContent}
              >
                Adicionar
              </Button>
              <Button
                mode="contained"
                icon="minus"
                onPress={() => handleStockModal(MovementType.OUT)}
                style={styles.stockButton}
                buttonColor={Colors.light.error}
                contentStyle={styles.buttonContent}
                disabled={currentStock === 0}
              >
                Remover
              </Button>
            </View>
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

      {/* Modal de movimentação de estoque */}
      <CustomModal
        visible={stockModalVisible}
        onDismiss={handleCloseModal}
        title={movementType === MovementType.IN ? 'Entrada de Estoque' : 'Saída de Estoque'}
        subtitle={`${product.name} • Estoque atual: ${currentStock} unidades`}
      >
        <TextInput
          label="Quantidade *"
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
          placeholder="Digite a quantidade"
          autoFocus
        />

        <TextInput
          label="Observações (opcional)"
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          style={styles.input}
          placeholder="Motivo da movimentação"
          multiline
          numberOfLines={3}
        />

        <ModalActions
          onCancel={handleCloseModal}
          onConfirm={handleSaveStock}
          cancelText="Cancelar"
          confirmText="Salvar"
          loading={stockMutation.isPending}
          confirmColor={
            movementType === MovementType.IN
              ? Colors.light.success
              : Colors.light.error
          }
        />
      </CustomModal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  // Header com gradiente
  headerGradient: {
    paddingTop: 0, // SafeArea já cuidou do espaço
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  headerContent: {
    marginTop: 24, // Espaço após SafeArea
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: '#fff',
    marginHorizontal: theme.spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
  },
  headerInfo: {
    alignItems: 'center',
  },
  headerEntityName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: '#fff',
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
  },
  badgeWarning: {
    backgroundColor: 'rgba(255, 152, 0, 0.9)',
  },
  badgeError: {
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
  },
  badgeInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgeIcon: {
    marginRight: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  metrics: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  metricIcon: {
    marginBottom: 6,
  },
  metricLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  stockButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  stockButton: {
    flex: 1,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 8,
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
});
