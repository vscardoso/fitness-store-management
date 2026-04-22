/**
 * Tela de detalhes e processamento de envio condicional
 * Permite processar devolução, finalizar venda ou cancelar envio
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  TouchableOpacity,
  Animated,
} from 'react-native';
import {
  Text,
  TextInput,
  Surface,
  Chip,
} from 'react-native-paper';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '@/components/layout/PageHeader';
import InfoRow from '@/components/ui/InfoRow';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import MarkAsSentModal from '@/components/conditional/MarkAsSentModal';
import { getShipment, processReturn, cancelShipment, markAsSent } from '@/services/conditionalService';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import { Colors, VALUE_COLORS, theme } from '@/constants/Colors';
import { useConditionalProcessingStore } from '@/store/conditionalProcessingStore';
import { useBrandingColors } from '@/store/brandingStore';
import type {
  ConditionalShipment,
  ConditionalShipmentItem,
  ProcessReturnItemDTO,
  ProcessReturnDTO,
  ShipmentItemStatus,
} from '@/types/conditional';
import {
  SHIPMENT_STATUS_COLORS,
  SHIPMENT_STATUS_ICONS,
  SHIPMENT_STATUS_LABELS,
  formatDeadline,
  getDeadlineColor,
  isFinalStatus,
} from '@/types/conditional';

/**
 * Traduz os códigos de forma de pagamento para labels legíveis
 */
const translatePaymentMethod = (method: string): string => {
  const labels: Record<string, string> = {
    cash: 'Dinheiro',
    credit_card: 'Cartão de Crédito',
    debit_card: 'Cartão de Débito',
    pix: 'Pix',
    bank_transfer: 'Transferência Bancária',
    installments: 'Parcelado',
    loyalty_points: 'Pontos de Fidelidade',
  };
  return labels[method] || method;
};

const installmentOptions = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: i === 0 ? 'A vista' : `${i + 1}x`,
}));

const EMPTY_PROCESSING_ITEMS: Record<number, {
  id: number;
  quantity_kept: number;
  quantity_returned: number;
  quantity_damaged: number;
  quantity_lost: number;
  notes: string;
}> = {};

