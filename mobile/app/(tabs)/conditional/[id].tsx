/**
 * Tela de detalhes e processamento de envio condicional
 * Permite processar devolução, finalizar venda ou cancelar envio
 */

import { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  TextInput,
  Badge,
  Surface,
  Chip,
  IconButton,
  RadioButton,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import DetailHeader from '@/components/layout/DetailHeader';
import InfoRow from '@/components/ui/InfoRow';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getShipment, processReturn, cancelShipment, markAsSent, updateShipment } from '@/services/conditionalService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors } from '@/constants/Colors';
import type {
  ConditionalShipment,
  ConditionalShipmentItem,
  ProcessReturnItemDTO,
  ShipmentItemStatus,
} from '@/types/conditional';
import {
  SHIPMENT_STATUS_COLORS,
  SHIPMENT_STATUS_ICONS,
  SHIPMENT_STATUS_LABELS,
  formatDeadline,
  getDeadlineColor,
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

/**
 * Estado local para cada item processado
 */
interface ProcessingItem {
  id: number;
  quantity_kept: number;
  quantity_returned: number;
  quantity_damaged: number;
  quantity_lost: number;
  notes: string;
}

export default function ConditionalShipmentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const shipmentId = id ? parseInt(id) : NaN;
  const isValidId = !isNaN(shipmentId) && shipmentId > 0;

  // Estados locais para processamento
  const [processingItems, setProcessingItems] = useState<Record<number, ProcessingItem>>({});
  const [activeModal, setActiveModal] = useState<{
    visible: boolean;
    type: 'damaged' | 'lost' | 'cancel' | 'mark_sent' | 'change_status' | null;
    itemId?: number;
    quantity?: string;
    reason?: string;
    carrier?: string;
    tracking_code?: string;
    selectedStatus?: string;
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

  /**
   * Query: Buscar detalhes do envio
   */
  const { data: shipment, isLoading, refetch } = useQuery({
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
  useState(() => {
    if (shipment?.items) {
      const initial: Record<number, ProcessingItem> = {};
      shipment.items.forEach((item) => {
        initial[item.id] = {
          id: item.id,
          quantity_kept: item.quantity_kept,
          quantity_returned: item.quantity_returned,
          quantity_damaged: 0,
          quantity_lost: 0,
          notes: item.notes || '',
        };
      });
      setProcessingItems(initial);
    }
  });

  /**
   * Mutation: Processar devolução
   */
  const processReturnMutation = useMutation({
    mutationFn: (data: { items: ProcessReturnItemDTO[]; create_sale: boolean }) =>
      processReturn(shipmentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipment', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });

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
   * Mutation: Atualizar status
   */
  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => updateShipment(shipmentId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['conditional-shipment', shipmentId] });
      setSuccessMessage('Status atualizado com sucesso!');
      setSuccessDialog(true);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || error?.message || 'Erro ao atualizar status';
      setErrorMessage(message);
      setErrorDialog(true);
    },
  });

  /**
   * Atualizar item individual
   */
  const updateItem = useCallback((itemId: number, updates: Partial<ProcessingItem>) => {
    setProcessingItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        ...updates,
      },
    }));
  }, []);

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

  const handleOpenDamagedModal = useCallback((itemId: number) => {
    setActiveModal({ visible: true, type: 'damaged', itemId, quantity: '' });
  }, []);

  const handleOpenLostModal = useCallback((itemId: number) => {
    setActiveModal({ visible: true, type: 'lost', itemId, quantity: '' });
  }, []);

  const handleOpenCancelModal = useCallback(() => {
    setActiveModal({ visible: true, type: 'cancel', reason: '' });
  }, []);

  const handleOpenMarkSentModal = useCallback(() => {
    setActiveModal({ visible: true, type: 'mark_sent', carrier: '', tracking_code: '' });
  }, []);

  const handleOpenChangeStatusModal = useCallback(() => {
    setActiveModal({ visible: true, type: 'change_status', selectedStatus: shipment?.status });
  }, [shipment]);

  /**
   * Salvar modal (danificado/perdido)
   */
  const handleSaveModal = useCallback(() => {
    const { type, itemId, quantity } = activeModal;

    if (!itemId || !quantity) {
      setErrorMessage('Informe a quantidade');
      setErrorDialog(true);
      return;
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      setErrorMessage('Quantidade inválida');
      setErrorDialog(true);
      return;
    }

    const item = shipment?.items.find((i) => i.id === itemId);
    if (!item) return;

    const current = processingItems[itemId] || {
      quantity_kept: 0,
      quantity_returned: 0,
      quantity_damaged: 0,
      quantity_lost: 0,
    };

    const total =
      current.quantity_kept +
      current.quantity_returned +
      (type === 'damaged' ? qty : current.quantity_damaged) +
      (type === 'lost' ? qty : current.quantity_lost);

    if (total > item.quantity_sent) {
      setErrorMessage('Total excede quantidade enviada');
      setErrorDialog(true);
      return;
    }

    updateItem(itemId, {
      [type === 'damaged' ? 'quantity_damaged' : 'quantity_lost']: qty,
    });

    setActiveModal({ visible: false, type: null });
  }, [activeModal, shipment, processingItems, updateItem]);

  /**
   * Calcular resumo financeiro
   */
  const summary = useMemo(() => {
    if (!shipment?.items) {
      return {
        totalSent: 0,
        totalKept: 0,
        totalReturned: 0,
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
        status,
        notes: processing.notes || undefined,
      };
    });

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
    }
    if (summary.keptCount > 0) {
      details.push(`💳 Forma de pagamento: ${translatePaymentMethod(paymentMethod)}`);
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
        processReturnMutation.mutate({ items, create_sale: true, payment_method: paymentMethod });
      },
    });
  }, [isFullyProcessed, shipment, processingItems, summary, processReturnMutation, paymentMethod]);

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

  /**
   * Alterar status
   */
  const handleChangeStatus = useCallback(() => {
    const { selectedStatus } = activeModal;

    if (!selectedStatus || selectedStatus === shipment?.status) {
      setActiveModal({ visible: false, type: null });
      return;
    }

    setActiveModal({ visible: false, type: null });

    const statusLabels: Record<string, string> = {
      PENDING: 'Pendente',
      SENT: 'Enviado',
      PARTIAL_RETURN: 'Devolução Parcial',
      COMPLETED: 'Finalizado',
      CANCELLED: 'Cancelado',
      OVERDUE: 'Atrasado',
    };

    setConfirmDialog({
      visible: true,
      type: 'warning',
      title: 'Confirmar Alteração de Status',
      message: `Deseja alterar o status para "${statusLabels[selectedStatus]}"?`,
      details: ['Esta ação pode afetar o fluxo do envio'],
      onConfirm: () => {
        setConfirmDialog({ ...confirmDialog, visible: false });
        updateStatusMutation.mutate(selectedStatus);
      },
    });
  }, [activeModal, shipment, updateStatusMutation]);

  // Loading state
  if (isLoading || !shipment) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={{ marginTop: 16, color: '#666' }}>Carregando envio...</Text>
      </View>
    );
  }

  // Configuração do badge de status
  const statusColor = SHIPMENT_STATUS_COLORS[shipment.status] ?? Colors.light.info;
  const statusIcon = SHIPMENT_STATUS_ICONS[shipment.status] ?? 'information';
  const statusLabel = SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status;

  const badges = [
    {
      icon: statusIcon as any,
      label: statusLabel,
      type: shipment.is_overdue ? ('error' as const) : ('info' as const),
    },
  ];

  const deadlineText = shipment.deadline ? formatDeadline(shipment.deadline) : 'Sem prazo';
  const deadlineColor = shipment.deadline ? getDeadlineColor(shipment.deadline) : '#4CAF50';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      <DetailHeader
        title="Detalhes do Envio"
        entityName={shipment.customer_name || `Cliente #${shipment.customer_id}`}
        backRoute="/(tabs)/conditional"
        editRoute="/(tabs)/conditional"
        onDelete={() => {}}
        badges={badges}
        metrics={[]}
      />

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
        {/* Informações do Cliente */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color={Colors.light.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Informações do Cliente
              </Text>
            </View>

            <View style={styles.infoGrid}>
              <InfoRow
                label="Cliente:"
                value={shipment.customer_name || `#${shipment.customer_id}`}
              />
              {shipment.customer_phone && (
                <InfoRow label="Telefone:" value={shipment.customer_phone} />
              )}
              <InfoRow label="Endereço:" value={shipment.shipping_address} />
            </View>
          </Card.Content>
        </Card>

        {/* Informações do Envio */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Ionicons name="calendar-outline" size={20} color={Colors.light.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Dados do Envio
              </Text>
              <View style={{ flex: 1 }} />
              {shipment.status !== 'COMPLETED' && shipment.status !== 'CANCELLED' && (
                <IconButton
                  icon="pencil"
                  size={20}
                  iconColor={Colors.light.primary}
                  onPress={handleOpenChangeStatusModal}
                />
              )}
            </View>

            <View style={styles.infoGrid}>
              <InfoRow
                label="Status:"
                value={SHIPMENT_STATUS_LABELS[shipment.status]}
              />
              <InfoRow
                label="Data de Envio:"
                value={shipment.sent_at ? formatDate(shipment.sent_at) : 'Não enviado'}
              />

              {/* Ocultar prazo quando venda foi finalizada (total ou parcial) */}
              {shipment.deadline && shipment.status !== 'COMPLETED_PARTIAL_SALE' && shipment.status !== 'COMPLETED_FULL_SALE' && (
                <View style={styles.deadlineRow}>
                  <Text style={styles.deadlineLabel}>Prazo:</Text>
                  <View style={styles.deadlineValue}>
                    <Ionicons
                      name={shipment.is_overdue ? 'alert-circle' : 'time'}
                      size={16}
                      color={deadlineColor}
                      style={styles.deadlineIcon}
                    />
                    <Text style={[styles.deadlineText, { color: deadlineColor }]}>
                      {deadlineText}
                    </Text>
                  </View>
                </View>
              )}

              {/* Adicionar indicador de compra parcial processada */}
              {shipment.status === 'COMPLETED_PARTIAL_SALE' && (
                <View style={styles.partialReturnBanner}>
                  <Ionicons name="information-circle" size={20} color={Colors.light.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partialReturnTitle}>Compra Parcial Processada</Text>
                    <Text style={styles.partialReturnText}>
                      Uma venda já foi criada. Complete o processamento dos itens restantes.
                    </Text>
                  </View>
                </View>
              )}

              {shipment.notes && <InfoRow label="Observações:" value={shipment.notes} />}
            </View>
          </Card.Content>
        </Card>

        {/* Resumo Financeiro */}
        <Surface style={styles.summaryCard} elevation={2}>
          <View style={{ overflow: 'hidden', flex: 1 }}>
            <View style={styles.summaryHeader}>
              <Ionicons name="calculator-outline" size={24} color={Colors.light.primary} />
              <Text variant="titleMedium" style={styles.summaryTitle}>
                Resumo Financeiro
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Enviado:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(summary.totalSent)}</Text>
              <Text style={styles.summaryCount}>({summary.sentCount} itens)</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, styles.summaryLabelSuccess]}>
                Cliente Comprou:
              </Text>
              <Text style={[styles.summaryValue, styles.summaryValueSuccess]}>
                {formatCurrency(summary.totalKept)}
              </Text>
              <Text style={styles.summaryCount}>({summary.keptCount} itens)</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Devolvido:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(summary.totalReturned)}</Text>
              <Text style={styles.summaryCount}>({summary.returnedCount} itens)</Text>
            </View>

            {(summary.damagedCount > 0 || summary.lostCount > 0) && (
              <View style={styles.summaryWarning}>
                {summary.damagedCount > 0 && (
                  <Text style={styles.summaryWarningText}>
                    ⚠️ Danificados: {summary.damagedCount}
                  </Text>
                )}
                {summary.lostCount > 0 && (
                  <Text style={styles.summaryWarningText}>
                    ❌ Perdidos: {summary.lostCount}
                  </Text>
                )}
              </View>
            )}
          </View>
        </Surface>

        {/* Lista de Items */}
        <View style={styles.itemsSection}>
          <Text variant="titleMedium" style={styles.itemsSectionTitle}>
            Produtos do Envio
          </Text>

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

            return (
              <Card key={item.id} style={styles.itemCard}>
                <Card.Content>
                  {/* Cabeçalho do item */}
                  <View style={styles.itemHeader}>
                    <View style={styles.itemInfo}>
                      <Text variant="titleSmall" style={styles.itemName}>
                        {item.product_name || `Produto #${item.product_id}`}
                      </Text>
                      {item.product_sku && (
                        <Text style={styles.itemSku}>SKU: {item.product_sku}</Text>
                      )}
                    </View>
                    {isItemFullyProcessed && (
                      <Chip
                        icon="check-circle"
                        mode="flat"
                        style={styles.itemBadge}
                        textStyle={styles.itemBadgeText}
                      >
                        Processado
                      </Chip>
                    )}
                  </View>

                  {/* Informações do item */}
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemDetailText}>
                      Enviado: {item.quantity_sent} un × {formatCurrency(item.unit_price)}
                    </Text>
                    <Text style={styles.itemDetailText}>
                      Total: {formatCurrency(item.quantity_sent * item.unit_price)}
                    </Text>
                  </View>

                  {/* Inputs de processamento - Apenas permitir edição se status for SENT */}
                  {shipment.status === 'SENT' && (
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
                        <Button
                          mode="outlined"
                          icon="check-circle"
                          onPress={() => handleBuyAll(item)}
                          style={styles.quickButton}
                          compact
                        >
                          Comprou Tudo
                        </Button>
                        <Button
                          mode="outlined"
                          icon="refresh"
                          onPress={() => handleReturnAll(item)}
                          style={styles.quickButton}
                          compact
                        >
                          Devolveu Tudo
                        </Button>
                      </View>

                      <View style={styles.quickActions}>
                        <Button
                          mode="text"
                          icon="alert-circle"
                          onPress={() => handleOpenDamagedModal(item.id)}
                          style={styles.quickButton}
                          compact
                          textColor={Colors.light.warning}
                        >
                          Danificado
                        </Button>
                        <Button
                          mode="text"
                          icon="close-circle"
                          onPress={() => handleOpenLostModal(item.id)}
                          style={styles.quickButton}
                          compact
                          textColor={Colors.light.error}
                        >
                          Perdido
                        </Button>
                      </View>

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

                  {/* Estado read-only aprimorado para PARTIAL_RETURN */}
                  {shipment.status === 'PARTIAL_RETURN' && (
                    <View style={styles.partialReturnItemSummary}>
                      <View style={styles.partialReturnHeader}>
                        <Ionicons name="lock-closed" size={16} color={Colors.light.primary} />
                        <Text style={styles.partialReturnHeaderText}>Compra Processada</Text>
                      </View>

                      <View style={styles.readOnlyGrid}>
                        <View style={styles.readOnlyRow}>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.light.success} />
                          <Text style={styles.readOnlyLabel}>Comprado:</Text>
                          <Text style={styles.readOnlyValue}>{processing.quantity_kept} un</Text>
                        </View>

                        <View style={styles.readOnlyRow}>
                          <Ionicons name="return-up-back" size={18} color={Colors.light.primary} />
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

                  {/* Resumo read-only quando COMPLETED ou CANCELLED */}
                  {(shipment.status === 'COMPLETED' || shipment.status === 'CANCELLED') && (
                    <View style={styles.readOnlySummary}>
                      <Text style={styles.readOnlyLabel}>Quantidade Comprada: {processing.quantity_kept} un</Text>
                      <Text style={styles.readOnlyLabel}>Quantidade Devolvida: {processing.quantity_returned} un</Text>
                      {processing.notes && (
                        <Text style={styles.readOnlyNotes}>Obs: {processing.notes}</Text>
                      )}
                    </View>
                  )}
                </Card.Content>
              </Card>
            );
          })}
        </View>

        {/* Ações baseadas no status */}
        {shipment?.status === 'PENDING' && (
          <>
            {/* Banner de aviso */}
            <Card style={styles.warningCard}>
              <Card.Content>
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
              </Card.Content>
            </Card>

            {/* Card de ações */}
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.sectionHeader}>
                  <Ionicons name="flash-outline" size={20} color={Colors.light.primary} />
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    Ações Disponíveis
                  </Text>
                </View>

                <View style={styles.actionsContainer}>
                  <Button
                    mode="contained"
                    onPress={handleOpenMarkSentModal}
                    style={styles.actionButton}
                    buttonColor={Colors.light.primary}
                    icon="send"
                    loading={markAsSentMutation.isPending}
                    disabled={markAsSentMutation.isPending || cancelMutation.isPending}
                  >
                    Marcar como Enviado
                  </Button>

                  <Button
                    mode="outlined"
                    onPress={handleOpenCancelModal}
                    style={styles.actionButton}
                    textColor={Colors.light.error}
                    disabled={markAsSentMutation.isPending || cancelMutation.isPending}
                    icon="close-circle"
                  >
                    Cancelar Envio
                  </Button>
                </View>
              </Card.Content>
            </Card>
          </>
        )}

        {shipment?.status === 'PARTIAL_RETURN' && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Ionicons name="flash-outline" size={20} color={Colors.light.primary} />
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Completar Processamento
                </Text>
              </View>

              <View style={styles.partialReturnInfoBox}>
                <Ionicons name="information-circle" size={24} color={Colors.light.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={styles.partialReturnInfoText}>
                    <Text style={{ fontWeight: '700' }}>Venda parcial já registrada</Text>
                    {'\n'}
                    Você pode finalizar o envio para processar os itens restantes ou cancelar caso necessário.
                  </Text>
                </View>
              </View>

              <View style={styles.actionsContainer}>
                <Button
                  mode="contained"
                  onPress={handleFinalizeSale}
                  style={styles.actionButton}
                  buttonColor={Colors.light.success}
                  icon="check-circle"
                  loading={processReturnMutation.isPending}
                  disabled={!isFullyProcessed || processReturnMutation.isPending || cancelMutation.isPending}
                >
                  Finalizar e Concluir
                </Button>

                <Button
                  mode="text"
                  onPress={handleOpenCancelModal}
                  style={styles.actionButtonText}
                  textColor={Colors.light.error}
                  disabled={processReturnMutation.isPending || cancelMutation.isPending}
                  icon="close-circle"
                >
                  Cancelar Envio
                </Button>
              </View>

              <Text variant="bodySmall" style={styles.helpTextSmall}>
                ⚠️ Cancelar irá reverter todas as operações e devolver o estoque completo.
              </Text>
            </Card.Content>
          </Card>
        )}

        {shipment?.status === 'SENT' && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Ionicons name="flash-outline" size={20} color={Colors.light.primary} />
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Finalizar Processamento
                </Text>
              </View>

              <Text variant="bodyMedium" style={styles.helpText}>
                {summary.keptCount > 0
                  ? '✅ Produtos comprados serão automaticamente registrados como venda ao finalizar.'
                  : 'Marque os produtos comprados acima e finalize para registrar a venda.'}
              </Text>

              {summary.keptCount > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text variant="labelLarge" style={{ marginBottom: 8, fontWeight: '600' }}>
                    Forma de Pagamento:
                  </Text>
                  <RadioButton.Group onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)} value={paymentMethod}>
                    <RadioButton.Item label="💵 Dinheiro" value="cash" />
                    <RadioButton.Item label="💳 Cartão de Crédito" value="credit_card" />
                    <RadioButton.Item label="💳 Cartão de Débito" value="debit_card" />
                    <RadioButton.Item label="📱 Pix" value="pix" />
                    <RadioButton.Item label="🏦 Transferência Bancária" value="bank_transfer" />
                    <RadioButton.Item label="📊 Parcelado" value="installments" />
                    <RadioButton.Item label="⭐ Pontos de Fidelidade" value="loyalty_points" />
                  </RadioButton.Group>
                </View>
              )}

              <View style={styles.actionsContainer}>
                <Button
                  mode="contained"
                  onPress={handleFinalizeSale}
                  style={styles.actionButton}
                  buttonColor={Colors.light.success}
                  icon="check-circle"
                  loading={processReturnMutation.isPending}
                  disabled={!isFullyProcessed || processReturnMutation.isPending || cancelMutation.isPending}
                >
                  {summary.keptCount > 0 ? 'Finalizar e Concluir' : 'Finalizar Devolução'}
                </Button>

                <Button
                  mode="text"
                  onPress={handleOpenCancelModal}
                  style={styles.actionButtonText}
                  textColor={Colors.light.error}
                  disabled={processReturnMutation.isPending || cancelMutation.isPending}
                  icon="close-circle"
                >
                  Cancelar Envio
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      {/* Modal Danificado/Perdido */}
      <CustomModal
        visible={activeModal.visible && (activeModal.type === 'damaged' || activeModal.type === 'lost')}
        onDismiss={() => setActiveModal({ visible: false, type: null })}
        title={activeModal.type === 'damaged' ? 'Marcar como Danificado' : 'Marcar como Perdido'}
      >
        <TextInput
          label="Quantidade"
          value={activeModal.quantity}
          onChangeText={(text) => setActiveModal({ ...activeModal, quantity: text })}
          keyboardType="numeric"
          mode="outlined"
          style={styles.modalInput}
          autoFocus
        />

        <ModalActions
          onCancel={() => setActiveModal({ visible: false, type: null })}
          onConfirm={handleSaveModal}
          confirmText="Confirmar"
          cancelText="Cancelar"
        />
      </CustomModal>

      {/* Modal Cancelar Envio */}
      <CustomModal
        visible={activeModal.visible && activeModal.type === 'cancel'}
        onDismiss={() => setActiveModal({ visible: false, type: null })}
        title="Cancelar Envio"
        subtitle="Todo o estoque será devolvido"
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

        <ModalActions
          onCancel={() => setActiveModal({ visible: false, type: null })}
          onConfirm={handleCancelShipment}
          confirmText="Confirmar Cancelamento"
          cancelText="Voltar"
          confirmColor={Colors.light.error}
          loading={cancelMutation.isPending}
        />
      </CustomModal>

      {/* Modal Marcar como Enviado */}
      <CustomModal
        visible={activeModal.visible && activeModal.type === 'mark_sent'}
        onDismiss={() => setActiveModal({ visible: false, type: null })}
        title="Marcar como Enviado"
        subtitle="O prazo de devolução começará agora"
      >
        <Text variant="bodyMedium" style={{ marginBottom: 16, color: Colors.light.textSecondary }}>
          Informe os dados do envio (opcional):
        </Text>

        <TextInput
          label="Transportadora"
          value={activeModal.carrier}
          onChangeText={(text) => setActiveModal({ ...activeModal, carrier: text })}
          mode="outlined"
          style={styles.modalInput}
          placeholder="Ex: Correios, Jadlog, etc"
        />

        <TextInput
          label="Código de Rastreio"
          value={activeModal.tracking_code}
          onChangeText={(text) => setActiveModal({ ...activeModal, tracking_code: text })}
          mode="outlined"
          style={styles.modalInput}
          placeholder="Ex: BR123456789BR"
        />

        <ModalActions
          onCancel={() => setActiveModal({ visible: false, type: null })}
          onConfirm={handleMarkAsSent}
          confirmText="Confirmar Envio"
          cancelText="Cancelar"
          loading={markAsSentMutation.isPending}
        />
      </CustomModal>

      {/* Modal Alterar Status */}
      <CustomModal
        visible={activeModal.visible && activeModal.type === 'change_status'}
        onDismiss={() => setActiveModal({ visible: false, type: null })}
        title="Alterar Status do Envio"
      >
        <RadioButton.Group
          onValueChange={(value) => setActiveModal({ ...activeModal, selectedStatus: value })}
          value={activeModal.selectedStatus || shipment?.status || ''}
        >
          <RadioButton.Item label="🟡 Pendente (Criado)" value="PENDING" />
          <RadioButton.Item label="🚚 Enviado (Com o cliente)" value="SENT" />
          <RadioButton.Item label="📦 Devolução Parcial" value="PARTIAL_RETURN" />
          <RadioButton.Item label="✅ Finalizado" value="COMPLETED" />
          <RadioButton.Item label="❌ Cancelado" value="CANCELLED" />
          <RadioButton.Item label="⏰ Atrasado" value="OVERDUE" />
        </RadioButton.Group>

        <ModalActions
          onCancel={() => setActiveModal({ visible: false, type: null })}
          onConfirm={handleChangeStatus}
          confirmText="Alterar Status"
          cancelText="Cancelar"
          loading={updateStatusMutation.isPending}
        />
      </CustomModal>

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
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 32,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '700',
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
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  summaryTitle: {
    fontWeight: '700',
    color: Colors.light.text,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginRight: 8,
  },
  summaryCount: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  summaryLabelSuccess: {
    color: Colors.light.success,
    fontWeight: '600',
  },
  summaryValueSuccess: {
    color: Colors.light.success,
  },
  summaryWarning: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.light.warningLight,
    borderRadius: 8,
    gap: 4,
  },
  summaryWarningText: {
    fontSize: 13,
    color: Colors.light.warning,
    fontWeight: '600',
  },
  itemsSection: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  itemsSectionTitle: {
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12,
  },
  itemCard: {
    marginBottom: 12,
    borderRadius: 12,
    elevation: 1,
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
    borderBottomColor: '#e0e0e0',
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
  },
  notesInput: {
    marginTop: 4,
  },
  actionsContainer: {
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    borderRadius: 12,
  },
  actionButtonText: {
    marginTop: 4,
  },
  modalInput: {
    marginBottom: 16,
  },
  warningCard: {
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#FFF9E6',
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.warning,
    elevation: 2,
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
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
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
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
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
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
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
    borderTopColor: '#BBDEFB',
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
    borderTopColor: '#BBDEFB',
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
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
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
});
