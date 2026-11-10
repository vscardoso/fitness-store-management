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
  TouchableOpacity,
  Text,
  TextInput as RNTextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { matchesProduct } from '@/utils/productSearch';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import PageHeader from '@/components/layout/PageHeader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import InfoRow from '@/components/ui/InfoRow';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import BottomSheet from '@/components/ui/BottomSheet';
import SupplierPickerSheet from '@/components/suppliers/SupplierPickerSheet';
import AppButton from '@/components/ui/AppButton';
import { addToQueue as addLabelsToQueue, getEntryLabelProgress, getLabelQueue } from '@/services/labelQueueService';
import { parseApiError } from '@/utils/apiError';
import HScroll from '@/components/ui/HScroll';
import useBackToList from '@/hooks/useBackToList';
import { getStockEntryById, deleteStockEntry, updateEntryItem, deleteEntryItem, correctEntryItem, getStockEntryAnalytics } from '@/services/stockEntryService';
import { formatCurrency, formatDate, formatPercent } from '@/utils/format';
import EntryTrackingCard from '@/components/entries/EntryTrackingCard';
import { toBRNumber, maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import EmptyState from '@/components/ui/EmptyState';
import { useBrandingColors } from '@/store/brandingStore';
import LotMoneyCard from '@/components/entries/LotMoneyCard';
import AddVariantModal from '@/components/entries/AddVariantModal';
import { useAuth } from '@/hooks/useAuth';
import { EntryType, EntryItemResponse } from '@/types';
import { isAdminRole, isManagerRole } from '@/utils/roles';
import SendToSupplierModal from '@/components/entries/SendToSupplierModal';
import AddProductToEntryModal from '@/components/entries/AddProductToEntryModal';
import { setPresetEntry } from '@/utils/presetEntry';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import ScreenLoader from '@/components/ui/ScreenLoader';

export default function StockEntryDetailsScreen() {
  const desktopContent = useDesktopContentStyle();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/entries');
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();
  const { user } = useAuth();

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
   * Padrão do app: volta à tela anterior; o parâmetro `from` só vale sem histórico (link direto)
   */
  const handleGoBack = () => goBack();

  // Estados
  const [refreshing, setRefreshing] = useState(false);
  const [supplierItem, setSupplierItem] = useState<EntryItemResponse | null>(null);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<EntryItemResponse | null>(null);
  const [itemsQuery, setItemsQuery] = useState('');
  const [showAllSlow, setShowAllSlow] = useState(false);
  const [itemsView, setItemsView] = useState<'original' | 'az' | 'zerados' | 'agrupar'>('original');
  const [editListPrice, setEditListPrice] = useState('');
  // Lançar outra variação (cor/tamanho) de um produto já cadastrado nesta entrada
  const [variantTarget, setVariantTarget] = useState<EntryItemResponse | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');   // o código da entrada digitado para confirmar a exclusão
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
  const { data: labelQueue } = useQuery({ queryKey: ['label-queue'], queryFn: getLabelQueue, refetchOnWindowFocus: true });   // atalho da fila de impressão
  // "Fila de impressão" no cartão da peça: inclui as etiquetas que faltam dessa peça (as que ainda não saíram nem estão na fila) e abre a fila
  const { data: labelProgress } = useQuery({ queryKey: ['label-progress', entryId], queryFn: () => getEntryLabelProgress(entryId), enabled: !!entryId });
  const [queueingItemId, setQueueingItemId] = useState<number | null>(null);
  const openQueueWithItem = async (item: EntryItemResponse) => {
    if (queueingItemId) return;
    const line = item.variant_id ? labelProgress?.lines.find((l) => l.variant_id === item.variant_id) : undefined;
    const missing = item.variant_id ? (line ? line.missing : item.quantity_received) : 0;
    if (!item.variant_id || missing <= 0) {
      router.push('/etiquetas/fila' as any);
      return;
    }
    setQueueingItemId(item.id);
    try {
      await addLabelsToQueue([{ variantId: item.variant_id, quantity: missing }], entryId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['label-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['label-progress', entryId] }),
      ]);
      router.push('/etiquetas/fila' as any);
    } catch (e: any) {
      setErrorDialog({ visible: true, message: parseApiError(e) || 'Não foi possível pôr na fila.' });
    } finally {
      setQueueingItemId(null);
    }
  };
  const [editSupplier, setEditSupplier] = useState<{ id: number; name: string } | null>(null);   // fornecedor escolhido na edição
  const [pickingSupplier, setPickingSupplier] = useState(false);

  // Correção auditada
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [correctionItem, setCorrectionItem] = useState<EntryItemResponse | null>(null);
  const [correctionDiff, setCorrectionDiff] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionInlineError, setCorrectionInlineError] = useState('');

  /**
   * Query: Buscar entrada
   */
  // Mesmos números do cartão "Quanto rendeu esta entrada" (a consulta é compartilhada)
  const { data: lotAnalytics } = useQuery({
    queryKey: ['lot-analytics', entryId],
    queryFn: () => getStockEntryAnalytics(entryId),
    enabled: isValidId,
  });

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
    mutationFn: () => deleteStockEntry(entryId, deleteTyped.trim()),
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
    mutationFn: (data: { itemId: number; quantity_received?: number; unit_cost?: number; sell_price?: number; list_unit_cost?: number; notes?: string; supplier_id?: number }) =>
      updateEntryItem(data.itemId, {
        supplier_id: data.supplier_id,
        quantity_received: data.quantity_received,
        unit_cost: data.unit_cost,
        sell_price: data.sell_price,
        list_unit_cost: data.list_unit_cost,
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

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => deleteEntryItem(itemId),
    onSuccess: async () => {
      const name = deleteItemTarget?.product_name;
      setDeleteItemTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock-entry', entryId] }),
        queryClient.invalidateQueries({ queryKey: ['lot-analytics', entryId] }),
        queryClient.invalidateQueries({ queryKey: ['lot-costs', entryId] }),
        queryClient.invalidateQueries({ queryKey: ['stock-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['grouped-products'] }),
        queryClient.invalidateQueries({ queryKey: ['active-products'] }),
      ]);
      setSuccessDialog({ visible: true, message: `${name || 'Produto'} foi excluído da entrada.` });
    },
    onError: (error: any) => {
      setDeleteItemTarget(null);
      setErrorDialog({ visible: true, message: error.message || 'Não foi possível excluir o produto.' });
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
    setDeleteTyped('');
    setShowDeleteDialog(true);
  };

  /**
   * Confirmar exclusão no diálogo
   */
  const deleteCodeOk = !!entry?.entry_code && deleteTyped.trim().toLowerCase() === String(entry.entry_code).trim().toLowerCase();
  const confirmDelete = () => {
    if (!deleteCodeOk) return;   // só efetiva com o código da entrada digitado certo
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
    const listNum = parseFloat(String(item.list_unit_cost ?? 0).replace(',', '.')) || 0;
    setEditListPrice(listNum > 0 ? listNum.toFixed(2).replace('.', ',') : '');
    setEditPrice(priceNum > 0 ? priceNum.toFixed(2).replace('.', ',') : '');
    setEditNotes(item.notes || '');
    setEditSupplier(null);
    setPickingSupplier(false);
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

    const listPrice = unmaskCurrency(editListPrice) || 0;
    if (listPrice > 0 && listPrice < cost) {
      setErrorDialog({ visible: true, message: 'O preço de tabela não pode ser menor que o preço pago.' });
      return;
    }

    // Enviar atualização
    updateItemMutation.mutate({
      itemId: editItemDialog.item.id,
      quantity_received: quantity,
      unit_cost: cost,
      sell_price: price,
      list_unit_cost: listPrice,
      notes: editNotes.trim() || undefined,
      supplier_id: editSupplier?.id,
    });
  };

  /**
   * Cancelar edição
   */
  const cancelEditItem = () => {
    setEditItemDialog({ visible: false, item: null });
    setEditQuantity('');
    setEditCost('');
    setEditListPrice('');
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
    // vendido = venda real (o servidor separa o que saiu sem venda); antes era recebido - restante e contava baixa como venda
    const itemsWithDepletion = items.map(item => ({
      ...item,
      depletionRate: item.quantity_received > 0 ? (item.quantity_sold / item.quantity_received) * 100 : 0,
    }));

    // Mais vendidos: só quem vendeu de verdade
    const bestSellers = [...itemsWithDepletion]
      .filter(item => item.quantity_sold > 0)
      .sort((a, b) => b.depletionRate - a.depletionRate)
      .slice(0, 3);

    // Parados: tem estoque e nunca vendeu; todos, não só 3 (a tela mostra 3 e o resto em "Ver todos")
    const slowMovers = [...itemsWithDepletion]
      .filter(item => item.quantity_remaining > 0 && item.quantity_sold === 0)
      .sort((a, b) => b.quantity_remaining - a.quantity_remaining);

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

    const itemNumbers = lotAnalytics?.items?.find((x) => x.item_id === item.id);
    return (
      <View key={item.id} style={styles.productCard}>
        {/* Header: nome + chips + ação */}
        <View style={styles.productHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.productName} numberOfLines={2}>{item.product_name}</Text>
            {!!item.variant_label && (
              <Text style={[styles.variantLabel, { color: brandingColors.primary }]} numberOfLines={1}>{item.variant_label}</Text>
            )}
            {!!item.product_sku && (
              <Text style={styles.productSku} numberOfLines={1}>SKU: {item.product_sku}</Text>
            )}
            {!!item.supplier_name && (entry?.suppliers_summary?.length ?? 0) > 1 && (
              <Text style={styles.productSupplier} numberOfLines={1}>Fornecedor: {item.supplier_name}</Text>
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
          </View>
        </View>

        {/* Ações do item: barra de botões iguais, ícone em cima e nome curto embaixo */}
        <View style={styles.itemToolbar}>
          <TouchableOpacity
            onPress={() => handleEditItem(item)}
            style={[styles.itemTool, { borderColor: hasSales ? Colors.light.warning + '40' : brandingColors.primary + '30', backgroundColor: hasSales ? Colors.light.warning + '12' : brandingColors.primary + '12' }]}
            activeOpacity={0.7}
            accessibilityLabel={hasSales ? 'Corrigir este item' : 'Editar este item'}
          >
            <Ionicons name={hasSales ? 'construct-outline' : 'create-outline'} size={16} color={hasSales ? Colors.light.warning : brandingColors.primary} />
            <Text style={[styles.itemToolText, { color: hasSales ? Colors.light.warning : brandingColors.primary }]} numberOfLines={1}>
              {hasSales ? 'Corrigir' : 'Editar'}
            </Text>
          </TouchableOpacity>
          {isManagerRole(user?.role) && !hasSales && (entry?.entry_items?.length ?? 0) > 1 && (
            <TouchableOpacity
              onPress={() => setDeleteItemTarget(item)}
              style={[styles.itemTool, { borderColor: Colors.light.error + '40', backgroundColor: Colors.light.error + '12' }]}
              activeOpacity={0.7}
              accessibilityLabel="Excluir este produto da entrada"
            >
              <Ionicons name="trash-outline" size={16} color={Colors.light.error} />
              <Text style={[styles.itemToolText, { color: Colors.light.error }]} numberOfLines={1}>Excluir</Text>
            </TouchableOpacity>
          )}
          {isManagerRole(user?.role) && item.quantity_remaining > 0 && (
            <TouchableOpacity
              onPress={() => setSupplierItem(item)}
              style={[styles.itemTool, { borderColor: Colors.light.border, backgroundColor: Colors.light.backgroundSecondary }]}
              activeOpacity={0.7}
              accessibilityLabel="Devolver peças deste item ao fornecedor"
            >
              <Ionicons name="return-down-back-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={[styles.itemToolText, { color: Colors.light.textSecondary }]} numberOfLines={1}>Devolver</Text>
            </TouchableOpacity>
          )}
          {isManagerRole(user?.role) && !!item.product_id && (
            <TouchableOpacity
              onPress={() => setVariantTarget(item)}
              style={[styles.itemTool, { borderColor: brandingColors.primary + '30', backgroundColor: brandingColors.primary + '12' }]}
              activeOpacity={0.7}
              accessibilityLabel="Lançar outra variação deste produto"
            >
              <Ionicons name="add-circle-outline" size={16} color={brandingColors.primary} />
              <Text style={[styles.itemToolText, { color: brandingColors.primary }]} numberOfLines={1}>Variação</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => openQueueWithItem(item)}
            disabled={queueingItemId != null}
            style={[styles.itemTool, { borderColor: brandingColors.primary + '30', backgroundColor: brandingColors.primary + '12', opacity: queueingItemId === item.id ? 0.5 : 1 }]}
            activeOpacity={0.7}
            accessibilityLabel="Incluir as etiquetas desta peça na fila de impressão e abrir a fila"
          >
            <Ionicons name="list-outline" size={16} color={brandingColors.primary} />
            <Text style={[styles.itemToolText, { color: brandingColors.primary, fontSize: 11, textAlign: 'center' }]} numberOfLines={2}>Fila de impressão</Text>
          </TouchableOpacity>
        </View>

        {/* Custo com as despesas do lote (frete, embalagem, taxa...), preço, lucro e ganho sobre o custo desta peça */}
        {itemNumbers && (
          <Text style={{ fontSize: 12, lineHeight: 18, color: Colors.light.textSecondary, marginBottom: 8 }}>
            Custo {formatCurrency(itemNumbers.landed_unit_cost)}
            {(itemNumbers.freight_unit_cost ?? Math.max(itemNumbers.extra_unit_cost, 0)) > 0 || (itemNumbers.discount_unit_cost ?? 0) > 0
              ? ` (${formatCurrency(itemNumbers.merchandise_unit_cost)} da peça` +
                ((itemNumbers.freight_unit_cost ?? Math.max(itemNumbers.extra_unit_cost, 0)) > 0
                  ? ` + ${formatCurrency(itemNumbers.freight_unit_cost ?? itemNumbers.extra_unit_cost)} de despesas`
                  : '') +
                ((itemNumbers.discount_unit_cost ?? 0) > 0 ? ` - ${formatCurrency(itemNumbers.discount_unit_cost ?? 0)} de desconto` : '') +
                ')'
              : ''}
            {(itemNumbers.item_discount_unit ?? 0) > 0
              ? ` · Tabela ${formatCurrency(itemNumbers.list_unit_cost ?? 0)}, pago ${formatCurrency(itemNumbers.merchandise_unit_cost)} (${formatCurrency(itemNumbers.item_discount_unit ?? 0)} de desconto no item)`
              : ''}
            {' · '}Venda {formatCurrency(itemNumbers.sell_price)}
            {' · '}Lucro {formatCurrency(itemNumbers.profit_per_unit)} por peça
            {' · '}Ganho sobre o custo {formatPercent(itemNumbers.markup_pct, 0)}
          </Text>
        )}

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
            <Text style={styles.progressLabel}>Já vendido</Text>
            <Text style={[styles.progressPercentage, { color: progressColor }]}>
              {formatPercent(depletionRate, 1)}
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${Math.min(depletionRate, 100)}%` as any, backgroundColor: progressColor }]} />
          </View>
        </View>

        {/* Footer: custo + total */}
        <View style={styles.productFooter}>
          <View style={styles.productFooterItem}>
            <Text style={styles.productMetricLabel}>PAGO POR PEÇA</Text>
            <Text style={[styles.productMetricValue, { color: VALUE_COLORS.neutral }]}>{formatCurrency(item.unit_cost)}</Text>
          </View>
          <View style={[styles.productFooterItem, { alignItems: 'flex-end' }]}>
            <Text style={styles.productMetricLabel}>TOTAL PAGO</Text>
            <Text style={[styles.productMetricValue, { color: VALUE_COLORS.negative, flexShrink: 0 }]}>{formatCurrency(item.total_cost)}</Text>
          </View>
        </View>

        {/* Observações */}
        {!!item.notes && (
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
        <ScreenLoader message="Carregando entrada..." />
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
      <AddProductToEntryModal
        visible={addProductOpen}
        entryId={entryId}
        entryCode={entry.entry_code}
        entrySupplierName={entry.supplier_name}
        entryItems={entry.entry_items}
        onClose={() => setAddProductOpen(false)}
      />
      <SendToSupplierModal
        visible={!!supplierItem}
        entryItemId={supplierItem?.id ?? null}
        productLabel={[supplierItem?.product_name, supplierItem?.variant_label].filter(Boolean).join(' ')}
        remaining={supplierItem?.quantity_remaining ?? 0}
        onClose={() => setSupplierItem(null)}
      />
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
          contentContainerStyle={[styles.scrollContent, desktopContent]}
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
            {entry.suppliers_summary && entry.suppliers_summary.length > 1 && (
              <View style={styles.supplierBreakdown}>
                <Text style={styles.supplierBreakdownTitle}>
                  Compra com {entry.suppliers_summary.length} fornecedores
                </Text>
                {entry.suppliers_summary.map((g) => (
                  <View key={`${g.supplier_id ?? 'x'}-${g.supplier_name}`} style={styles.supplierBreakdownRow}>
                    <Text style={styles.supplierBreakdownName} numberOfLines={1}>
                      {g.supplier_name} · {g.items} {g.items === 1 ? 'item' : 'itens'}, {g.quantity} un
                    </Text>
                    <Text style={styles.supplierBreakdownValue}>{formatCurrency(g.total_cost)}</Text>
                  </View>
                ))}
              </View>
            )}
            {entry.supplier_cnpj && (
              <InfoRow label="CNPJ" value={entry.supplier_cnpj} icon="card-outline" />
            )}
            {entry.supplier_contact && (
              <InfoRow label="Contato" value={entry.supplier_contact} icon="call-outline" />
            )}
            {!!entry.invoice_number && (
              <InfoRow label="Nota Fiscal" value={entry.invoice_number} icon="document-text-outline" />
            )}
            {!!entry.payment_method && (
              <InfoRow label="Pagamento" value={entry.payment_method} icon="cash-outline" />
            )}
            {!!entry.notes && (
              <InfoRow label="Observações" value={entry.notes} icon="document-outline" />
            )}
        </View>

        <AddVariantModal
          visible={!!variantTarget}
          onClose={() => setVariantTarget(null)}
          entryId={entryId}
          productId={Number(variantTarget?.product_id ?? 0)}
          productName={variantTarget?.product_name ?? ''}
          suggestedCost={Number(variantTarget?.unit_cost ?? 0)}
          suggestedPrice={Number(variantTarget?.product_price ?? 0)}
        />

        {/* O dinheiro do lote, em linguagem simples (gastou, voltou, sobrou) */}
        <LotMoneyCard
          entryId={entryId}
          canEdit={isManagerRole(user?.role)}
        />

        {/* KPIs */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Custo total do lote"
            value={formatCurrency(lotAnalytics?.total_investment ?? entry.total_invested ?? entry.total_cost)}
            icon="cash-outline"
            valueColor={Colors.light.text}
          />
          {lotAnalytics && (
            <StatCard
              label="Ganho sobre o custo do lote"
              value={`${formatPercent(lotAnalytics.markup_pct_total, 0)}`}
              icon="pricetag-outline"
              valueColor={lotAnalytics.markup_pct_total >= 0 ? Colors.light.success : Colors.light.error}
            />
          )}
          {lotAnalytics && (
            <StatCard
              label="Lucro do lote (previsto)"
              value={`${formatPercent(lotAnalytics.potential_margin_pct, 0)}`}
              icon="wallet-outline"
              valueColor={lotAnalytics.potential_profit_total >= 0 ? Colors.light.success : Colors.light.error}
            />
          )}
          <StatCard
            label="Total de peças"
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
          {(entry.entry_items || []).some((i: any) => (i.quantity_removed ?? 0) > 0) && (
            <StatCard
              label="Saíram sem venda"
              value={`${(entry.entry_items || []).reduce((a: number, i: any) => a + (i.quantity_removed ?? 0), 0)}`}
              icon="log-out-outline"
              valueColor={Colors.light.warning}
            />
          )}
          <StatCard
            label="Já vendido"
            value={`${formatPercent(entry.sell_through_rate, 1)}`}
            icon="trending-up"
            valueColor={entry.sell_through_rate >= 70 ? Colors.light.success : entry.sell_through_rate >= 40 ? Colors.light.warning : Colors.light.error}
          />
          {lotAnalytics && lotAnalytics.total_quantity_sold > 0 && (
            <StatCard
              label="Sobrou até agora"
              value={formatCurrency(lotAnalytics.gross_profit)}
              icon="trending-up"
              valueColor={lotAnalytics.gross_profit >= 0 ? Colors.light.success : Colors.light.error}
            />
          )}
        </View>

        {/* Best Sellers */}
        {bestSellers.length > 0 && (
          <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Ionicons name="trophy-outline" size={20} color={Colors.light.success} />
                <Text style={styles.sectionTitle}>Mais vendidos</Text>
              </View>
              {bestSellers.map((item, index) => (
                <View key={item.id} style={styles.rankItem}>
                  <View style={[styles.rankBadge, { backgroundColor: Colors.light.success + '20' }]}>
                    <Text style={[styles.rankNumber, { color: Colors.light.success }]}>#{index + 1}</Text>
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankName}>{item.product_name}</Text>
                    <Text style={styles.rankMetric}>
                      {item.quantity_sold} vendidos de {item.quantity_received} ({formatPercent(item.depletionRate, 0)})
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
              {(showAllSlow ? slowMovers : slowMovers.slice(0, 3)).map((item, index) => (
                <View key={item.id} style={styles.rankItem}>
                  <View style={[styles.rankBadge, { backgroundColor: Colors.light.warning + '20' }]}>
                    <Ionicons name="alert" size={16} color={Colors.light.warning} />
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankName}>{item.product_name}</Text>
                    <Text style={styles.rankMetric}>
                      Restam {item.quantity_remaining} de {item.quantity_received} (nenhuma vendida)
                    </Text>
                  </View>
                </View>
              ))}
              {slowMovers.length > 3 && (
                <TouchableOpacity onPress={() => setShowAllSlow(v => !v)} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: brandingColors.primary, fontWeight: '700' }}>
                    {showAllSlow ? 'Mostrar só 3' : `Ver todos os ${slowMovers.length} parados`}
                  </Text>
                </TouchableOpacity>
              )}
          </View>
        )}

        <EntryTrackingCard entryId={entryId} />

        {/* Lista de Produtos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleLarge}>
            Produtos ({entry.entry_items?.length || 0})
          </Text>
          {/* Ações da entrada: mesmo botão do app em grade de duas colunas (antes eram cinco estilos diferentes e quebra irregular) */}
          <View style={styles.entryActionGrid}>
            {isManagerRole(user?.role) && (
              <>
                <View style={styles.entryActionCell}>
                  <AppButton
                    label="Produto novo"
                    icon="sparkles-outline"
                    fullWidth
                oneLine
                    onPress={() => {
                      setPresetEntry(entryId);
                      router.push('/products/wizard' as any);
                    }}
                  />
                </View>
                <View style={styles.entryActionCell}>
                  <AppButton label="Produto já cadastrado" icon="add-circle-outline" variant="outlined" fullWidth oneLine onPress={() => setAddProductOpen(true)} />
                </View>
              </>
            )}
            <View style={styles.entryActionCell}>
              <AppButton
                label="Conferir recebimento"
                icon="qr-code-outline"
                variant="outlined"
                fullWidth
                oneLine
                onPress={() => router.push({ pathname: '/entries/check/[id]', params: { id: String(entryId) } } as any)}
              />
            </View>
            <View style={styles.entryActionCell}>
              <AppButton
                label={(labelQueue?.total ?? 0) > 0 ? `Fila de impressão (${labelQueue?.total})` : 'Fila de impressão'}
                icon="list-outline"
                variant="outlined"
                fullWidth
                oneLine
                onPress={() => router.push('/etiquetas/fila' as any)}
              />
            </View>
            <View style={styles.entryActionCell}>
              <AppButton
                label="Imprimir etiquetas"
                icon="print-outline"
                variant="outlined"
                fullWidth
                oneLine
                onPress={() => router.push({ pathname: '/entries/labels/[id]', params: { id: String(entryId) } } as any)}
              />
            </View>
          </View>
          {entry.entry_items && entry.entry_items.length > 1 && (
            <RNTextInput
              value={itemsQuery}
              onChangeText={setItemsQuery}
              placeholder="Pesquisar produto, cor, tamanho ou código"
              placeholderTextColor={Colors.light.textTertiary}
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={styles.itemsSearch}
            />
          )}
          {entry.entry_items && entry.entry_items.length > 1 && (
            <HScroll contentContainerStyle={styles.itemActionsScroll} style={styles.itemActionsWrap}>
              {([
                ['original', 'Ordem de entrada'],
                ['az', 'A a Z'],
                ['zerados', 'Zerados'],
                ['agrupar', 'Agrupar por produto'],
              ] as const).map(([key, label]) => {
                const active = itemsView === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setItemsView(key)}
                    style={[styles.itemsViewChip, active && { borderColor: brandingColors.primary, backgroundColor: brandingColors.primary + '18' }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.itemsViewChipText, active && { color: brandingColors.primary, fontWeight: '700' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </HScroll>
          )}
          {entry.entry_items && entry.entry_items.length > 0 ? (
            (() => {
              // Nome, cor, tamanho, SKU e código da etiqueta (#026, 026, 26, #026-1): mesma regra da lista de Produtos
              const q = itemsQuery.trim();
              const all = q
                ? entry.entry_items.filter(i => matchesProduct(
                    { name: i.product_name, variants: [{ sku: i.product_sku, display_code: i.variant_code }] },
                    q,
                    [i.variant_label],
                  ))
                : entry.entry_items;
              if (all.length === 0) {
                return <Text style={styles.itemsViewInfo}>Nenhum produto encontrado para "{itemsQuery.trim()}".</Text>;
              }
              const byName = (a: EntryItemResponse, b: EntryItemResponse) =>
                (a.product_name || '').localeCompare(b.product_name || '', 'pt-BR', { sensitivity: 'base' }) ||
                (a.variant_label || '').localeCompare(b.variant_label || '', 'pt-BR', { numeric: true, sensitivity: 'base' });
              if (itemsView === 'az') return [...all].sort(byName).map(renderProductItem);
              if (itemsView === 'zerados') {
                const zero = all.filter(i => i.quantity_remaining === 0).sort(byName);
                return (
                  <>
                    <Text style={styles.itemsViewInfo}>
                      {zero.length === 0 ? 'Nenhum item zerado nesta entrada.' : `${zero.length} item(ns) zerado(s) de ${all.length}.`}
                    </Text>
                    {zero.map(renderProductItem)}
                  </>
                );
              }
              if (itemsView === 'agrupar') {
                const groups = new Map<string, EntryItemResponse[]>();
                [...all].sort(byName).forEach(i => {
                  const key = i.product_id ? `p${i.product_id}` : `n${i.product_name}`;
                  groups.set(key, [...(groups.get(key) || []), i]);
                });
                return Array.from(groups.entries()).map(([key, list]) => {
                  const rest = list.reduce((t, i) => t + i.quantity_remaining, 0);
                  const bought = list.reduce((t, i) => t + i.quantity_received, 0);
                  return (
                    <View key={key} style={{ marginBottom: 8 }}>
                      <View style={styles.groupHeader}>
                        <Text style={styles.groupTitle} numberOfLines={2}>{list[0].product_name}</Text>
                        <Text style={[styles.groupInfo, rest === 0 && { color: Colors.light.error }]}>
                          {rest === 0 ? 'Zerado' : `Restam ${rest} de ${bought} un`} · {list.length} item(ns)
                        </Text>
                      </View>
                      {list.map(renderProductItem)}
                    </View>
                  );
                });
              }
              return all.map(renderProductItem);
            })()
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

        {/* Ações: excluir a entrada é só do admin (o servidor também recusa os outros) */}
        {!entry.has_sales && isAdminRole(user?.role) && (
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

        {/* Excluir a entrada: confirmação forte. Só efetiva depois de digitar o código da entrada */}
        <BottomSheet
          visible={showDeleteDialog}
          onDismiss={() => !deleteMutation.isPending && setShowDeleteDialog(false)}
          title="Excluir a entrada?"
          subtitle={entry?.entry_code || ''}
          icon="trash-outline"
          dismissOnBackdrop={false}
          actions={[
            { label: 'Cancelar', onPress: () => setShowDeleteDialog(false), variant: 'secondary', disabled: deleteMutation.isPending },
            { label: 'Excluir definitivamente', onPress: confirmDelete, variant: 'danger', icon: 'trash-outline', loading: deleteMutation.isPending, disabled: !deleteCodeOk || deleteMutation.isPending },
          ]}
        >
          <Text style={styles.deleteWarning}>Isto tira as peças do estoque e não dá para desfazer:</Text>
          {getDeleteDetails().map((d) => (
            <Text key={d} style={styles.deleteDetail}>• {d}</Text>
          ))}
          <Text style={styles.deleteAsk}>Para confirmar, digite o código da entrada:</Text>
          <Text style={styles.deleteCode} selectable={false}>{entry?.entry_code}</Text>
          <RNTextInput
            value={deleteTyped}
            onChangeText={setDeleteTyped}
            placeholder="Digite o código aqui"
            placeholderTextColor={Colors.light.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.nativeInput, deleteTyped.length > 0 && !deleteCodeOk && { borderColor: Colors.light.error }]}
            accessibilityLabel="Digite o código da entrada para confirmar a exclusão"
          />
          {deleteTyped.length > 0 && !deleteCodeOk ? <Text style={styles.deleteMismatch}>O código não confere.</Text> : null}
        </BottomSheet>

        <ConfirmDialog
          visible={!!deleteItemTarget}
          title="Excluir produto da entrada?"
          message={`${deleteItemTarget?.product_name || ''}${deleteItemTarget?.variant_label ? ' (' + deleteItemTarget.variant_label + ')' : ''}: nenhuma peça foi vendida, então ele sai desta entrada e do estoque.`}
          confirmText="Sim, excluir"
          cancelText="Cancelar"
          onConfirm={() => deleteItemTarget && deleteItemMutation.mutate(deleteItemTarget.id)}
          onCancel={() => setDeleteItemTarget(null)}
          type="danger"
          icon="trash"
          loading={deleteItemMutation.isPending}
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
          visible={editItemDialog.visible && !pickingSupplier}
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
          <View style={[styles.warningBox, { borderLeftColor: brandingColors.primary, backgroundColor: brandingColors.primary + '10' }]}>
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

          <Text style={styles.inputLabel}>Preço cheio do fornecedor (R$), opcional</Text>
          <View style={styles.nativeInputRow}>
            <Text style={styles.inputPrefix}>R$</Text>
            <RNTextInput
              value={editListPrice}
              onChangeText={(text) => setEditListPrice(maskCurrencyBR(text))}
              keyboardType="numeric"
              style={[styles.nativeInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
              placeholder="Só se houve desconto: preço antes dele"
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
          {unmaskCurrency(editListPrice) > unmaskCurrency(editCost) && unmaskCurrency(editCost) > 0 && (
            <Text style={styles.helperWarning}>
              O fornecedor deu {formatCurrency(unmaskCurrency(editListPrice) - unmaskCurrency(editCost))} de desconto por peça. O custo é o preço pago.
            </Text>
          )}

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

          <Text style={styles.inputLabel}>Fornecedor</Text>
          <TouchableOpacity
            style={styles.supplierPickRow}
            onPress={() => setPickingSupplier(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Escolher o fornecedor desta peça"
          >
            <Ionicons name="business" size={18} color={brandingColors.primary} />
            <Text style={styles.supplierPickText} numberOfLines={1}>
              {editSupplier?.name ?? editItemDialog.item?.supplier_name ?? entry?.supplier_name ?? 'o da entrada'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
          </TouchableOpacity>
          {!!editSupplier && (
            <Text style={styles.helperWarning}>Esta peça passa a ser comprada de {editSupplier.name}.</Text>
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

        {/* Fornecedor da peça: abre no lugar da folha de edição (duas folhas ao mesmo tempo não funcionam bem no iPhone) */}
        <SupplierPickerSheet
          visible={editItemDialog.visible && pickingSupplier}
          onClose={() => setPickingSupplier(false)}
          onSelect={(sup) => {
            setEditSupplier(sup ? { id: sup.id, name: sup.name } : null);
            setPickingSupplier(false);
          }}
          productId={editItemDialog.item?.product_id}
          productName={editItemDialog.item?.product_name}
          selectedSupplierId={editSupplier?.id ?? editItemDialog.item?.supplier_id ?? null}
          allowNone={false}
        />
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
    color: Colors.light.white,
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
  itemsSearch: { height: 44, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: Colors.light.text, backgroundColor: Colors.light.background, marginBottom: 10 },
  itemsViewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  itemsViewChip: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: Colors.light.border },
  itemsViewChipText: { fontSize: 13, color: Colors.light.text },
  itemsViewInfo: { fontSize: 13, color: Colors.light.textSecondary, marginBottom: 8 },
  groupHeader: { paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  groupInfo: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
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
  itemToolbar: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  itemTool: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  itemToolText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  entryActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  entryActionCell: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  itemActionsWrap: {
    marginBottom: theme.spacing.md,
    flexGrow: 0,
  },
  itemActionsScroll: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.xs,
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
  productSupplier: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  supplierBreakdown: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    gap: 6,
  },
  supplierBreakdownTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  supplierBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  supplierBreakdownName: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
  },
  supplierBreakdownValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.text,
  },
  variantLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
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
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
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
  supplierPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  supplierPickText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.light.text },
  deleteWarning: { fontSize: 14, fontWeight: '700', color: Colors.light.errorDark, marginBottom: 6 },
  deleteDetail: { fontSize: 13, color: Colors.light.text, marginBottom: 4 },
  deleteAsk: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 12 },
  deleteCode: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginVertical: 6 },
  deleteMismatch: { fontSize: 12, color: Colors.light.errorDark, marginTop: 4 },
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
