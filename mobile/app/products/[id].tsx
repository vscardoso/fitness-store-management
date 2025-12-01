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
  TextInput,
  HelperText,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import DetailHeader from '@/components/layout/DetailHeader';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProductById, deleteProduct, adjustProductQuantity } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
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
  const [increaseUnitCost, setIncreaseUnitCost] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [costError, setCostError] = useState('');

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

      // Buscar estoque atual (mais fresco possível)
      let current = inventory?.quantity || 0;
      try {
        const fresh = await getProductStock(productId);
        current = fresh.quantity || current;
      } catch {}

      const newQty = movementType === MovementType.IN ? current + qty : current - qty;
      if (newQty < 0) {
        throw new Error('Estoque insuficiente para esta saída');
      }

      const payload: any = {
        new_quantity: newQty,
        reason: notes.trim() || (movementType === MovementType.IN ? 'Entrada manual' : 'Saída manual'),
      };

      // Usa o endpoint que respeita FIFO e atualiza EntryItems
      return adjustProductQuantity(productId, payload);
    },
    onSuccess: async () => {
      // Invalidar e refetch imediato para garantir dados frescos
      await queryClient.invalidateQueries({ queryKey: ['product', productId] });
      await queryClient.invalidateQueries({ queryKey: ['inventory', productId] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      
      // Refetch explícito para forçar atualização
      await refetchProduct();
      await refetchInventory();
      
      setStockModalVisible(false);
      setQuantity('');
      setNotes('');
        setIncreaseUnitCost('');
      setDialog({
        visible: true,
        type: 'success',
        title: 'Sucesso!',
        message: 'Estoque atualizado com sucesso',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || error.message || 'Erro ao atualizar estoque';
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Erro',
        message: errorMessage,
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
    },
  });

  /**
   * Mutation: Deletar produto
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDialog({
        visible: true,
        type: 'success',
        title: 'Sucesso!',
        message: 'Produto deletado com sucesso',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => {
          setDialog({ ...dialog, visible: false });
          goBack();
        },
      });
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

  /**
   * Abrir modal de estoque
   */
  const handleStockModal = (type: MovementType) => {
    setMovementType(type);
    setQuantity('');
    setNotes('');
    setQuantityError('');
    setStockModalVisible(true);
  };

  /**
   * Fechar modal
   */
  const handleCloseModal = () => {
    setStockModalVisible(false);
    setQuantity('');
    setNotes('');
    setQuantityError('');
  };

  /**
   * Salvar movimentação
   */
  const handleSaveStock = () => {
    if (!quantity || parseInt(quantity) <= 0) {
      setQuantityError('Informe uma quantidade válida (> 0)');
      return;
    }

    // Confirmação explicando o impacto
    const qty = parseInt(quantity);
    const curr = inventory?.quantity || 0;
    const target = movementType === MovementType.IN ? curr + qty : curr - qty;
    const impact = movementType === MovementType.IN ? 'AUMENTAR' : 'REDUZIR';


    // Fechar o modal antes de abrir a confirmação (evita sobreposição/z-index)
    setStockModalVisible(false);

    const extra = '';

    // Pequeno delay garante que o modal fechou antes de abrir o diálogo
    setTimeout(() => {
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Confirmar ajuste de estoque',
        message: `Isso irá ${impact} o estoque de ${curr} para ${target}.\nEste ajuste atualiza a base FIFO e afeta os valores do dashboard.${extra}`,
        confirmText: 'Sim, aplicar',
        cancelText: 'Cancelar',
        onConfirm: () => {
          setDialog({ ...dialog, visible: false });
          stockMutation.mutate();
        },
      });
    }, 100);
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
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
      </ScrollView>

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
          onChangeText={(t) => { setQuantity(t); if (quantityError) setQuantityError(''); }}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
          placeholder="Digite a quantidade"
          autoFocus
          error={!!quantityError}
        />
        {quantityError ? (
          <HelperText type="error" visible={true}>
            {quantityError}
          </HelperText>
        ) : null}


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
