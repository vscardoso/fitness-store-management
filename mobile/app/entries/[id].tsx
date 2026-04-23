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

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  TextInput as RNTextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import PageHeader from '@/components/layout/PageHeader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import BottomSheet from '@/components/ui/BottomSheet';
import useBackToList from '@/hooks/useBackToList';
import { getStockEntryById, deleteStockEntry, updateEntryItem, correctEntryItem } from '@/services/stockEntryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { toBRNumber, maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import EmptyState from '@/components/ui/EmptyState';
import { useBrandingColors } from '@/store/brandingStore';
import { EntryType, EntryItemResponse } from '@/types';

export default function StockEntryDetailsScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/entries');
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  // Validar ID
  const entryId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(entryId) && entryId > 0;

  // ── Animações de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(20);

  useFocusEffect(useCallback(() => {
    headerOpacity.value  = 0;
    headerScale.value    = 0.94;
    contentOpacity.value = 0;
    contentTransY.value  = 20;
    headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
    headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
    const t = setTimeout(() => {
      contentOpacity.value = withTiming(1, { duration: 340 });
      contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
    }, 140);
    return () => clearTimeout(t);
  }, []));

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  /**
   * Função para voltar para a tela anterior
   * Respeita o parâmetro `from` para navegação rastreada (ex: vindo de produto)
   */
  const handleGoBack = () => {
    if (from) {
      router.push(from as any);
    } else {
      goBack();
    }
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

  // Estados do modal de edição de item
  const [editItemDialog, setEditItemDialog] = useState<{
    visible: boolean;
    item: EntryItemResponse | null;
  }>({ visible: false, item: null });
  const [editQuantity, setEditQuantity] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Correção auditada
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [correctionItem, setCorrectionItem] = useState<EntryItemResponse | null>(null);
  const [correctionDiff, setCorrectionDiff] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionInlineError, setCorrectionInlineError] = useState('');

  /**
   * Query: Buscar entrada
   */
  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-entry', entryId],
    queryFn: () => getStockEntryById(entryId),
    enabled: isValidId,
    retry: false,
    refetchOnMount: 'always', // Sempre busca dados frescos ao abrir a tela
  });

  /**
   * Mutation: Deletar entrada
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteStockEntry(entryId),
    onSuccess: (result: any) => {
      setShowDeleteDialog(false);

      // Preparar mensagem de sucesso
      const messages = [`Entrada ${result.entry_code} excluída!`];
      if (result.orphan_products_deleted > 0) {
        messages.push(`${result.orphan_products_deleted} produto(s) órfão(s) excluído(s)`);
      }
      if (result.total_stock_removed > 0) {
        messages.push(`${result.total_stock_removed} unidades removidas`);
      }

      // Navega diretamente para a lista e deixa o refresh acontecer na tela correta.
      router.replace({
        pathname: '/(tabs)/entries',
        params: {
          deleteSuccessMessage: messages.join(' • '),
          deleteSuccessNonce: String(Date.now()),
        },
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
    mutationFn: (data: { itemId: number; quantity_received?: number; unit_cost?: number; sell_price?: number; notes?: string }) =>
      updateEntryItem(data.itemId, {
        quantity_received: data.quantity_received,
        unit_cost: data.unit_cost,
        sell_price: data.sell_price,
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
      setEditItemDialog({ visible: false, item: null });
      const errorMessage = error.message || 'Erro ao atualizar item';
      setErrorDialog({
        visible: true,
        message: errorMessage,
      });
    },
  });

  const correctionMutation = useMutation({
    mutationFn: ({ itemId, diff, reason }: { itemId: number; diff: number; reason: string }) =>
      correctEntryItem(itemId, diff, reason),
    onSuccess: async (result: any) => {
      setShowCorrectionDialog(false);
      setCorrectionItem(null);
      setCorrectionDiff('');
      setCorrectionReason('');
      setCorrectionInlineError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock-entry', entryId] }),
        queryClient.invalidateQueries({ queryKey: ['stock-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
      setSuccessDialog({ visible: true, message: result.message });
    },
    onError: (error: any) => {
      setCorrectionInlineError(error.message || 'Erro ao corrigir item');
    },
  });

  const handleConfirmCorrection = () => {
    if (!correctionItem) return;
    const diff = parseInt(correctionDiff);
    if (isNaN(diff) || diff === 0) {
      setCorrectionInlineError('Informe uma diferença válida (positiva ou negativa).');
      return;
    }
    if (!correctionReason.trim() || correctionReason.trim().length < 5) {
      setCorrectionInlineError('Informe o motivo da correção (mínimo 5 caracteres).');
      return;
    }
    setCorrectionInlineError('');
    correctionMutation.mutate({ itemId: correctionItem.id, diff, reason: correctionReason.trim() });
  };

  const adjustCorrectionDiff = (delta: number) => {
    const current = parseInt(correctionDiff, 10);
    const safeCurrent = Number.isNaN(current) ? 0 : current;
    setCorrectionDiff(String(safeCurrent + delta));
  };

  const closeCorrectionDialog = () => {
    if (correctionMutation.isPending) return;
    setShowCorrectionDialog(false);
    setCorrectionItem(null);
    setCorrectionDiff('');
    setCorrectionReason('');
    setCorrectionInlineError('');
  };

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
    // Item com vendas → abrir modal de correção auditada
    if (item.quantity_sold > 0) {
      setCorrectionItem(item);
      setCorrectionDiff('0');
      setCorrectionReason('');
      setCorrectionInlineError('');
      setShowCorrectionDialog(true);
      return;
    }

    // Preencher valores atuais
    // unit_cost pode vir como string Decimal do backend ("15.50"), number ou 0
    const costNum = parseFloat(String(item.unit_cost).replace(',', '.')) || 0;
    const priceNum = parseFloat(String(item.product_price ?? 0).replace(',', '.')) || 0;
    console.log('[EditItem] unit_cost raw:', item.unit_cost, '→ parsed:', costNum);

    setEditQuantity(item.quantity_received.toString());
    setEditCost(costNum > 0 ? costNum.toFixed(2).replace('.', ',') : '');
    setEditPrice(priceNum > 0 ? priceNum.toFixed(2).replace('.', ',') : '');
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

    // Validar preço de venda (desmascarar antes de validar)
    const price = unmaskCurrency(editPrice);
    if (isNaN(price) || price < 0) {
      setErrorDialog({
        visible: true,
        message: 'Preço de venda deve ser maior ou igual a zero',
      });
      return;
    }

    // Enviar atualização
    updateItemMutation.mutate({
      itemId: editItemDialog.item.id,
      quantity_received: quantity,
      unit_cost: cost,
      sell_price: price,
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
    setEditPrice('');
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
   * Renderizar badge de tipo usando Badge unificado
   */
  const renderTypeBadge = (type: EntryType) => {
    const typeConfig: Record<EntryType, { label: string; variant: 'info' | 'warning' | 'success' | 'neutral'; icon: keyof typeof Ionicons.glyphMap }> = {
      [EntryType.TRIP]:              { label: 'Viagem',       variant: 'info',    icon: 'car-outline'           },
      [EntryType.ONLINE]:            { label: 'Online',       variant: 'warning', icon: 'cart-outline'          },
      [EntryType.LOCAL]:             { label: 'Local',        variant: 'success', icon: 'storefront-outline'    },
      [EntryType.INITIAL_INVENTORY]: { label: 'Est. Inicial', variant: 'neutral', icon: 'archive-outline'       },
      [EntryType.ADJUSTMENT]:        { label: 'Ajuste',       variant: 'neutral', icon: 'construct-outline'     },
      [EntryType.RETURN]:            { label: 'Devolução',    variant: 'neutral', icon: 'return-up-back-outline'},
      [EntryType.DONATION]:          { label: 'Doação',       variant: 'neutral', icon: 'gift-outline'          },
    };
    const config = typeConfig[type];
    return <Badge label={config.label} variant={config.variant} icon={config.icon} size="md" />;
  };

  const statusConfig: Record<string, { label: string; variant: any; icon: keyof typeof Ionicons.glyphMap }> = {
    open:     { label: 'Aberta',    variant: 'success', icon: 'checkmark-circle' },
    partial:  { label: 'Parcial',   variant: 'warning', icon: 'time' },
    sold_out: { label: 'Esgotada',  variant: 'neutral', icon: 'archive' },
    archived: { label: 'Arquivada', variant: 'neutral', icon: 'lock-closed' },
  };

  const renderStatusBadge = (status?: string) => {
    const cfg = statusConfig[status ?? 'open'] ?? statusConfig.open;
    return <Badge label={cfg.label} variant={cfg.variant} icon={cfg.icon} size="md" uppercase />;
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
    const depletionRate = item.quantity_received > 0
      ? ((item.quantity_received - item.quantity_remaining) / item.quantity_received) * 100
      : 0;
    const isSlowMover = depletionRate < 30 && item.quantity_remaining > 0;
    const isBestSeller = depletionRate >= 70;
    const hasSales = item.quantity_sold > 0;
    const progressColor = depletionRate >= 70 ? Colors.light.success : depletionRate >= 40 ? Colors.light.warning : Colors.light.error;

    return (
      <View key={item.id} style={styles.productCard}>
        {/* Header: nome + chips + ação */}
        <View style={styles.productHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.productName} numberOfLines={2}>{item.product_name}</Text>
            {item.variant_label && (
              <Text style={styles.variantLabel} numberOfLines={1}>{item.variant_label}</Text>
            )}
            {item.product_sku && (
              <Text style={styles.productSku} numberOfLines={1}>SKU: {item.product_sku}</Text>
            )}
          </View>
          <View style={styles.productHeaderRight}>
            {isBestSeller && (
              <View style={[styles.productChip, { backgroundColor: Colors.light.success + '18' }]}>
                <Ionicons name="trophy" size={11} color={Colors.light.success} />
                <Text style={[styles.productChipText, { color: Colors.light.success }]}>Top</Text>
              </View>
            )}
            {isSlowMover && (
              <View style={[styles.productChip, { backgroundColor: Colors.light.warning + '18' }]}>
                <Ionicons name="alert" size={11} color={Colors.light.warning} />
                <Text style={[styles.productChipText, { color: Colors.light.warning }]}>Parado</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => handleEditItem(item)}
              style={[styles.editItemButton, { borderColor: hasSales ? Colors.light.warning + '40' : brandingColors.primary + '30', backgroundColor: hasSales ? Colors.light.warning + '12' : brandingColors.primary + '12' }]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={hasSales ? 'construct-outline' : 'create-outline'}
                size={14}
                color={hasSales ? Colors.light.warning : brandingColors.primary}
              />
              <Text style={[styles.editItemButtonText, { color: hasSales ? Colors.light.warning : brandingColors.primary }]}>
                {hasSales ? 'Corrigir' : 'Editar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Métricas */}
        <View style={styles.productMetrics}>
          <View style={styles.productMetricItem}>
            <Text style={styles.productMetricLabel}>COMPRADO</Text>
            <Text style={styles.productMetricValue}>{item.quantity_received} un</Text>
          </View>
          <View style={[styles.productMetricItem, styles.productMetricCenter]}>
            <Text style={styles.productMetricLabel}>VENDIDO</Text>
            <Text style={[styles.productMetricValue, { color: Colors.light.success }]}>
              {item.quantity_sold || 0} un
            </Text>
          </View>
          <View style={[styles.productMetricItem, { alignItems: 'flex-end' }]}>
            <Text style={styles.productMetricLabel}>RESTANTE</Text>
            <Text style={[styles.productMetricValue, { color: item.quantity_remaining === 0 ? Colors.light.textTertiary : Colors.light.warning }]}>
              {item.quantity_remaining} un
            </Text>
          </View>
        </View>

        {/* Sell-Through */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Sell-Through</Text>
            <Text style={[styles.progressPercentage, { color: progressColor }]}>
              {depletionRate.toFixed(1)}%
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${Math.min(depletionRate, 100)}%` as any, backgroundColor: progressColor }]} />
          </View>
        </View>

        {/* Footer: custo + total */}
        <View style={styles.productFooter}>
          <View style={styles.productFooterItem}>
            <Text style={styles.productMetricLabel}>CUSTO UNIT.</Text>
            <Text style={[styles.productMetricValue, { color: VALUE_COLORS.neutral }]}>{formatCurrency(item.unit_cost)}</Text>
          </View>
          <View style={[styles.productFooterItem, { alignItems: 'flex-end' }]}>
            <Text style={styles.productMetricLabel}>TOTAL</Text>
            <Text style={[styles.productMetricValue, { color: VALUE_COLORS.negative, flexShrink: 0 }]}>{formatCurrency(item.total_cost)}</Text>
          </View>
        </View>

        {/* Observações */}
        {item.notes && (
          <View style={styles.itemNotesContainer}>
            <Ionicons name="document-text-outline" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.itemNotesText} numberOfLines={3}>{item.notes}</Text>
          </View>
        )}
      </View>
    );
  };

  /**
   * Loading
   */
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
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
          <TouchableOpacity onPress={handleGoBack} style={styles.errorButton} activeOpacity={0.8}>
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.errorButtonGradient}
            >
              <Text style={styles.errorButtonText}>Voltar para Lista</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Garantir que entry existe antes de usar
  const { bestSellers, slowMovers } = analyzeProducts(entry?.entry_items || []);

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title={entry.entry_code}
          subtitle={`Fornecedor: ${entry.supplier_name}`}
          showBackButton
          onBack={handleGoBack}
        />
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
        {/* Info Básica */}
        <View style={styles.card}>
            <Text style={styles.cardTitle}>Informações</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              {renderTypeBadge(entry.entry_type)}
              {renderStatusBadge(entry.entry_status)}
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
        </View>

        {/* KPIs */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Custo Total"
            value={formatCurrency(entry.total_cost)}
            icon="cash-outline"
            valueColor={Colors.light.text}
          />
          <StatCard
            label="Total Items"
            value={`${entry.total_items} (${entry.total_quantity} un)`}
            icon="cube-outline"
            valueColor={Colors.light.text}
          />
          <StatCard
            label="Vendidos"
            value={`${entry.items_sold}`}
            icon="cart-outline"
            valueColor={Colors.light.success}
          />
          <StatCard
            label="Taxa de Venda"
            value={`${entry.sell_through_rate.toFixed(1)}%`}
            icon="trending-up"
            valueColor={entry.sell_through_rate >= 70 ? Colors.light.success : entry.sell_through_rate >= 40 ? Colors.light.warning : Colors.light.error}
          />
          {entry.roi !== null && entry.roi !== undefined && (
            <StatCard
              label="Retorno"
              value={`${entry.roi >= 0 ? '+' : ''}${entry.roi.toFixed(1)}%`}
              icon="analytics-outline"
              valueColor={entry.roi >= 0 ? Colors.light.success : Colors.light.error}
            />
          )}
        </View>

        {/* Best Sellers */}
        {bestSellers.length > 0 && (
          <View style={styles.card}>
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
          </View>
        )}

        {/* Slow Movers */}
        {slowMovers.length > 0 && (
          <View style={styles.card}>
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
          </View>
        )}

        {/* Lista de Produtos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleLarge}>
            Produtos ({entry.entry_items?.length || 0})
          </Text>
          {entry.entry_items && entry.entry_items.length > 0 ? (
            entry.entry_items.map(renderProductItem)
          ) : (
            <EmptyState
              icon="cube-outline"
              title="Nenhum produto"
              description="Nenhum produto nesta entrada"
            />
          )}
        </View>

        {entry.has_sales && (
          <View style={styles.compactNoticeRow}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.compactNoticeText}>
              Exclusão indisponível: esta entrada possui {entry.items_sold} unidade(s) vendida(s).
            </Text>
          </View>
        )}

        {/* Ações */}
        {!entry.has_sales && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.dangerActionButton]}
              onPress={handleDelete}
              activeOpacity={0.75}
              disabled={deleteMutation.isPending}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.light.error} />
              <Text style={styles.dangerActionButtonText}>
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir Entrada'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

        {/* Modal de Correção Auditada */}
        <BottomSheet
          visible={showCorrectionDialog}
          onDismiss={closeCorrectionDialog}
          dismissOnBackdrop={!correctionMutation.isPending}
          title="Corrigir Item"
          subtitle={correctionItem
            ? `${correctionItem.product_name} • Vendidas: ${correctionItem.quantity_sold} • Disponíveis: ${correctionItem.quantity_remaining}`
            : undefined}
          icon="construct-outline"
          actions={[
            {
              label: 'Cancelar',
              onPress: closeCorrectionDialog,
              variant: 'secondary',
              disabled: correctionMutation.isPending,
            },
            { label: 'Aplicar', onPress: handleConfirmCorrection, icon: 'checkmark-circle-outline', loading: correctionMutation.isPending },
          ]}
        >
          <Text style={styles.inputLabel}>Ajuste de quantidade</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              onPress={() => adjustCorrectionDiff(-1)}
              style={styles.stepperButton}
              activeOpacity={0.8}
              accessibilityLabel="Remover uma unidade"
            >
              <Ionicons name="remove" size={18} color={Colors.light.text} />
            </TouchableOpacity>

            <RNTextInput
              placeholder="0"
              keyboardType="number-pad"
              value={correctionDiff}
              onChangeText={(value) => {
                const sanitized = value.replace(/[^0-9-]/g, '');
                const normalized = sanitized.startsWith('-')
                  ? `-${sanitized.slice(1).replace(/-/g, '')}`
                  : sanitized.replace(/-/g, '');
                setCorrectionDiff(normalized);
              }}
              style={styles.stepperInput}
              placeholderTextColor={Colors.light.textTertiary}
              textAlign="center"
            />

            <TouchableOpacity
              onPress={() => adjustCorrectionDiff(1)}
              style={styles.stepperButton}
              activeOpacity={0.8}
              accessibilityLabel="Adicionar uma unidade"
            >
              <Ionicons name="add" size={18} color={Colors.light.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.stepperHint}>Use + para adicionar e - para remover unidades.</Text>

          <Text style={styles.inputLabel}>Motivo *</Text>
          <RNTextInput
            placeholder="Motivo obrigatório para auditoria..."
            value={correctionReason}
            onChangeText={(value) => {
              setCorrectionReason(value);
              if (correctionInlineError) setCorrectionInlineError('');
            }}
            multiline
            numberOfLines={3}
            style={[styles.nativeInput, styles.nativeInputMultiline]}
            placeholderTextColor={Colors.light.textTertiary}
            textAlignVertical="top"
          />
          {!!correctionInlineError && (
            <Text style={styles.correctionInlineErrorText}>{correctionInlineError}</Text>
          )}
        </BottomSheet>

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

        {/* Modal de Edição de Item */}
        <BottomSheet
          visible={editItemDialog.visible}
          onDismiss={cancelEditItem}
          title="Editar Item"
          subtitle={editItemDialog.item?.product_name}
          icon="create-outline"
          actions={[
            {
              label: 'Cancelar',
              onPress: cancelEditItem,
              variant: 'secondary',
            },
            {
              label: 'Salvar Alterações',
              onPress: confirmEditItem,
              icon: 'checkmark-circle-outline',
              loading: updateItemMutation.isPending,
              disabled: updateItemMutation.isPending,
            },
          ]}
        >
          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={20} color={brandingColors.primary} />
            <Text style={styles.warningText}>
              Ao editar quantidade ou custo, o inventário será recalculado automaticamente.
            </Text>
          </View>

          <Text style={styles.inputLabel}>Quantidade Recebida *</Text>
          <RNTextInput
            value={editQuantity}
            onChangeText={setEditQuantity}
            keyboardType="numeric"
            style={styles.nativeInput}
            placeholder="Digite a quantidade"
            placeholderTextColor={Colors.light.textTertiary}
          />

          <Text style={styles.inputLabel}>Custo Unitário (R$) *</Text>
          <View style={styles.nativeInputRow}>
            <Text style={styles.inputPrefix}>R$</Text>
            <RNTextInput
              value={editCost}
              onChangeText={(text) => setEditCost(maskCurrencyBR(text))}
              keyboardType="numeric"
              style={[styles.nativeInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
              placeholder="0,00"
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>

          <Text style={styles.inputLabel}>Preço de Venda (R$)</Text>
          <View style={styles.nativeInputRow}>
            <Text style={styles.inputPrefix}>R$</Text>
            <RNTextInput
              value={editPrice}
              onChangeText={(text) => setEditPrice(maskCurrencyBR(text))}
              keyboardType="numeric"
              style={[styles.nativeInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
              placeholder="0,00"
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
          {unmaskCurrency(editPrice) < unmaskCurrency(editCost) && (
            <Text style={styles.helperWarning}>⚠️ Preço menor que o custo</Text>
          )}

          <Text style={styles.inputLabel}>Observações</Text>
          <RNTextInput
            value={editNotes}
            onChangeText={setEditNotes}
            multiline
            numberOfLines={3}
            style={[styles.nativeInput, styles.nativeInputMultiline]}
            placeholder="Observações sobre este item (opcional)"
            placeholderTextColor={Colors.light.textTertiary}
            textAlignVertical="top"
          />
        </BottomSheet>
      </Animated.View>
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
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginTop: theme.spacing.sm,
  },
  errorButtonGradient: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: '#fff',
  },
  typeBadgeInHeader: {
    marginBottom: theme.spacing.xs,
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
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 16,
  },
  typeBadge: {
    // Substituído por <Badge> — mantido como fallback
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.infoLight,
  },
  typeBadgeText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.info,
  },
  salesProtectionBadge: {
    // Substituído por <Badge> — mantido como fallback
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xxs,
    backgroundColor: Colors.light.successLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.md,
  },
  salesProtectionText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.success,
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
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  productHeaderRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
    flexShrink: 0,
  },
  productChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.md,
  },
  productChipText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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
  variantLabel: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '500',
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
  editItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  editItemButtonText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  productMetrics: {
    flexDirection: 'row',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  productMetricItem: {
    flex: 1,
  },
  productMetricCenter: {
    alignItems: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.light.border,
  },
  productMetricLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: Colors.light.textTertiary,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  productMetricValue: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
  },
  progressContainer: {
    marginBottom: theme.spacing.sm,
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
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%' as any,
    borderRadius: 3,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  productFooterItem: {
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  compactNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  compactNoticeText: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  actionButton: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    minHeight: 52,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerActionButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.error + '50',
    backgroundColor: Colors.light.error + '08',
  },
  dangerActionButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.error,
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
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 6,
    marginTop: 4,
  },
  nativeInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.light.text,
    backgroundColor: Colors.light.card,
    marginBottom: 12,
  },
  nativeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: Colors.light.card,
    marginBottom: 12,
    overflow: 'hidden',
  },
  inputPrefix: {
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  nativeInputMultiline: {
    height: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  helperWarning: {
    fontSize: 12,
    color: Colors.light.warning,
    marginTop: -8,
    marginBottom: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  stepperButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    backgroundColor: Colors.light.card,
  },
  stepperHint: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  correctionInlineErrorText: {
    fontSize: 12,
    color: Colors.light.error,
    marginTop: -4,
    marginBottom: 12,
  },
});
