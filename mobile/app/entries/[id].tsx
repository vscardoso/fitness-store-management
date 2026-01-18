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
  Chip,
  ProgressBar,
  TextInput,
  HelperText,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import { getStockEntryById, deleteStockEntry, updateEntryItem } from '@/services/stockEntryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { EntryType, EntryItemResponse } from '@/types';

// Funções auxiliares para máscara de moeda
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

const unmaskCurrency = (text: string): number => {
  const digits = (text || '').replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
};

export default function StockEntryDetailsScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Validar ID
  const entryId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(entryId) && entryId > 0;

  /**
   * Função para voltar para a tela anterior
   */
  const handleGoBack = () => {
    router.back();
  };

  // Estados
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });
  const [errorDialog, setErrorDialog] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });
  const [deleteSuccessDialog, setDeleteSuccessDialog] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });

  // Estados do modal de edição de item
  const [editItemDialog, setEditItemDialog] = useState<{
    visible: boolean;
    item: EntryItemResponse | null;
  }>({ visible: false, item: null });
  const [editQuantity, setEditQuantity] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editNotes, setEditNotes] = useState('');

  /**
   * Query: Buscar entrada
   */
  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-entry', entryId],
    queryFn: () => getStockEntryById(entryId),
    enabled: isValidId,
    retry: false,
    refetchOnMount: false,
  });

  /**
   * Mutation: Deletar entrada
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteStockEntry(entryId),
    onSuccess: async (result: any) => {
      setShowDeleteDialog(false);

      // Preparar mensagem de sucesso
      const messages = [`Entrada ${result.entry_code} excluída!`];
      if (result.orphan_products_deleted > 0) {
        messages.push(`${result.orphan_products_deleted} produto(s) órfão(s) excluído(s)`);
      }
      if (result.total_stock_removed > 0) {
        messages.push(`${result.total_stock_removed} unidades removidas`);
      }

      // NAVEGAR DE VOLTA IMEDIATAMENTE (antes de invalidar queries)
      router.back();

      // Invalidar queries DEPOIS de sair da tela
      // Usa setTimeout para garantir que a navegação aconteça primeiro
      setTimeout(async () => {
        await Promise.all([
          queryClient.removeQueries({ queryKey: ['stock-entry', entryId] }),
          queryClient.invalidateQueries({ queryKey: ['stock-entries'] }),
          queryClient.invalidateQueries({ queryKey: ['products'] }),
          queryClient.invalidateQueries({ queryKey: ['active-products'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
          queryClient.invalidateQueries({ queryKey: ['low-stock'] }),
        ]);
      }, 100);

      // Mostrar dialog de sucesso
      setDeleteSuccessDialog({
        visible: true,
        message: messages.join(' • '),
      });
    },
    onError: (error: any) => {
      setShowDeleteDialog(false);
      setErrorDialog({
        visible: true,
        message: error.message || 'Erro ao excluir entrada',
      });
    },
  });

  /**
   * Mutation: Atualizar item de entrada
   */
  const updateItemMutation = useMutation({
    mutationFn: (data: { itemId: number; quantity_received?: number; unit_cost?: number; notes?: string }) =>
      updateEntryItem(data.itemId, {
        quantity_received: data.quantity_received,
        unit_cost: data.unit_cost,
        notes: data.notes,
      }),
    onSuccess: async () => {
      setEditItemDialog({ visible: false, item: null });

      // Invalidar queries para atualizar UI
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock-entry', entryId] }),
        queryClient.invalidateQueries({ queryKey: ['stock-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['active-products'] }),
      ]);

      setSuccessDialog({
        visible: true,
        message: 'Item atualizado com sucesso! O inventário foi recalculado automaticamente.',
      });
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Erro ao atualizar item';
      setErrorDialog({
        visible: true,
        message: errorMessage,
      });
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
   * Abrir diálogo de edição de item
   */
  const handleEditItem = (item: EntryItemResponse) => {
    // Verificar se item já teve vendas
    if (item.quantity_sold > 0) {
      setErrorDialog({
        visible: true,
        message: `Este item já teve ${item.quantity_sold} unidade(s) vendida(s). A rastreabilidade FIFO exige que itens com vendas não sejam modificados.`,
      });
      return;
    }

    // Preencher valores atuais com máscara
    setEditQuantity(item.quantity_received.toString());
    setEditCost(toBRNumber(item.unit_cost));
    setEditNotes(item.notes || '');
    setEditItemDialog({ visible: true, item });
  };

  /**
   * Confirmar edição de item
   */
  const confirmEditItem = () => {
    if (!editItemDialog.item) return;

    // Validar quantidade
    const quantity = parseInt(editQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      setErrorDialog({
        visible: true,
        message: 'Quantidade deve ser maior que zero',
      });
      return;
    }

    // Validar custo (desmascarar antes de validar)
    const cost = unmaskCurrency(editCost);
    if (isNaN(cost) || cost < 0) {
      setErrorDialog({
        visible: true,
        message: 'Custo deve ser maior ou igual a zero',
      });
      return;
    }

    // Enviar atualização
    updateItemMutation.mutate({
      itemId: editItemDialog.item.id,
      quantity_received: quantity,
      unit_cost: cost,
      notes: editNotes.trim() || undefined,
    });
  };

  /**
   * Cancelar edição
   */
  const cancelEditItem = () => {
    setEditItemDialog({ visible: false, item: null });
    setEditQuantity('');
    setEditCost('');
    setEditNotes('');
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
      [EntryType.LOCAL]: { label: 'Local', icon: 'storefront-outline' },
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
    const hasSales = item.quantity_sold > 0;

    return (
      <Card key={item.id} style={styles.productCard}>
        <Card.Content>
          <View style={styles.productHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>
                {item.product_name}
              </Text>
              {item.product_sku && (
                <Text style={styles.productSku}>SKU: {item.product_sku}</Text>
              )}
            </View>
            <View style={styles.productHeaderRight}>
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
              <TouchableOpacity
                onPress={() => handleEditItem(item)}
                style={[styles.editButton, hasSales && styles.editButtonDisabled]}
              >
                <Ionicons
                  name={hasSales ? "lock-closed" : "create-outline"}
                  size={20}
                  color={hasSales ? Colors.light.textSecondary : Colors.light.primary}
                />
              </TouchableOpacity>
            </View>
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
                {item.quantity_sold || 0} un
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

          {/* Observações do item */}
          {item.notes && (
            <View style={styles.itemNotesContainer}>
              <Ionicons name="document-text-outline" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.itemNotesText}>{item.notes}</Text>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  /**
   * Loading
   */
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando entrada...</Text>
        </View>
      </View>
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
    );
  }

  // Garantir que entry existe antes de usar
  const { bestSellers, slowMovers } = analyzeProducts(entry?.entry_items || []);

  return (
    <View style={styles.container}>
      {/* Header padrão com gradiente */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={["#667eea", "#764ba2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={handleGoBack} style={styles.backIconButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>{entry.entry_code}</Text>
              <View style={styles.headerSubtitleRow}>
                {renderTypeBadge(entry.entry_type)}
                {entry.has_sales && (
                  <View style={styles.salesProtectionBadge}>
                    <Ionicons name="shield-checkmark" size={14} color="#2E7D32" />
                    <Text style={styles.salesProtectionText}>PROTEGIDA</Text>
                  </View>
                )}
                <Text style={styles.headerSubtitle}>Fornecedor: {entry.supplier_name}</Text>
              </View>
            </View>
            <View style={styles.headerPlaceholder} />
          </View>
        </LinearGradient>
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
            icon="trending-up"
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
                    <Text style={styles.rankName}>{item.product_name}</Text>
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
                    <Text style={styles.rankName}>{item.product_name}</Text>
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
          {/* Tooltip explicativo quando tem vendas */}
          {entry.has_sales && (
            <View style={styles.protectionInfo}>
              <Ionicons name="information-circle" size={16} color={Colors.light.primary} />
              <Text style={styles.protectionInfoText}>
                Esta entrada não pode ser excluída pois possui {entry.items_sold} unidade(s) já vendida(s).
                Entradas com vendas são mantidas como histórico para rastreabilidade FIFO.
              </Text>
            </View>
          )}

          <Button
            mode="outlined"
            onPress={handleDelete}
            disabled={entry.has_sales || deleteMutation.isPending}
            loading={deleteMutation.isPending}
            icon="delete"
            textColor={entry.has_sales ? Colors.light.textSecondary : Colors.light.error}
            style={[
              styles.deleteButton,
              entry.has_sales && styles.deleteButtonDisabled
            ]}
          >
            {entry.has_sales ? 'Não Pode Excluir (Com Vendas)' : 'Excluir Entrada'}
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

        {/* Dialog de Sucesso - Edição de Item */}
        <ConfirmDialog
          visible={successDialog.visible}
          title="Sucesso"
          message={successDialog.message}
          confirmText="OK"
          onConfirm={() => setSuccessDialog({ visible: false, message: '' })}
          onCancel={() => setSuccessDialog({ visible: false, message: '' })}
          type="success"
          icon="checkmark-circle"
        />

        {/* Dialog de Erro */}
        <ConfirmDialog
          visible={errorDialog.visible}
          title="Erro"
          message={errorDialog.message}
          confirmText="OK"
          onConfirm={() => setErrorDialog({ visible: false, message: '' })}
          onCancel={() => setErrorDialog({ visible: false, message: '' })}
          type="danger"
          icon="alert-circle"
        />

        {/* Dialog de Sucesso após Exclusão */}
        <ConfirmDialog
          visible={deleteSuccessDialog.visible}
          title="Entrada Excluída"
          message={deleteSuccessDialog.message}
          confirmText="OK"
          onConfirm={() => setDeleteSuccessDialog({ visible: false, message: '' })}
          onCancel={() => setDeleteSuccessDialog({ visible: false, message: '' })}
          type="success"
          icon="checkmark-circle"
        />

        {/* Modal de Edição de Item */}
        <CustomModal
          visible={editItemDialog.visible}
          onDismiss={cancelEditItem}
          title="Editar Item da Entrada"
          subtitle={editItemDialog.item?.product_name}
        >
          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={20} color={Colors.light.primary} />
            <Text style={styles.warningText}>
              Ao editar quantidade ou custo, o inventário será recalculado automaticamente.
            </Text>
          </View>

          <TextInput
            label="Quantidade Recebida *"
            value={editQuantity}
            onChangeText={setEditQuantity}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            placeholder="Digite a quantidade"
          />

          <TextInput
            label="Custo Unitário (R$) *"
            value={editCost}
            onChangeText={(text) => setEditCost(maskCurrencyBR(text))}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            placeholder="0,00"
            left={<TextInput.Affix text="R$" />}
          />

          <TextInput
            label="Observações"
            value={editNotes}
            onChangeText={setEditNotes}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
            placeholder="Observações sobre este item (opcional)"
          />

          <ModalActions
            onCancel={cancelEditItem}
            onConfirm={confirmEditItem}
            cancelText="Cancelar"
            confirmText="Salvar Alterações"
            loading={updateItemMutation.isPending}
            confirmColor={Colors.light.primary}
          />
        </CustomModal>

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
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: '#fff',
    opacity: 0.9,
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
  salesProtectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  salesProtectionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E7D32',
    textTransform: 'uppercase',
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
  productHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  productSku: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonDisabled: {
    backgroundColor: Colors.light.border + '50',
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
  protectionInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.light.primary + '10',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  protectionInfoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 18,
  },
  deleteButton: {
    borderColor: Colors.light.error,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  deleteButtonDisabled: {
    borderColor: Colors.light.border,
    opacity: 0.5,
  },
  itemNotesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  itemNotesText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.light.primary + '10',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 18,
  },
  input: {
    marginBottom: 16,
  },
});