export default function ConditionalShipmentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  const shipmentId = id ? parseInt(id) : NaN;
  const isValidId = !isNaN(shipmentId) && shipmentId > 0;

  // Estados locais para processamento
  const processingItems = useConditionalProcessingStore((state) => state.drafts[shipmentId] ?? EMPTY_PROCESSING_ITEMS);
  const hasShipmentDraft = useConditionalProcessingStore((state) => Boolean(state.drafts[shipmentId]));
  const initializeShipmentDraft = useConditionalProcessingStore((state) => state.initializeShipmentDraft);
  const updateShipmentItem = useConditionalProcessingStore((state) => state.updateShipmentItem);
  const resetShipmentDraft = useConditionalProcessingStore((state) => state.resetShipmentDraft);
  const [activeModal, setActiveModal] = useState<{
    visible: boolean;
    type: 'cancel' | 'mark_sent' | null;
    reason?: string;
    carrier?: string;
    tracking_code?: string;
  }>({ visible: false, type: null });

  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    type: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    details?: string[];
    onConfirm: () => void;
  }>({
    visible: false,
    type: 'warning',
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [successDialog, setSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorDialog, setErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'pix' | 'bank_transfer' | 'installments' | 'loyalty_points'>('pix');
  const [installments, setInstallments] = useState(1);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  /**
   * Query: Buscar detalhes do envio
   */
  const { data: shipment, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['conditional-shipment', shipmentId],
    queryFn: () => getShipment(shipmentId),
    enabled: isValidId,
    retry: false,
  });

  /**
   * Estado de refresh
   */
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  /**
   * Inicializar estado de processamento quando dados carregarem
   */
  useEffect(() => {
    if (isValidId && shipment?.items && !hasShipmentDraft) {
      initializeShipmentDraft(
        shipmentId,
        shipment.items.map((item) => ({
          id: item.id,
          quantity_kept: item.quantity_kept,
          quantity_returned: item.quantity_returned,
          quantity_damaged: item.quantity_damaged,
          quantity_lost: item.quantity_lost,
          notes: item.notes || '',
        }))
      );
    }
  }, [hasShipmentDraft, initializeShipmentDraft, isValidId, shipment?.items, shipmentId]);

  /**
   * Mutation: Processar devolução
   */
  const processReturnMutation = useMutation({
    mutationFn: (data: ProcessReturnDTO) =>
      processReturn(shipmentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipment', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      resetShipmentDraft(shipmentId);

      // Verificar se há itens comprados para feedback mais preciso
      const hasKeptItems = summary.keptCount > 0;

      let message = '';
      if (variables.create_sale) {
        // Usuário clicou em "Finalizar Venda"
        message = hasKeptItems
          ? `Venda de ${formatCurrency(summary.totalKept)} finalizada com sucesso!`
          : 'Devolução processada com sucesso!';
      } else {
        // Usuário clicou em "Salvar Progresso"
        message = hasKeptItems
          ? `Progresso salvo! Venda de ${formatCurrency(summary.totalKept)} criada automaticamente.`
          : 'Progresso salvo com sucesso!';
      }

      setSuccessMessage(message);
      setSuccessDialog(true);

      if (variables.create_sale) {
        setTimeout(() => router.back(), 1500);
      }
    },
    onError: (error: any) => {
      let message = error?.response?.data?.detail || error?.message || 'Erro ao processar devolução';

      // Melhorar mensagens de erro comuns
      if (typeof message === 'string') {
        if (message.includes('PENDING') || message.includes('não foi enviado')) {
          message =
            'Este envio ainda não foi enviado ao cliente.\n\n' +
            'Para processar a devolução:\n' +
            '1. Marque o envio como "Enviado"\n' +
            '2. Aguarde o retorno dos produtos\n' +
            '3. Depois volte aqui para processar';
        } else if (message.includes('COMPLETED') || message.includes('finalizado')) {
          message = 'Este envio já foi finalizado e não pode mais ser editado.';
        } else if (message.includes('CANCELLED') || message.includes('cancelado')) {
          message = 'Este envio foi cancelado e não pode ser processado.';
        }
      }

      setErrorMessage(message);
      setErrorDialog(true);
    },
  });

  /**
   * Mutation: Cancelar envio
   */
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelShipment(shipmentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      resetShipmentDraft(shipmentId);
      setSuccessMessage('Envio cancelado com sucesso!');
      setSuccessDialog(true);
      setTimeout(() => router.back(), 1500);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || error?.message || 'Erro ao cancelar envio';
      setErrorMessage(message);
      setErrorDialog(true);
    },
  });

  /**
   * Mutation: Marcar como enviado
   */
  const markAsSentMutation = useMutation({
    mutationFn: (data: { carrier?: string; tracking_code?: string }) =>
      markAsSent(shipmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['conditional-shipment', shipmentId] });
      setSuccessMessage('Envio marcado como enviado com sucesso!');
      setSuccessDialog(true);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || error?.message || 'Erro ao marcar como enviado';
      setErrorMessage(message);
      setErrorDialog(true);
    },
  });


  /**
   * Atualizar item individual
   */
  const updateItem = useCallback((itemId: number, updates: Record<string, any>) => {
    updateShipmentItem(shipmentId, itemId, updates);
  }, [shipmentId, updateShipmentItem]);

  /**
   * Ações rápidas para items
   */
  const handleBuyAll = useCallback((item: ConditionalShipmentItem) => {
    updateItem(item.id, {
      quantity_kept: item.quantity_sent,
      quantity_returned: 0,
      quantity_damaged: 0,
      quantity_lost: 0,
    });
  }, [updateItem]);

  const handleReturnAll = useCallback((item: ConditionalShipmentItem) => {
    updateItem(item.id, {
      quantity_kept: 0,
      quantity_returned: item.quantity_sent,
      quantity_damaged: 0,
      quantity_lost: 0,
    });
  }, [updateItem]);

  const handleOpenCancelModal = useCallback(() => {
    setActiveModal({ visible: true, type: 'cancel', reason: '' });
  }, []);

  const handleOpenMarkSentModal = useCallback(() => {
    setActiveModal({ visible: true, type: 'mark_sent', carrier: '', tracking_code: '' });
  }, []);

  const handleOpenLossScreen = useCallback((item: ConditionalShipmentItem) => {
    router.push({
      pathname: '/(tabs)/stock-losses/register' as any,
      params: {
        shipmentId: shipmentId.toString(),
        itemId: item.id.toString(),
        productName: item.product_name || `Produto #${item.product_id}`,
        variantLabel: [item.variant_size, item.variant_color].filter(Boolean).join(' · '),
        quantitySent: item.quantity_sent.toString(),
        unitCost: String(item.unit_cost ?? item.unit_price),
      },
    });
  }, [router, shipmentId]);

  /**
   * Calcular resumo financeiro
   */
  const summary = useMemo(() => {
    if (!shipment?.items) {
      return {
        totalSent: 0,
        totalKept: 0,
        totalReturned: 0,
        totalLossExpense: 0,
        sentCount: 0,
        keptCount: 0,
        returnedCount: 0,
        damagedCount: 0,
        lostCount: 0,
      };
    }

    let totalSent = 0;
    let totalKept = 0;
    let totalReturned = 0;
    let totalLossExpense = 0;
    let sentCount = 0;
    let keptCount = 0;
    let returnedCount = 0;
    let damagedCount = 0;
    let lostCount = 0;

    shipment.items.forEach((item) => {
      const processing = processingItems[item.id];
      if (!processing) return;

      totalSent += item.quantity_sent * item.unit_price;
      totalKept += processing.quantity_kept * item.unit_price;
      totalReturned += processing.quantity_returned * item.unit_price;
      totalLossExpense += processing.quantity_lost * (item.unit_cost ?? item.unit_price);
      sentCount += item.quantity_sent;
      keptCount += processing.quantity_kept;
      returnedCount += processing.quantity_returned;
      damagedCount += processing.quantity_damaged;
      lostCount += processing.quantity_lost;
    });

    return {
      totalSent,
      totalKept,
      totalReturned,
      totalLossExpense,
      sentCount,
      keptCount,
      returnedCount,
      damagedCount,
      lostCount,
    };
  }, [shipment, processingItems]);

  /**
   * Validar se todos items foram processados
   */
  const isFullyProcessed = useMemo(() => {
    if (!shipment?.items) return false;

    return shipment.items.every((item) => {
      const processing = processingItems[item.id];
      if (!processing) return false;

      const total =
        processing.quantity_kept +
        processing.quantity_returned +
        processing.quantity_damaged +
        processing.quantity_lost;

      return total === item.quantity_sent;
    });
  }, [shipment, processingItems]);

  /**
   * Finalizar venda
   */
  const handleFinalizeSale = useCallback(() => {
    // Validar se o envio foi enviado
    if (shipment?.status === 'PENDING') {
      setErrorMessage(
        'Este envio ainda não foi enviado ao cliente.\n\n' +
        'Para processar a devolução:\n' +
        '1. Marque o envio como "Enviado"\n' +
        '2. Aguarde o retorno dos produtos\n' +
        '3. Depois volte aqui para processar'
      );
      setErrorDialog(true);
      return;
    }

    if (!isFullyProcessed) {
      setErrorMessage('Todos os items devem ser processados antes de finalizar');
      setErrorDialog(true);
      return;
    }

    if (!shipment?.items) return;

    const items: ProcessReturnItemDTO[] = shipment.items.map((item) => {
      const processing = processingItems[item.id];

      let status: ShipmentItemStatus = 'SENT';
      if (processing.quantity_kept > 0) status = 'KEPT';
      else if (processing.quantity_returned > 0) status = 'RETURNED';
      else if (processing.quantity_damaged > 0) status = 'DAMAGED';
      else if (processing.quantity_lost > 0) status = 'LOST';

      return {
        id: item.id,
        quantity_kept: processing.quantity_kept,
        quantity_returned: processing.quantity_returned,
        quantity_damaged: processing.quantity_damaged,
        quantity_lost: processing.quantity_lost,
        status,
        notes: processing.notes || undefined,
      };
    });

    const effectivePaymentMethod = paymentMethod === 'credit_card' && installments > 1
      ? 'installments'
      : paymentMethod;

    const details = [
      `Total da venda: ${formatCurrency(summary.totalKept)}`,
      `Items comprados: ${summary.keptCount}`,
      `Items devolvidos: ${summary.returnedCount}`,
    ];

    if (summary.damagedCount > 0) {
      details.push(`Items danificados: ${summary.damagedCount}`);
    }
    if (summary.lostCount > 0) {
      details.push(`Items perdidos: ${summary.lostCount}`);
      details.push(`Despesa prevista por perda: ${formatCurrency(summary.totalLossExpense)}`);
    }
    if (summary.keptCount > 0) {
      details.push(`Forma de pagamento: ${translatePaymentMethod(effectivePaymentMethod)}`);
      if (paymentMethod === 'credit_card') {
        details.push(`Parcelamento: ${installments === 1 ? 'A vista' : `${installments}x`}`);
      }
    }

    setConfirmDialog({
      visible: true,
      type: 'success',
      title: 'Confirmar Finalização',
      message: summary.keptCount > 0
        ? 'Isso irá criar uma venda para os itens comprados e devolver o estoque não vendido. O envio será marcado como CONCLUÍDO.'
        : 'Isso irá processar a devolução completa e marcar o envio como CONCLUÍDO.',
      details,
      onConfirm: () => {
        setConfirmDialog({ ...confirmDialog, visible: false });
        processReturnMutation.mutate({
          items,
          create_sale: true,
          payment_method: effectivePaymentMethod,
          notes: paymentMethod === 'credit_card'
            ? `Pagamento no credito (${installments === 1 ? 'a vista' : `${installments}x`})`
            : undefined,
        });
      },
    });
  }, [isFullyProcessed, shipment, processingItems, summary, processReturnMutation, paymentMethod, installments]);

  /**
   * Cancelar envio
   */
  const handleCancelShipment = useCallback(() => {
    const { reason } = activeModal;

    if (!reason || reason.trim() === '') {
      setErrorMessage('Informe o motivo do cancelamento');
      setErrorDialog(true);
      return;
    }

    setActiveModal({ visible: false, type: null });

    setConfirmDialog({
      visible: true,
      type: 'danger',
      title: 'Confirmar Cancelamento',
      message: 'Todo o estoque será devolvido. Esta ação não pode ser desfeita.',
      details: [`Motivo: ${reason}`],
      onConfirm: () => {
        setConfirmDialog({ ...confirmDialog, visible: false });
        cancelMutation.mutate(reason);
      },
    });
  }, [activeModal, cancelMutation]);

  /**
   * Marcar como enviado
   */
  const handleMarkAsSent = useCallback(() => {
    const { carrier, tracking_code } = activeModal;

    setActiveModal({ visible: false, type: null });

    const details = [];
    if (carrier) details.push(`Transportadora: ${carrier}`);
    if (tracking_code) details.push(`Rastreio: ${tracking_code}`);

    setConfirmDialog({
      visible: true,
      type: 'info',
      title: 'Confirmar Envio',
      message: 'O prazo de devolução será iniciado a partir de agora.',
      details: details.length > 0 ? details : undefined,
      onConfirm: () => {
        setConfirmDialog({ ...confirmDialog, visible: false });
        markAsSentMutation.mutate({ carrier, tracking_code });
      },
    });
  }, [activeModal, markAsSentMutation]);

  useFocusEffect(
    useCallback(() => {
      headerAnim.setValue(0);
      contentAnim.setValue(0);

      Animated.spring(headerAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 14,
        stiffness: 125,
        mass: 0.9,
      }).start();

      Animated.spring(contentAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 16,
        stiffness: 115,
        mass: 1,
        delay: 140,
      }).start();
    }, [contentAnim, headerAnim])
  );


  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Envio Condicional"
          subtitle="Carregando..."
          showBackButton
          onBack={() => router.push('/(tabs)/conditional')}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
          <Text style={{ marginTop: 16, color: Colors.light.textSecondary, fontSize: 16 }}>Carregando envio...</Text>
        </View>
      </View>
    );
  }

  if (isError || !shipment) {
    const detail = error instanceof Error
      ? error.message
      : 'Não foi possível carregar os dados do envio. Tente novamente.';

    return (
      <View style={styles.container}>
        <PageHeader
          title="Envio Condicional"
          subtitle="Falha ao carregar"
          showBackButton
          onBack={() => router.push('/(tabs)/conditional')}
        />

        <View style={styles.centerContainer}>
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={40} color={Colors.light.warning} />
            <Text style={styles.errorTitle}>Erro ao carregar</Text>
            <Text style={styles.errorText}>{detail}</Text>

            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()} activeOpacity={0.75}>
              <Text style={styles.retryButtonText}>Tentar Novamente</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Configuração do badge de status - CORRIGIDO
  const statusColor = SHIPMENT_STATUS_COLORS[shipment.status] ?? Colors.light.info;
  const statusIcon = SHIPMENT_STATUS_ICONS[shipment.status] ?? 'information';
  const statusLabel = SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status;

  // Badge type baseado no STATUS, não no deadline
  let badgeType: 'error' | 'warning' | 'success' | 'info' = 'info';
  if (isFinalStatus(shipment.status)) badgeType = 'success';
  else if (shipment.status === 'OVERDUE') badgeType = 'error';
  else if (shipment.status === 'RETURNED_NO_SALE') badgeType = 'error';
  else if (shipment.status === 'SENT') badgeType = 'warning';

  const deadlineText = shipment.deadline ? formatDeadline(shipment.deadline) : 'Sem prazo';
  const deadlineColor = shipment.deadline ? getDeadlineColor(shipment.deadline) : VALUE_COLORS.positive;
  const isOverdue = shipment.status === 'OVERDUE' || shipment.is_overdue;
  const overdueDays = shipment.days_remaining < 0 ? Math.abs(shipment.days_remaining) : 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [
            { scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        }}
      >
        <PageHeader
          title="Envio Condicional"
          subtitle={shipment.customer_name || `Cliente #${shipment.customer_id}`}
          showBackButton
          onBack={() => router.push('/(tabs)/conditional')}
        />
      </Animated.View>

      <Animated.View
        style={{
          flex: 1,
          opacity: contentAnim,
          transform: [
            { translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          ],
        }}
      >
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.light.primary]}
            />
          }
        >
        <View style={[styles.statusHeroCard, { borderColor: statusColor + '40' }]}>
          <View style={styles.statusHeroHeader}>
            <View style={[styles.statusHeroIconWrap, { backgroundColor: statusColor + '18' }]}>
              <Ionicons name={statusIcon as any} size={18} color={statusColor} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.statusHeroLabel}>Status do Envio</Text>
              <Text style={styles.statusHeroValue} numberOfLines={1}>{statusLabel}</Text>
            </View>
            <View style={[styles.statusHeroBadge, { backgroundColor: statusColor + '15' }]}>
              <Text style={[styles.statusHeroBadgeText, { color: statusColor }]}>{shipment.items.length} itens</Text>
            </View>
          </View>
          {isOverdue && (
            <View style={styles.overdueBadgeRow}>
              <View style={styles.overdueBadge}>
                <Ionicons name="alert-circle-outline" size={12} color={VALUE_COLORS.negative} />
                <Text style={styles.overdueBadgeText}>
                  {overdueDays > 0 ? `${overdueDays} dia(s) de atraso` : 'Atrasado'}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.statusHeroMetaRow}>
            <Text style={styles.statusHeroMetaText} numberOfLines={1}>Valor enviado: {formatCurrency(summary.totalSent)}</Text>
            <Text style={[styles.statusHeroMetaText, { color: deadlineColor }]} numberOfLines={1}>{deadlineText}</Text>
          </View>
        </View>

        {/* Card Consolidado de Informações */}
        <View style={styles.surfaceCard}>
          <View style={styles.surfaceContent}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="information-circle-outline" size={18} color={brandingColors.primary} />
              </View>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Informações do Envio
              </Text>
            </View>
            <View style={styles.infoBlocksContainer}>
              <View style={styles.infoBlock}>
                <View style={styles.infoBlockHeader}>
                  <Ionicons name="person-outline" size={16} color={brandingColors.primary} />
                  <Text style={styles.infoBlockLabel}>Cliente</Text>
                </View>
                <Text style={styles.infoBlockPrimary}>{shipment.customer_name || `#${shipment.customer_id}`}</Text>
                {shipment.customer_phone && (
                  <Text style={styles.infoBlockSecondary}>{shipment.customer_phone}</Text>
                )}
              </View>

              <View style={styles.infoBlock}>
                <View style={styles.infoBlockHeader}>
                  <Ionicons name="location-outline" size={16} color={brandingColors.primary} />
                  <Text style={styles.infoBlockLabel}>Endereço</Text>
                </View>
                <Text style={styles.infoBlockPrimary}>{shipment.shipping_address}</Text>
              </View>

              {/* Data de Envio */}
              {shipment.sent_at && (
                <View style={styles.infoBlock}>
                  <View style={styles.infoBlockHeader}>
                    <Ionicons name="calendar-outline" size={16} color={brandingColors.primary} />
                    <Text style={styles.infoBlockLabel}>Enviado em</Text>
                  </View>
                  <Text style={styles.infoBlockPrimary}>{formatDateTime(shipment.sent_at)}</Text>
                </View>
              )}

              {/* Prazo - apenas se relevante */}
              {shipment.deadline && !isFinalStatus(shipment.status) && (
                <View style={styles.infoBlock}>
                  <View style={styles.infoBlockHeader}>
                    <Ionicons
                      name={shipment.is_overdue ? 'alert-circle-outline' : 'time-outline'}
                      size={16}
                      color={deadlineColor}
                    />
                    <Text style={styles.infoBlockLabel}>Prazo de Devolução</Text>
                  </View>
                  <Text style={[styles.infoBlockPrimary, { color: deadlineColor, fontWeight: '700' }]}>
                    {deadlineText}
                  </Text>
                </View>
              )}

              {/* Observações */}
              {shipment.notes && (
                <View style={styles.infoBlock}>
                  <View style={styles.infoBlockHeader}>
                    <Ionicons name="document-text-outline" size={16} color={brandingColors.primary} />
                    <Text style={styles.infoBlockLabel}>Observações</Text>
                  </View>
                  <Text style={styles.infoBlockPrimary}>{shipment.notes}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Resumo Financeiro */}
        <View style={styles.summaryCardHighlight}>
          <View style={styles.surfaceContent}>
            <View style={styles.summaryHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="cash-outline" size={18} color={brandingColors.primary} />
              </View>
              <Text variant="titleMedium" style={styles.summaryTitleHighlight}>
                Resumo Financeiro
              </Text>
            </View>

            {/* Linhas de valores no formato chave → valor */}
            <View style={styles.financialSummaryList}>
              {/* Cliente Comprou - destaque */}
              <View style={[styles.financialRow, styles.financialRowMain]}>
                <View style={styles.financialKey}>
                  <Text style={styles.financialKeyTextMain}>Cliente Comprou</Text>
                  <Text style={styles.financialKeySubtext}>{summary.keptCount} de {summary.sentCount} produtos</Text>
                </View>
                <Text style={[styles.financialValueMain, { color: VALUE_COLORS.positive }]}>{formatCurrency(summary.totalKept)}</Text>
              </View>

              <View style={styles.financialDivider} />

              {/* Total Enviado */}
              <View style={styles.financialRow}>
                <Text style={styles.financialKeyText}>Total Enviado</Text>
                <Text style={styles.financialValue}>{formatCurrency(summary.totalSent)}</Text>
              </View>

              {/* Devolvido */}
              <View style={styles.financialRow}>
                <Text style={styles.financialKeyText}>Devolvido</Text>
                <Text style={styles.financialValue}>{formatCurrency(summary.totalReturned)}</Text>
              </View>

              {summary.totalLossExpense > 0 && (
                <View style={styles.financialRow}>
                  <Text style={styles.financialKeyText}>Despesa por perda</Text>
                  <Text style={[styles.financialValue, { color: Colors.light.error }]}>
                    {formatCurrency(summary.totalLossExpense)}
                  </Text>
                </View>
              )}
            </View>

            {/* Alertas de Danificados/Perdidos */}
            {(summary.damagedCount > 0 || summary.lostCount > 0) && (
              <View style={styles.summaryAlertRow}>
                {summary.damagedCount > 0 && (
                  <View style={styles.summaryAlert}>
                    <Ionicons name="alert-circle" size={16} color={Colors.light.warning} />
                    <Text style={styles.summaryAlertText}>{summary.damagedCount} danificado(s)</Text>
                  </View>
                )}
                {summary.lostCount > 0 && (
                  <View style={styles.summaryAlert}>
                    <Ionicons name="close-circle" size={16} color={Colors.light.error} />
                    <Text style={styles.summaryAlertText}>{summary.lostCount} perdido(s)</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Lista de Items - SIMPLIFICADO */}
        <View style={styles.itemsSection}>
          <View style={styles.itemsSectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
              <Ionicons name="cube-outline" size={18} color={brandingColors.primary} />
            </View>
            <Text variant="titleMedium" style={styles.itemsSectionTitle}>
              Produtos ({shipment.items.length})
            </Text>
            <View style={styles.itemsCountBadge}>
              <Text style={styles.itemsCountBadgeText}>{shipment.items.length}</Text>
            </View>
          </View>

          <View style={styles.itemsModuleBadge}>
            <Ionicons name="sparkles-outline" size={12} color={Colors.light.textSecondary} />
            <Text style={styles.itemsModuleBadgeText}>Use "Prejuízo do Item" para danos e perdas</Text>
          </View>

          {shipment.items.map((item) => {
            const processing = processingItems[item.id] || {
              quantity_kept: 0,
              quantity_returned: 0,
              quantity_damaged: 0,
              quantity_lost: 0,
              notes: '',
            };

            const totalProcessed =
              processing.quantity_kept +
              processing.quantity_returned +
              processing.quantity_damaged +
              processing.quantity_lost;

            const isItemFullyProcessed = totalProcessed === item.quantity_sent;
            const pendingCount = Math.max(0, item.quantity_sent - totalProcessed);

            return (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.surfaceContent}>
                  {/* Cabeçalho do item - COMPACTO */}
                  <View style={styles.itemHeaderCompact}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleSmall" style={styles.itemName}>
                        {item.product_name || `Produto #${item.product_id}`}
                      </Text>
                      {(item.variant_size || item.variant_color) && (
                        <Text style={styles.itemVariant}>
                          {[item.variant_size, item.variant_color].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      <View style={styles.itemMetaBadges}>
                        {(item.variant_sku || item.product_sku) && (
                          <View style={styles.itemMetaBadge}>
                            <Text style={styles.itemMeta}>SKU: {item.variant_sku || item.product_sku}</Text>
                          </View>
                        )}
                        <View style={styles.itemMetaBadgeStrong}>
                          <Text style={styles.itemMetaStrong}>
                            {item.quantity_sent} x {formatCurrency(item.unit_price)} = {formatCurrency(item.quantity_sent * item.unit_price)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.itemStatusBadge, isItemFullyProcessed ? styles.itemStatusBadgeDone : styles.itemStatusBadgePending]}>
                      <Text style={[styles.itemStatusBadgeText, isItemFullyProcessed ? styles.itemStatusBadgeTextDone : styles.itemStatusBadgeTextPending]}>
                        {isItemFullyProcessed ? 'Concluido' : `${pendingCount} pendente(s)`}
                      </Text>
                    </View>
                  </View>

                  {/* Inputs de processamento - Apenas permitir edição se status for SENT */}
                  {(shipment.status === 'SENT' || shipment.status === 'OVERDUE') && (
                    <View style={styles.processingSection}>
                      <View style={styles.inputRow}>
                        <TextInput
                          label="Qtd. Comprada"
                          value={processing.quantity_kept.toString()}
                          onChangeText={(text) => {
                            const num = parseInt(text) || 0;
                            if (num >= 0 && num <= item.quantity_sent) {
                              updateItem(item.id, { quantity_kept: num });
                            }
                          }}
                          keyboardType="numeric"
                          mode="outlined"
                          dense
                          style={styles.quantityInput}
                        />
                        <TextInput
                          label="Qtd. Devolvida"
                          value={processing.quantity_returned.toString()}
                          onChangeText={(text) => {
                            const num = parseInt(text) || 0;
                            if (num >= 0 && num <= item.quantity_sent) {
                              updateItem(item.id, { quantity_returned: num });
                            }
                          }}
                          keyboardType="numeric"
                          mode="outlined"
                          dense
                          style={styles.quantityInput}
                        />
                      </View>

                      {/* Botões rápidos */}
                      <View style={styles.quickActions}>
                        <TouchableOpacity
                          onPress={() => handleBuyAll(item)}
                          style={[styles.quickButton, styles.quickButtonOutlined]}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="checkmark-circle-outline" size={16} color={brandingColors.primary} />
                          <Text style={[styles.quickButtonText, { color: brandingColors.primary }]}>Comprou Tudo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleReturnAll(item)}
                          style={[styles.quickButton, styles.quickButtonOutlined]}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="refresh-outline" size={16} color={brandingColors.primary} />
                          <Text style={[styles.quickButtonText, { color: brandingColors.primary }]}>Devolveu Tudo</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        onPress={() => handleOpenLossScreen(item)}
                        style={styles.lossActionButton}
                        activeOpacity={0.75}
                      >
                        <View style={styles.lossActionContent}>
                          <View style={styles.lossActionCopy}>
                            <Text style={styles.lossActionTitle}>Prejuízo do Item</Text>
                            <Text style={styles.lossActionSubtitle}>
                              Registre dano ou perda e revise o custo lançado para itens perdidos.
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward-outline" size={18} color={Colors.light.textSecondary} />
                        </View>
                      </TouchableOpacity>

                      {(processing.quantity_damaged > 0 || processing.quantity_lost > 0) && (
                        <View style={styles.lossSummaryRow}>
                          {processing.quantity_damaged > 0 && (
                            <View style={styles.lossSummaryChipWarning}>
                              <Text style={styles.lossSummaryChipWarningText}>
                                {processing.quantity_damaged} danificado(s)
                              </Text>
                            </View>
                          )}
                          {processing.quantity_lost > 0 && (
                            <View style={styles.lossSummaryChipDanger}>
                              <Text style={styles.lossSummaryChipDangerText}>
                                {processing.quantity_lost} perdido(s)
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Observações do item */}
                      <TextInput
                        label="Observações"
                        value={processing.notes}
                        onChangeText={(text) => updateItem(item.id, { notes: text })}
                        mode="outlined"
                        dense
                        multiline
                        numberOfLines={2}
                        style={styles.notesInput}
                      />
                    </View>
                  )}

                  {/* Estado read-only aprimorado para venda parcial já processada */}
                  {shipment.status === 'COMPLETED_PARTIAL_SALE' && (
                    <View style={styles.partialReturnItemSummary}>
                      <View style={styles.partialReturnHeader}>
                        <Ionicons name="lock-closed-outline" size={16} color={Colors.light.textSecondary} />
                        <Text style={styles.partialReturnHeaderText}>Compra Processada</Text>
                      </View>

                      <View style={styles.readOnlyGrid}>
                        <View style={styles.readOnlyRow}>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.light.success} />
                          <Text style={styles.readOnlyLabel}>Comprado:</Text>
                          <Text style={styles.readOnlyValue}>{processing.quantity_kept} un</Text>
                        </View>

                        <View style={styles.readOnlyRow}>
                          <Ionicons name="return-up-back" size={18} color={Colors.light.textSecondary} />
                          <Text style={styles.readOnlyLabel}>Devolvido:</Text>
                          <Text style={styles.readOnlyValue}>{processing.quantity_returned} un</Text>
                        </View>

                        {(processing.quantity_damaged > 0 || processing.quantity_lost > 0) && (
                          <View style={styles.readOnlyRow}>
                            <Ionicons name="alert-circle" size={18} color={Colors.light.warning} />
                            <Text style={styles.readOnlyLabel}>Danificado/Perdido:</Text>
                            <Text style={styles.readOnlyValue}>
                              {processing.quantity_damaged + processing.quantity_lost} un
                            </Text>
                          </View>
                        )}
                      </View>

                      {processing.notes && (
                        <View style={styles.notesReadOnly}>
                          <Text style={styles.notesReadOnlyLabel}>Observações:</Text>
                          <Text style={styles.notesReadOnlyText}>{processing.notes}</Text>
                        </View>
                      )}

                      <View style={styles.partialReturnWarning}>
                        <Ionicons name="information-circle" size={16} color={Colors.light.textSecondary} />
                        <Text style={styles.partialReturnWarningText}>
                          Venda registrada. Não é possível editar quantidades já processadas.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Resumo read-only quando finalizado */}
                  {isFinalStatus(shipment.status) && (
                    <View style={styles.readOnlySummary}>
                      <Text style={styles.readOnlyLabel}>Quantidade Comprada: {processing.quantity_kept} un</Text>
                      <Text style={styles.readOnlyLabel}>Quantidade Devolvida: {processing.quantity_returned} un</Text>
                      {processing.quantity_damaged > 0 && (
                        <Text style={styles.readOnlyLabel}>Quantidade Danificada: {processing.quantity_damaged} un</Text>
                      )}
                      {processing.quantity_lost > 0 && (
                        <Text style={styles.readOnlyLabel}>Quantidade Perdida: {processing.quantity_lost} un</Text>
                      )}
                      {processing.notes && (
                        <Text style={styles.readOnlyNotes}>Obs: {processing.notes}</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Ações baseadas no status */}
        {shipment?.status === 'PENDING' && (
          <>
            {/* Banner de aviso */}
            <View style={styles.warningCard}>
              <View style={styles.surfaceContent}>
                <View style={styles.warningHeader}>
                  <Ionicons name="alert-circle" size={24} color={Colors.light.warning} />
                  <Text variant="titleMedium" style={styles.warningTitle}>
                    Envio ainda não foi enviado
                  </Text>
                </View>
                <Text variant="bodyMedium" style={styles.warningText}>
                  Marque o envio como "Enviado" quando o pacote sair da loja. O prazo de devolução
                  começará a contar a partir desse momento.
                </Text>
              </View>
            </View>

            <View style={styles.pendingActionsWrapper}>
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={handleOpenCancelModal}
                  style={[styles.actionButton, styles.dangerActionButton]}
                  disabled={markAsSentMutation.isPending || cancelMutation.isPending}
                  activeOpacity={0.75}
                >
                  <View style={styles.dangerActionContent}>
                    <View style={styles.dangerActionIconWrap}>
                      <Ionicons name="close-circle-outline" size={15} color={Colors.light.error} />
                    </View>
                    <Text style={styles.dangerActionButtonText}>Cancelar Envio</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleOpenMarkSentModal}
                  style={[styles.actionButton, styles.primaryActionButton]}
                  disabled={markAsSentMutation.isPending || cancelMutation.isPending}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={brandingColors.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryActionButtonGradient}
                  >
                    {markAsSentMutation.isPending ? (
                      <ActivityIndicator size={18} color="#fff" />
                    ) : (
                      <Ionicons name="send-outline" size={18} color="#fff" />
                    )}
                    <Text style={styles.primaryActionButtonText}>Marcar como Enviado</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {shipment?.status === 'COMPLETED_PARTIAL_SALE' && (
          <View style={styles.surfaceCard}>
            <View style={styles.surfaceContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                  <Ionicons name="flash-outline" size={18} color={brandingColors.primary} />
                </View>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Processamento Concluido
                </Text>
              </View>

              <View style={styles.partialReturnInfoBox}>
                <Ionicons name="information-circle" size={24} color={brandingColors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={styles.partialReturnInfoText}>
                    <Text style={{ fontWeight: '700' }}>Venda parcial já registrada</Text>
                    {'\n'}
                    Você pode finalizar o envio para processar os itens restantes ou cancelar caso necessário.
                  </Text>
                </View>
              </View>

              <View style={styles.inlineInfoBox}>
                <Ionicons name="checkmark-circle-outline" size={18} color={VALUE_COLORS.positive} />
                <Text style={styles.inlineInfoText}>
                  Venda parcial ja concluida. Este envio esta finalizado e nao permite novas acoes.
                </Text>
              </View>
            </View>
          </View>
        )}

        {(shipment?.status === 'SENT' || shipment?.status === 'OVERDUE') && (
          <>
            <View style={styles.surfaceCard}>
              <View style={styles.surfaceContent}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                    <Ionicons name="flash-outline" size={18} color={brandingColors.primary} />
                  </View>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    Finalizar Processamento
                  </Text>
                </View>

                <Text style={styles.sectionDescription}>
                  Revise os produtos processados abaixo e conclua o envio quando todas as quantidades estiverem definidas.
                </Text>

                <View style={styles.processingStatusRow}>
                  <Text style={styles.processingStatusLabel}>Progresso</Text>
                  <Text style={styles.processingStatusValue}>
                    {shipment.items.filter(item => {
                      const p = processingItems[item.id];
                      if (!p) return false;
                      const total = p.quantity_kept + p.quantity_returned + p.quantity_damaged + p.quantity_lost;
                      return total === item.quantity_sent;
                    }).length} de {shipment.items.length} produtos
                  </Text>
                </View>

                {!isFullyProcessed && (
                  <View style={styles.inlineInfoBox}>
                    <Ionicons name="information-circle-outline" size={18} color={brandingColors.primary} />
                    <Text style={styles.inlineInfoText}>
                      Finalize o processamento de todos os produtos para habilitar a conclusão deste envio.
                    </Text>
                  </View>
                )}

                {summary.keptCount > 0 && (
                  <View style={styles.paymentSection}>
                    <Text variant="labelLarge" style={styles.paymentLabel}>
                      Forma de Pagamento
                    </Text>
                    <View style={styles.paymentChips}>
                      {([
                        { key: 'pix', label: 'Pix' },
                        { key: 'cash', label: 'Dinheiro' },
                        { key: 'credit_card', label: 'Crédito' },
                        { key: 'debit_card', label: 'Débito' },
                      ] as const).map(({ key, label }) => (
                        <Chip
                          key={key}
                          selected={paymentMethod === key}
                          onPress={() => {
                            setPaymentMethod(key);
                            if (key !== 'credit_card') {
                              setInstallments(1);
                            }
                          }}
                          style={[
                            styles.paymentChip,
                            paymentMethod === key && {
                              backgroundColor: brandingColors.primary + '20',
                              borderColor: brandingColors.primary,
                              borderWidth: 1,
                            },
                          ]}
                          textStyle={paymentMethod === key ? { color: brandingColors.primary, fontWeight: '600' } : undefined}
                          compact
                          showSelectedCheck={false}
                        >
                          {label}
                        </Chip>
                      ))}
                    </View>

                    {paymentMethod === 'credit_card' && (
                      <View style={styles.installmentPicker}>
                        <View style={styles.installmentPickerHeader}>
                          <View style={[styles.installmentPickerIconWrap, { backgroundColor: brandingColors.primary + '15' }]}>
                            <Ionicons name="card-outline" size={14} color={brandingColors.primary} />
                          </View>
                          <Text style={styles.installmentPickerLabel}>Parcelamento no credito</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={styles.installmentChipsRow}>
                            {installmentOptions.map((opt) => (
                              <TouchableOpacity
                                key={opt.value}
                                style={[
                                  styles.installmentChip,
                                  installments === opt.value && {
                                    backgroundColor: brandingColors.primary + '15',
                                    borderColor: brandingColors.primary,
                                  },
                                ]}
                                onPress={() => setInstallments(opt.value)}
                                activeOpacity={0.75}
                              >
                                <Text
                                  style={[
                                    styles.installmentChipText,
                                    installments === opt.value && { color: brandingColors.primary },
                                  ]}
                                >
                                  {opt.label}
                                </Text>
                                {opt.value > 1 && (
                                  <Text style={styles.installmentChipSubText}>
                                    {formatCurrency(summary.totalKept / opt.value)}
                                  </Text>
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={handleOpenCancelModal}
                    style={[styles.actionButton, styles.dangerActionButton]}
                    disabled={processReturnMutation.isPending || cancelMutation.isPending}
                    activeOpacity={0.75}
                  >
                      <View style={styles.dangerActionContent}>
                        <View style={styles.dangerActionIconWrap}>
                          <Ionicons name="close-circle-outline" size={15} color={Colors.light.error} />
                        </View>
                        <Text style={styles.dangerActionButtonText}>Cancelar Envio</Text>
                      </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleFinalizeSale}
                    style={[
                      styles.actionButton,
                      styles.primaryActionButton,
                      !isFullyProcessed && styles.actionButtonDisabled
                    ]}
                    disabled={!isFullyProcessed || processReturnMutation.isPending || cancelMutation.isPending}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={isFullyProcessed ? [VALUE_COLORS.positive, '#22C55E'] : [Colors.light.textTertiary, Colors.light.textTertiary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryActionButtonGradient}
                    >
                      {processReturnMutation.isPending ? (
                        <ActivityIndicator size={18} color="#fff" />
                      ) : (
                        <Ionicons name={isFullyProcessed ? 'checkmark-circle-outline' : 'lock-closed-outline'} size={18} color="#fff" />
                      )}
                      <Text style={styles.primaryActionButtonText}>
                        {!isFullyProcessed
                          ? 'Processar Produtos Primeiro'
                          : (summary.keptCount > 0 ? 'Finalizar e Concluir' : 'Finalizar Devolução')}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                {!isFullyProcessed && (
                  <Text style={styles.disabledHintText}>
                    Marque as quantidades dos produtos acima para liberar a finalização.
                  </Text>
                )}
              </View>
            </View>
          </>
        )}
        </ScrollView>
      </Animated.View>

      {/* Modal Cancelar Envio */}
      <BottomSheet
        visible={activeModal.visible && activeModal.type === 'cancel'}
        onDismiss={() => setActiveModal({ visible: false, type: null })}
        title="Cancelar Envio"
        subtitle="Todo o estoque será devolvido"
        icon="close-circle-outline"
        actions={[
          { label: 'Voltar', onPress: () => setActiveModal({ visible: false, type: null }), variant: 'secondary' },
          { label: 'Confirmar Cancelamento', onPress: handleCancelShipment, variant: 'danger', loading: cancelMutation.isPending },
        ]}
      >
        <TextInput
          label="Motivo do cancelamento *"
          value={activeModal.reason}
          onChangeText={(text) => setActiveModal({ ...activeModal, reason: text })}
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.modalInput}
          autoFocus
        />

      </BottomSheet>

      {/* Modal Marcar como Enviado - UX Melhorada */}
      <MarkAsSentModal
        visible={activeModal.visible && activeModal.type === 'mark_sent'}
        onDismiss={() => setActiveModal({ visible: false, type: null })}
        onConfirm={(data) => {
          setActiveModal({ ...activeModal, carrier: data.carrier, tracking_code: data.tracking_code });
          setTimeout(() => handleMarkAsSent(), 0);
        }}
        loading={markAsSentMutation.isPending}
      />


      {/* Confirm Dialog */}
      <ConfirmDialog
        visible={confirmDialog.visible}
        type={confirmDialog.type}
        title={confirmDialog.title}
        message={confirmDialog.message}
        details={confirmDialog.details}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, visible: false })}
        loading={processReturnMutation.isPending || cancelMutation.isPending}
      />

      {/* Success Dialog */}
      <ConfirmDialog
        visible={successDialog}
        type="success"
        title="Sucesso"
        message={successMessage}
        onConfirm={() => setSuccessDialog(false)}
        confirmText="OK"
      />

      {/* Error Dialog */}
      <ConfirmDialog
        visible={errorDialog}
        type="danger"
        title="Erro"
        message={errorMessage}
        onConfirm={() => setErrorDialog(false)}
        confirmText="OK"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    paddingHorizontal: theme.spacing.md,
  },
  errorCard: {
    width: '100%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  errorTitle: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
  },
  errorText: {
    marginTop: theme.spacing.xs,
    textAlign: 'center',
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: theme.spacing.md,
    minHeight: 46,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
  },
  retryButtonText: {
    color: Colors.light.text,
    fontWeight: '700',
    fontSize: theme.fontSize.base,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  statusHeroCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    backgroundColor: Colors.light.card,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  statusHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statusHeroIconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusHeroLabel: {
    fontSize: theme.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  statusHeroValue: {
    marginTop: 2,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    fontWeight: '700',
  },
  statusHeroBadge: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusHeroBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusHeroMetaRow: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  statusHeroMetaText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  overdueBadgeRow: {
    marginTop: theme.spacing.sm,
  },
  overdueBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: VALUE_COLORS.negative + '45',
    backgroundColor: VALUE_COLORS.negative + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overdueBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: VALUE_COLORS.negative,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    elevation: 2,
  },
  surfaceCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  surfaceContent: {
    padding: theme.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.primary + '15',
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  infoGrid: {
    gap: 12,
  },
  deadlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  deadlineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  deadlineValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deadlineIcon: {
    marginRight: 4,
  },
  deadlineText: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryCardHighlight: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  summaryTitleHighlight: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  financialSummaryList: {
    gap: 12,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  financialRowMain: {
    paddingVertical: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 12,
  },
  financialKey: {
    flex: 1,
  },
  financialKeyText: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  financialKeyTextMain: {
    fontSize: 16,
    color: Colors.light.text,
    fontWeight: '700',
  },
  financialKeySubtext: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  financialValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginLeft: 16,
  },
  financialValueMain: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.text,
    marginLeft: 16,
  },
  financialDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 4,
  },
  itemsSection: {
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
  },
  itemsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  itemsSectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  itemsCountBadge: {
    marginLeft: 'auto',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  itemsCountBadgeText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '700',
  },
  itemsModuleBadge: {
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemsModuleBadgeText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  itemCard: {
    marginBottom: 12,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontWeight: '700',
    color: Colors.light.text,
  },
  itemStatusBadge: {
    flexShrink: 0,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemStatusBadgeDone: {
    backgroundColor: VALUE_COLORS.positive + '18',
  },
  itemStatusBadgePending: {
    backgroundColor: VALUE_COLORS.warning + '18',
  },
  itemStatusBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  itemStatusBadgeTextDone: {
    color: VALUE_COLORS.positive,
  },
  itemStatusBadgeTextPending: {
    color: VALUE_COLORS.warning,
  },
  itemSku: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  itemBadge: {
    backgroundColor: Colors.light.successLight,
    height: 28,
  },
  itemBadgeText: {
    fontSize: 11,
    color: Colors.light.success,
  },
  itemDetails: {
    gap: 4,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  itemDetailText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  processingSection: {
    gap: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quantityInput: {
    flex: 1,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  quickButtonOutlined: {
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  quickButtonWarning: {
    borderWidth: 1.5,
    borderColor: Colors.light.warning + '50',
    backgroundColor: Colors.light.warning + '10',
  },
  quickButtonDanger: {
    borderWidth: 1.5,
    borderColor: Colors.light.error + '50',
    backgroundColor: Colors.light.error + '10',
  },
  quickButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  lossActionButton: {
    marginTop: theme.spacing.xs,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  lossActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  lossActionCopy: {
    flex: 1,
  },
  lossActionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  lossActionSubtitle: {
    marginTop: 2,
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    lineHeight: 16,
  },
  lossSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: theme.spacing.sm,
  },
  lossSummaryChipWarning: {
    backgroundColor: Colors.light.warning + '15',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lossSummaryChipWarningText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: Colors.light.warning,
  },
  lossSummaryChipDanger: {
    backgroundColor: Colors.light.error + '12',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lossSummaryChipDangerText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: Colors.light.error,
  },
  notesInput: {
    marginTop: 4,
  },
  paymentSection: {
    marginTop: 16,
  },
  paymentLabel: {
    marginBottom: 8,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
  },
  paymentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  installmentPicker: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  installmentPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  installmentPickerIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  installmentPickerLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  installmentChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  installmentChip: {
    minWidth: 66,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  installmentChipText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '700',
  },
  installmentChipSubText: {
    marginTop: 2,
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  paymentChip: {
    backgroundColor: Colors.light.backgroundSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    width: '100%',
    alignSelf: 'stretch',
  },
  pendingActionsWrapper: {
    width: '100%',
    marginBottom: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
    height: 54,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  primaryActionButton: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  primaryActionButtonGradient: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    width: '100%',
  },
  primaryActionButtonText: {
    fontSize: theme.fontSize.base,
    color: '#fff',
    fontWeight: '700',
  },
  dangerActionButton: {
    borderWidth: 1,
    borderColor: Colors.light.error + '50',
    backgroundColor: Colors.light.error + '10',
  },
  dangerActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerActionIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.error + '18',
  },
  dangerActionButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.error,
  },
  actionButtonText: {
    marginTop: 4,
  },
  modalInput: {
    marginBottom: 16,
  },
  warningCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.light.warning,
    ...theme.shadows.sm,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  warningTitle: {
    color: Colors.light.text,
    fontWeight: '600',
  },
  warningText: {
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  helpText: {
    color: Colors.light.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  readOnlySummary: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    gap: 6,
  },
  readOnlyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  readOnlyNotes: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Styles para PARTIAL_RETURN
  partialReturnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    backgroundColor: Colors.light.info + '14',
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: VALUE_COLORS.neutral,
    marginTop: 12,
  },
  partialReturnTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  partialReturnText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  partialReturnItemSummary: {
    marginTop: 12,
    padding: 16,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 1,
    borderLeftColor: Colors.light.border,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  partialReturnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  partialReturnHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  readOnlyGrid: {
    gap: 10,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readOnlyValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  notesReadOnly: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.info + '35',
  },
  notesReadOnlyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  notesReadOnlyText: {
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 18,
  },
  partialReturnWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  partialReturnWarningText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 16,
    flex: 1,
  },
  partialReturnInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
  },
  partialReturnInfoText: {
    color: Colors.light.text,
    lineHeight: 20,
  },
  helpTextSmall: {
    color: Colors.light.textSecondary,
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  sectionDescription: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  processingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.light.border,
  },
  processingStatusLabel: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  processingStatusValue: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '700',
  },
  inlineInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: theme.spacing.md,
  },
  inlineInfoText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    lineHeight: 18,
  },
  // Estilos para banner de instrução URGENTE
  instructionBannerUrgent: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.warning,
    ...theme.shadows.sm,
  },
  instructionBannerReady: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.success,
    ...theme.shadows.sm,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  instructionTitle: {
    fontWeight: '700',
    color: Colors.light.text,
    fontSize: 16,
    marginBottom: 6,
  },
  instructionText: {
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  progressIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: Colors.light.info + '15',
    borderRadius: theme.borderRadius.md,
    marginTop: 12,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.primary,
    flex: 1,
  },
  stepsContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 8,
  },
  stepsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.primary,
    width: 20,
  },
  stepText: {
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
    lineHeight: 20,
  },
  disabledReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.light.warning,
    marginBottom: 16,
  },
  disabledReasonText: {
    fontSize: 14,
    color: Colors.light.text,
    lineHeight: 20,
    flex: 1,
    fontWeight: '600',
  },
  actionButtonDisabled: {
    elevation: 0,
    opacity: 0.72,
  },
  disabledHintText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  // Estilos para card consolidado de informações
  compactInfoGrid: {
    gap: 16,
  },
  infoBlocksContainer: {
    gap: theme.spacing.xs,
  },
  infoBlock: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  infoBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  infoBlockLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  infoBlockPrimary: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
    lineHeight: 20,
  },
  infoBlockSecondary: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  compactLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  compactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    lineHeight: 20,
  },
  compactSecondary: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  summaryAlertRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  summaryAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.warning + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  summaryAlertText: {
    fontSize: 12,
    color: Colors.light.text,
    fontWeight: '500',
  },
  // Estilos para item de produto compacto
  itemHeaderCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  itemMetaBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  itemMetaBadge: {
    backgroundColor: Colors.light.background,
    borderColor: Colors.light.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemMetaBadgeStrong: {
    backgroundColor: VALUE_COLORS.neutral + '12',
    borderColor: VALUE_COLORS.neutral + '30',
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  itemMetaStrong: {
    fontSize: 12,
    color: VALUE_COLORS.neutral,
    fontWeight: '700',
  },
  itemVariant: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 2,
  },
});
