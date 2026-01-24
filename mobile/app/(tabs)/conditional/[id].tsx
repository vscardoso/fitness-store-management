/**
 * Tela de detalhes e processamento de envio condicional
 * Permite processar devolução, finalizar venda ou cancelar envio
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Surface,
  Chip,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import DetailHeader from '@/components/layout/DetailHeader';
import InfoRow from '@/components/ui/InfoRow';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getShipment, processReturn, cancelShipment, markAsSent } from '@/services/conditionalService';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
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
    type: 'damaged' | 'lost' | 'cancel' | 'mark_sent' | null;
    itemId?: number;
    quantity?: string;
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
  useEffect(() => {
    if (shipment?.items && Object.keys(processingItems).length === 0) {
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
  }, [shipment?.items]);

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


  // Loading state
  if (isLoading || !shipment) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={{ marginTop: 16, color: '#666' }}>Carregando envio...</Text>
      </View>
    );
  }

  // Configuração do badge de status - CORRIGIDO
  const statusColor = SHIPMENT_STATUS_COLORS[shipment.status] ?? Colors.light.info;
  const statusIcon = SHIPMENT_STATUS_ICONS[shipment.status] ?? 'information';
  const statusLabel = SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status;

  // Badge type baseado no STATUS, não no deadline
  let badgeType: 'error' | 'warning' | 'success' | 'info' = 'info';
  if (shipment.status === 'COMPLETED') badgeType = 'success';
  else if (shipment.status === 'CANCELLED') badgeType = 'error';
  else if (shipment.status === 'SENT' || shipment.status === 'PARTIAL_RETURN') badgeType = 'warning';

  const badges = [
    {
      icon: statusIcon as any,
      label: statusLabel,
      type: badgeType,
    },
  ];

  const deadlineText = shipment.deadline ? formatDeadline(shipment.deadline) : 'Sem prazo';
  const deadlineColor = shipment.deadline ? getDeadlineColor(shipment.deadline) : '#4CAF50';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      <DetailHeader
        title="Envio Condicional"
        entityName={shipment.customer_name || `Cliente #${shipment.customer_id}`}
        backRoute="/(tabs)/conditional"
        badges={badges}
        metrics={[]}
        hideActions={true}
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
        {/* Card Consolidado de Informações */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.compactInfoGrid}>
              {/* Cliente e Contato */}
              <View style={styles.compactRow}>
                <Ionicons name="person" size={18} color={Colors.light.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactLabel}>Cliente</Text>
                  <Text style={styles.compactValue}>{shipment.customer_name || `#${shipment.customer_id}`}</Text>
                  {shipment.customer_phone && (
                    <Text style={styles.compactSecondary}>{shipment.customer_phone}</Text>
                  )}
                </View>
              </View>

              {/* Endereço */}
              <View style={styles.compactRow}>
                <Ionicons name="location" size={18} color={Colors.light.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactLabel}>Endereço</Text>
                  <Text style={styles.compactValue}>{shipment.shipping_address}</Text>
                </View>
              </View>

              {/* Data de Envio */}
              {shipment.sent_at && (
                <View style={styles.compactRow}>
                  <Ionicons name="calendar" size={18} color={Colors.light.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compactLabel}>Enviado em</Text>
                    <Text style={styles.compactValue}>{formatDateTime(shipment.sent_at)}</Text>
                  </View>
                </View>
              )}

              {/* Prazo - apenas se relevante */}
              {shipment.deadline && shipment.status !== 'COMPLETED' && shipment.status !== 'CANCELLED' && (
                <View style={styles.compactRow}>
                  <Ionicons
                    name={shipment.is_overdue ? 'alert-circle' : 'time'}
                    size={18}
                    color={deadlineColor}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compactLabel}>Prazo de Devolução</Text>
                    <Text style={[styles.compactValue, { color: deadlineColor, fontWeight: '700' }]}>
                      {deadlineText}
                    </Text>
                  </View>
                </View>
              )}

              {/* Observações */}
              {shipment.notes && (
                <View style={styles.compactRow}>
                  <Ionicons name="document-text" size={18} color={Colors.light.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compactLabel}>Observações</Text>
                    <Text style={styles.compactValue}>{shipment.notes}</Text>
                  </View>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Resumo Financeiro */}
        <Card style={styles.summaryCardHighlight}>
          <Card.Content>
            <View style={styles.summaryHeader}>
              <Ionicons name="cash-outline" size={24} color={Colors.light.success} />
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
                <Text style={styles.financialValueMain}>{formatCurrency(summary.totalKept)}</Text>
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
          </Card.Content>
        </Card>

        {/* Lista de Items - SIMPLIFICADO */}
        <View style={styles.itemsSection}>
          <View style={styles.itemsSectionHeader}>
            <Ionicons name="cube-outline" size={20} color={Colors.light.text} />
            <Text variant="titleMedium" style={styles.itemsSectionTitle}>
              Produtos ({shipment.items.length})
            </Text>
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

            return (
              <Card key={item.id} style={styles.itemCard}>
                <Card.Content>
                  {/* Cabeçalho do item - COMPACTO */}
                  <View style={styles.itemHeaderCompact}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleSmall" style={styles.itemName}>
                        {item.product_name || `Produto #${item.product_id}`}
                      </Text>
                      <View style={styles.itemMetaRow}>
                        {item.product_sku && (
                          <Text style={styles.itemMeta}>SKU: {item.product_sku}</Text>
                        )}
                        <Text style={styles.itemMeta}>
                          {item.quantity_sent} × {formatCurrency(item.unit_price)} = {formatCurrency(item.quantity_sent * item.unit_price)}
                        </Text>
                      </View>
                    </View>
                    {isItemFullyProcessed && (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.light.success} />
                    )}
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
                        <Ionicons name="lock-closed-outline" size={16} color={Colors.light.primary} />
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
          <>
            {/* BANNER DE INSTRUÇÃO DESTACADO - SEMPRE VISÍVEL NO TOPO */}
            <Card style={!isFullyProcessed ? styles.instructionBannerUrgent : styles.instructionBannerReady}>
              <Card.Content>
                <View style={styles.instructionHeader}>
                  <Ionicons
                    name={!isFullyProcessed ? "alert-circle" : "checkmark-circle"}
                    size={28}
                    color={!isFullyProcessed ? Colors.light.warning : Colors.light.success}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={styles.instructionTitle}>
                      {!isFullyProcessed
                        ? 'AÇÃO NECESSÁRIA: Processar Devolução'
                        : 'Pronto para Finalizar!'}
                    </Text>
                    <Text variant="bodyMedium" style={styles.instructionText}>
                      {!isFullyProcessed
                        ? 'O cliente devolveu os produtos. Marque abaixo quais foram comprados e quais foram devolvidos.'
                        : 'Todos os produtos foram processados. Clique em "Finalizar e Concluir" abaixo para registrar a venda.'}
                    </Text>
                  </View>
                </View>

                {/* Indicador de progresso */}
                {!isFullyProcessed && (
                  <View style={styles.progressIndicator}>
                    <Ionicons name="list-outline" size={16} color={Colors.light.primary} />
                    <Text style={styles.progressText}>
                      Progresso: {shipment.items.filter(item => {
                        const p = processingItems[item.id];
                        if (!p) return false;
                        const total = p.quantity_kept + p.quantity_returned + p.quantity_damaged + p.quantity_lost;
                        return total === item.quantity_sent;
                      }).length} de {shipment.items.length} produtos processados
                    </Text>
                  </View>
                )}

                {/* Instruções passo a passo */}
                {!isFullyProcessed && (
                  <View style={styles.stepsContainer}>
                    <Text style={styles.stepsTitle}>Como processar:</Text>
                    <View style={styles.stepRow}>
                      <Text style={styles.stepNumber}>1.</Text>
                      <Text style={styles.stepText}>Role até a lista de produtos abaixo</Text>
                    </View>
                    <View style={styles.stepRow}>
                      <Text style={styles.stepNumber}>2.</Text>
                      <Text style={styles.stepText}>Para cada produto, marque quantos foram comprados e quantos devolvidos</Text>
                    </View>
                    <View style={styles.stepRow}>
                      <Text style={styles.stepNumber}>3.</Text>
                      <Text style={styles.stepText}>Use os botões "Comprou Tudo" ou "Devolveu Tudo" para rapidez</Text>
                    </View>
                    <View style={styles.stepRow}>
                      <Text style={styles.stepNumber}>4.</Text>
                      <Text style={styles.stepText}>Após processar todos, o botão de finalizar será habilitado</Text>
                    </View>
                  </View>
                )}
              </Card.Content>
            </Card>

            {/* Card de ações - SEMPRE VISÍVEL */}
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.sectionHeader}>
                  <Ionicons name="flash-outline" size={20} color={Colors.light.primary} />
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    Finalizar Processamento
                  </Text>
                </View>

                {/* Feedback visual claro do por que o botão está desabilitado */}
                {!isFullyProcessed && (
                  <View style={styles.disabledReasonBox}>
                    <Ionicons name="lock-closed-outline" size={20} color={Colors.light.warning} />
                    <Text style={styles.disabledReasonText}>
                      O botão de finalizar está bloqueado porque você ainda não processou todos os produtos.
                      Role até a lista de produtos acima e marque as quantidades.
                    </Text>
                  </View>
                )}

                {summary.keptCount > 0 && (
                  <View style={styles.paymentSection}>
                    <Text variant="labelLarge" style={styles.paymentLabel}>
                      Forma de Pagamento:
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
                          onPress={() => setPaymentMethod(key)}
                          style={[styles.paymentChip, paymentMethod === key && styles.paymentChipActive]}
                          textStyle={paymentMethod === key ? styles.paymentChipTextActive : undefined}
                          compact
                          showSelectedCheck={false}
                        >
                          {label}
                        </Chip>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.actionsContainer}>
                  <Button
                    mode="contained"
                    onPress={handleFinalizeSale}
                    style={[
                      styles.actionButton,
                      !isFullyProcessed && styles.actionButtonDisabled
                    ]}
                    buttonColor={isFullyProcessed ? Colors.light.success : '#cccccc'}
                    icon={isFullyProcessed ? "check-circle-outline" : "lock-outline"}
                    loading={processReturnMutation.isPending}
                    disabled={!isFullyProcessed || processReturnMutation.isPending || cancelMutation.isPending}
                  >
                    {!isFullyProcessed
                      ? 'Processar Produtos Primeiro'
                      : (summary.keptCount > 0 ? 'Finalizar e Concluir' : 'Finalizar Devolução')}
                  </Button>

                  {!isFullyProcessed && (
                    <Text style={styles.disabledHintText}>
                      ⬆️ Marque as quantidades de cada produto acima para habilitar este botão
                    </Text>
                  )}

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
          </>
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
  summaryCardHighlight: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.light.success + '30',
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  summaryTitleHighlight: {
    fontWeight: '700',
    color: Colors.light.success,
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
    backgroundColor: Colors.light.success + '08',
    borderRadius: 8,
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
    fontSize: 22,
    fontWeight: '800',
    color: Colors.light.success,
    marginLeft: 16,
  },
  financialDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 4,
  },
  itemsSection: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  itemsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  itemsSectionTitle: {
    fontWeight: '700',
    color: Colors.light.text,
    fontSize: 16,
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
  paymentSection: {
    marginTop: 16,
  },
  paymentLabel: {
    marginBottom: 8,
    fontWeight: '600',
  },
  paymentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentChip: {
    backgroundColor: '#f0f0f0',
  },
  paymentChipActive: {
    backgroundColor: Colors.light.primary + '20',
    borderColor: Colors.light.primary,
    borderWidth: 1,
  },
  paymentChipTextActive: {
    color: Colors.light.primary,
    fontWeight: '600',
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
  // Estilos para banner de instrução URGENTE
  instructionBannerUrgent: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: '#FFF9E6',
    borderLeftWidth: 6,
    borderLeftColor: Colors.light.warning,
    elevation: 4,
  },
  instructionBannerReady: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 6,
    borderLeftColor: Colors.light.success,
    elevation: 4,
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
    backgroundColor: 'rgba(25, 118, 210, 0.1)',
    borderRadius: 8,
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
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 8,
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
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    borderLeftWidth: 4,
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
  },
  disabledHintText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: -4,
    marginBottom: 8,
  },
  // Estilos para card consolidado de informações
  compactInfoGrid: {
    gap: 16,
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
  // Estilos para resumo financeiro destacado
  summaryCardHighlight: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.success,
    elevation: 3,
  },
  summaryTitleHighlight: {
    fontWeight: '700',
    color: Colors.light.success,
  },
  // Estilos para item de produto compacto
  itemHeaderCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
});
