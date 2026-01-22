/**
 * REDESIGNED: Conditional Shipment Details Screen
 *
 * Features:
 * - Context-aware actions (only show valid actions per status)
 * - Status stepper showing progress
 * - Timeline of events
 * - Clear validation messages
 * - Separate modals for different actions
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
  Surface,
  IconButton,
  Banner,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import DetailHeader from '@/components/layout/DetailHeader';
import InfoRow from '@/components/ui/InfoRow';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import StatusStepper from '@/components/conditional/StatusStepper';
import ShipmentTimeline from '@/components/conditional/ShipmentTimeline';
import MarkAsSentModal from '@/components/conditional/MarkAsSentModal';
import {
  getShipment,
  markAsSent,
  processReturn,
  cancelShipment
} from '@/services/conditionalService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors } from '@/constants/Colors';
import type {
  ConditionalShipment,
  ConditionalShipmentItem,
  ProcessReturnItemDTO,
  ShipmentItemStatus,
} from '@/types/conditional';

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

  // UI State
  const [processingItems, setProcessingItems] = useState<Record<number, ProcessingItem>>({});
  const [markAsSentModalVisible, setMarkAsSentModalVisible] = useState(false);
  const [processReturnModalVisible, setProcessReturnModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

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

  /**
   * Query: Fetch shipment details
   */
  const { data: shipment, isLoading, refetch } = useQuery({
    queryKey: ['conditional-shipment', shipmentId],
    queryFn: () => getShipment(shipmentId),
    enabled: isValidId,
    retry: false,
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  /**
   * Initialize processing items when data loads
   */
  useMemo(() => {
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
  }, [shipment]);

  /**
   * Mutation: Mark as sent
   */
  const markAsSentMutation = useMutation({
    mutationFn: (data: { carrier?: string; tracking_code?: string; sent_notes?: string }) =>
      markAsSent(shipmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipment', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      setMarkAsSentModalVisible(false);
      setSuccessMessage('Envio marcado como enviado!');
      setSuccessDialog(true);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || 'Erro ao marcar como enviado';
      setErrorMessage(message);
      setErrorDialog(true);
    },
  });

  /**
   * Mutation: Process return
   */
  const processReturnMutation = useMutation({
    mutationFn: (data: { items: ProcessReturnItemDTO[]; create_sale: boolean }) =>
      processReturn(shipmentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conditional-shipment', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });

      const message = variables.create_sale
        ? 'Venda finalizada com sucesso!'
        : 'Progresso salvo com sucesso!';

      setSuccessMessage(message);
      setSuccessDialog(true);
      setProcessReturnModalVisible(false);

      if (variables.create_sale) {
        setTimeout(() => router.back(), 1500);
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || 'Erro ao processar devolução';
      setErrorMessage(message);
      setErrorDialog(true);
    },
  });

  /**
   * Mutation: Cancel shipment
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
      const message = error?.response?.data?.detail || 'Erro ao cancelar envio';
      setErrorMessage(message);
      setErrorDialog(true);
    },
  });

  /**
   * Update individual item
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
   * Quick actions for items
   */
  const handleBuyAll = useCallback((item: ConditionalShipmentItem) => {
    updateItem(item.id, {
      quantity_kept: item.quantity_sent,
      quantity_returned: 0,
    });
  }, [updateItem]);

  const handleReturnAll = useCallback((item: ConditionalShipmentItem) => {
    updateItem(item.id, {
      quantity_kept: 0,
      quantity_returned: item.quantity_sent,
    });
  }, [updateItem]);

  /**
   * Calculate summary
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
      };
    }

    let totalSent = 0;
    let totalKept = 0;
    let totalReturned = 0;
    let sentCount = 0;
    let keptCount = 0;
    let returnedCount = 0;

    shipment.items.forEach((item) => {
      const processing = processingItems[item.id];
      if (!processing) return;

      totalSent += item.quantity_sent * item.unit_price;
      totalKept += processing.quantity_kept * item.unit_price;
      totalReturned += processing.quantity_returned * item.unit_price;
      sentCount += item.quantity_sent;
      keptCount += processing.quantity_kept;
      returnedCount += processing.quantity_returned;
    });

    return {
      totalSent,
      totalKept,
      totalReturned,
      sentCount,
      keptCount,
      returnedCount,
    };
  }, [shipment, processingItems]);

  /**
   * Validate if all items are processed
   */
  const isFullyProcessed = useMemo(() => {
    if (!shipment?.items) return false;

    return shipment.items.every((item) => {
      const processing = processingItems[item.id];
      if (!processing) return false;

      const total = processing.quantity_kept + processing.quantity_returned;
      return total === item.quantity_sent;
    });
  }, [shipment, processingItems]);

  /**
   * Handle Process Return
   */
  const handleProcessReturn = useCallback((createSale: boolean) => {
    if (!shipment?.items) return;

    if (createSale && !isFullyProcessed) {
      setErrorMessage('Todos os itens devem ser processados antes de finalizar a venda');
      setErrorDialog(true);
      return;
    }

    const items: ProcessReturnItemDTO[] = shipment.items.map((item) => {
      const processing = processingItems[item.id];

      let status: ShipmentItemStatus = 'SENT';
      if (processing.quantity_kept > 0) status = 'KEPT';
      else if (processing.quantity_returned > 0) status = 'RETURNED';

      return {
        id: item.id,
        quantity_kept: processing.quantity_kept,
        quantity_returned: processing.quantity_returned,
        status,
        notes: processing.notes || undefined,
      };
    });

    if (createSale) {
      const details = [
        `Total da venda: ${formatCurrency(summary.totalKept)}`,
        `Itens comprados: ${summary.keptCount}`,
        `Itens devolvidos: ${summary.returnedCount}`,
      ];

      setConfirmDialog({
        visible: true,
        type: 'success',
        title: 'Confirmar Finalização',
        message: 'Isso irá criar uma venda e devolver o estoque não vendido.',
        details,
        onConfirm: () => {
          setConfirmDialog({ ...confirmDialog, visible: false });
          processReturnMutation.mutate({ items, create_sale: true });
        },
      });
    } else {
      processReturnMutation.mutate({ items, create_sale: false });
    }
  }, [shipment, processingItems, summary, isFullyProcessed, processReturnMutation]);

  /**
   * Handle Cancel
   */
  const handleCancelShipment = useCallback(() => {
    if (!cancelReason.trim()) {
      setErrorMessage('Informe o motivo do cancelamento');
      setErrorDialog(true);
      return;
    }

    setCancelModalVisible(false);

    setConfirmDialog({
      visible: true,
      type: 'danger',
      title: 'Confirmar Cancelamento',
      message: 'Todo o estoque será devolvido. Esta ação não pode ser desfeita.',
      details: [`Motivo: ${cancelReason}`],
      onConfirm: () => {
        setConfirmDialog({ ...confirmDialog, visible: false });
        cancelMutation.mutate(cancelReason);
        setCancelReason('');
      },
    });
  }, [cancelReason, cancelMutation]);

  /**
   * Determine available actions based on status
   */
  const availableActions = useMemo(() => {
    if (!shipment) return { canMarkAsSent: false, canProcessReturn: false, canCancel: false };

    const status = shipment.status;

    return {
      canMarkAsSent: status === 'PENDING',
      canProcessReturn: status === 'SENT' || status === 'PARTIAL_RETURN',
      canCancel: status === 'PENDING' || status === 'SENT',
    };
  }, [shipment]);

  // Loading state
  if (isLoading || !shipment) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={{ marginTop: 16, color: '#666' }}>Carregando envio...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      <DetailHeader
        title="Envio Condicional"
        entityName={`#${shipment.id}`}
        backRoute="/(tabs)/conditional"
        badges={[]}
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
        {/* Status Stepper */}
        <Card style={styles.card}>
          <Card.Content>
            <StatusStepper status={shipment.status} />
          </Card.Content>
        </Card>

        {/* Help Banner for PENDING status */}
        {shipment.status === 'PENDING' && (
          <Banner
            visible={true}
            icon="information"
            style={styles.helpBanner}
          >
            Este envio foi criado mas ainda não foi enviado ao cliente. Marque como "Enviado" quando o pacote sair da loja.
          </Banner>
        )}

        {/* Help Banner for SENT status */}
        {shipment.status === 'SENT' && (
          <Banner
            visible={true}
            icon="cube-outline"
            style={styles.helpBanner}
          >
            O pacote está com o cliente. Processe a devolução quando os itens retornarem.
          </Banner>
        )}

        {/* Timeline */}
        <Card style={styles.card}>
          <Card.Content>
            <ShipmentTimeline shipment={shipment} />
          </Card.Content>
        </Card>

        {/* Customer Info */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color={Colors.light.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Cliente
              </Text>
            </View>

            <View style={styles.infoGrid}>
              <InfoRow
                label="Nome:"
                value={shipment.customer_name || `#${shipment.customer_id}`}
              />
              {shipment.customer_phone && (
                <InfoRow label="Telefone:" value={shipment.customer_phone} />
              )}
              <InfoRow label="Endereço:" value={shipment.shipping_address} />
            </View>
          </Card.Content>
        </Card>

        {/* Financial Summary */}
        {(availableActions.canProcessReturn || shipment.status === 'COMPLETED') && (
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
            </View>
          </Surface>
        )}

        {/* Items List (only if processing return) */}
        {availableActions.canProcessReturn && (
          <View style={styles.itemsSection}>
            <Text variant="titleMedium" style={styles.itemsSectionTitle}>
              Processar Devolução
            </Text>

            {shipment.items.map((item) => {
              const processing = processingItems[item.id] || {
                quantity_kept: 0,
                quantity_returned: 0,
                notes: '',
              };

              const totalProcessed = processing.quantity_kept + processing.quantity_returned;
              const isItemFullyProcessed = totalProcessed === item.quantity_sent;

              return (
                <Card key={item.id} style={styles.itemCard}>
                  <Card.Content>
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
                        <Ionicons name="checkmark-circle" size={24} color={Colors.light.success} />
                      )}
                    </View>

                    <View style={styles.itemDetails}>
                      <Text style={styles.itemDetailText}>
                        Enviado: {item.quantity_sent} un × {formatCurrency(item.unit_price)}
                      </Text>
                    </View>

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
                  </Card.Content>
                </Card>
              );
            })}
          </View>
        )}

        <View style={{ height: 160 }} />
      </ScrollView>

      {/* Context-Aware Action Buttons */}
      <Surface style={styles.actionBar} elevation={4}>
        {availableActions.canMarkAsSent && (
          <>
            <Button
              mode="contained"
              onPress={() => setMarkAsSentModalVisible(true)}
              style={styles.actionButton}
              icon="send"
              buttonColor={Colors.light.primary}
            >
              Marcar como Enviado
            </Button>
            <Button
              mode="outlined"
              onPress={() => setCancelModalVisible(true)}
              style={styles.cancelButton}
              textColor={Colors.light.error}
            >
              Cancelar Envio
            </Button>
          </>
        )}

        {availableActions.canProcessReturn && (
          <>
            <Button
              mode="outlined"
              onPress={() => handleProcessReturn(false)}
              style={styles.actionButton}
              loading={processReturnMutation.isPending}
              disabled={processReturnMutation.isPending}
            >
              Salvar Progresso
            </Button>

            <Button
              mode="contained"
              onPress={() => handleProcessReturn(true)}
              style={styles.actionButton}
              buttonColor={Colors.light.success}
              loading={processReturnMutation.isPending}
              disabled={!isFullyProcessed || processReturnMutation.isPending}
            >
              Finalizar Venda
            </Button>

            {availableActions.canCancel && (
              <Button
                mode="text"
                onPress={() => setCancelModalVisible(true)}
                style={styles.cancelButton}
                textColor={Colors.light.error}
                disabled={processReturnMutation.isPending}
              >
                Cancelar Envio
              </Button>
            )}
          </>
        )}

        {!availableActions.canMarkAsSent && !availableActions.canProcessReturn && (
          <Text style={styles.noActionsText}>Nenhuma ação disponível</Text>
        )}
      </Surface>

      {/* Modals */}
      <MarkAsSentModal
        visible={markAsSentModalVisible}
        onDismiss={() => setMarkAsSentModalVisible(false)}
        onConfirm={(data) => markAsSentMutation.mutate(data)}
        loading={markAsSentMutation.isPending}
      />

      <CustomModal
        visible={cancelModalVisible}
        onDismiss={() => {
          setCancelModalVisible(false);
          setCancelReason('');
        }}
        title="Cancelar Envio"
        subtitle="Todo o estoque será devolvido"
      >
        <TextInput
          label="Motivo do cancelamento *"
          value={cancelReason}
          onChangeText={setCancelReason}
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.modalInput}
          autoFocus
        />

        <ModalActions
          onCancel={() => {
            setCancelModalVisible(false);
            setCancelReason('');
          }}
          onConfirm={handleCancelShipment}
          confirmText="Confirmar Cancelamento"
          cancelText="Voltar"
          confirmColor={Colors.light.error}
          loading={cancelMutation.isPending}
        />
      </CustomModal>

      {/* Dialogs */}
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

      <ConfirmDialog
        visible={successDialog}
        type="success"
        title="Sucesso"
        message={successMessage}
        onConfirm={() => setSuccessDialog(false)}
        confirmText="OK"
      />

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
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    elevation: 2,
  },
  helpBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
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
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
  },
  cancelButton: {
    marginTop: 4,
  },
  noActionsText: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
  },
  modalInput: {
    marginBottom: 16,
  },
});
