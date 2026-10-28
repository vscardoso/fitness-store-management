/**
 * Modal de Devolução
 * Permite devolver itens de uma venda (parcial ou total)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import {
  Text,
  Button,
  TextInput,
  IconButton,
  Portal,
  Switch,
  Chip,
} from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCurrency } from '@/utils/format';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { haptics } from '@/utils/haptics';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  checkReturnEligibility,
  processReturn,
  ReturnEligibility,
  ReturnItemRequest,
} from '@/services/returnService';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import ReplacementPicker, { ReplacementChoice } from '@/components/sale/ReplacementPicker';

interface ReturnModalProps {
  visible: boolean;
  saleId: number;
  saleNumber: string;
  onDismiss: () => void;
  onSuccess: () => void;
}

export default function ReturnModal({
  visible,
  saleId,
  saleNumber,
  onDismiss,
  onSuccess,
}: ReturnModalProps) {
  const brandingColors = useBrandingColors();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [eligibility, setEligibility] = useState<ReturnEligibility | null>(null);
  const [selectedItems, setSelectedItems] = useState<Map<number, number>>(new Map());
  const [reason, setReason] = useState('');
  // Troca: por item, a peça que o cliente leva no lugar; e quais peças voltaram com defeito
  const [replacements, setReplacements] = useState<Map<number, ReplacementChoice>>(new Map());
  const [defects, setDefects] = useState<Set<number>>(new Set());
  const [pickerItemId, setPickerItemId] = useState<number | null>(null);
  const [settlement, setSettlement] = useState<'cash' | 'pix' | 'debit_card' | 'credit_card'>('cash');
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

  const closeDialog = () => setDialog(prev => ({ ...prev, visible: false }));

  // Carregar elegibilidade ao abrir
  useEffect(() => {
    if (visible) {
      loadEligibility();
    } else {
      // Reset ao fechar
      setSelectedItems(new Map());
      setReason('');
      setReplacements(new Map());
      setDefects(new Set());
      setPickerItemId(null);
      setSettlement('cash');
    }
  }, [visible]);

  const loadEligibility = async () => {
    setLoading(true);
    try {
      const data = await checkReturnEligibility(saleId);
      setEligibility(data);
      
      // Começa sem nada marcado: um toque direto em "Processar" não pode devolver a venda inteira
      setSelectedItems(new Map());
    } catch (error: any) {
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Erro',
        message: error.response?.data?.detail || error.message || 'Erro ao verificar elegibilidade',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: closeDialog,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (itemId: number, newQuantity: number, maxQuantity: number) => {
    const clampedQuantity = Math.max(0, Math.min(newQuantity, maxQuantity));
    const newSelected = new Map(selectedItems);
    
    if (clampedQuantity === 0) {
      newSelected.delete(itemId);
    } else {
      newSelected.set(itemId, clampedQuantity);
    }
    
    setSelectedItems(newSelected);
    haptics.light();
  };

  const handleSelectAll = () => {
    if (!eligibility) return;
    const newSelected = new Map<number, number>();
    eligibility.items.forEach(item => {
      newSelected.set(item.sale_item_id, item.quantity_available_for_return);
    });
    setSelectedItems(newSelected);
    haptics.success();
  };

  const handleClearSelection = () => {
    setSelectedItems(new Map());
    haptics.light();
  };

  const calculateTotalRefund = (): number => {
    if (!eligibility) return 0;
    
    let total = 0;
    selectedItems.forEach((quantity, itemId) => {
      const item = eligibility.items.find(i => i.sale_item_id === itemId);
      if (item) {
        // Usar o max_refund_amount que já vem com desconto proporcional calculado pelo backend
        // Calcular proporção: (quantidade selecionada / quantidade disponível) * max_refund_amount
        const refundProportion = quantity / item.quantity_available_for_return;
        total += refundProportion * item.max_refund_amount;
      }
    });
    
    return total;
  };

  const totalRefund = calculateTotalRefund();
  const allowRefund = eligibility?.allow_money_refund !== false;
  // Troca: valor das peças novas e diferença a pagar na hora (a loja pode não devolver dinheiro)
  const totalNew = (() => {
    let t = 0;
    selectedItems.forEach((qty, id) => {
      const r = replacements.get(id);
      if (r) t += r.price * qty;
    });
    return t;
  })();
  const hasExchange = replacements.size > 0;
  const netToPay = hasExchange ? totalNew - totalRefund : 0;
  const missingReplacement = !allowRefund && Array.from(selectedItems.keys()).some((id) => !replacements.has(id));
  const selectedCount = selectedItems.size;
  const totalItems = eligibility?.items.length || 0;
  const isAllSelected = selectedCount === totalItems && totalItems > 0;

  const handleProcessReturn = () => {
    if (!eligibility) return;

    if (selectedItems.size === 0) {
      haptics.warning();
      setDialog({ visible: true, type: 'warning', title: 'Nenhum item selecionado', message: 'Selecione pelo menos um item para devolver.', confirmText: 'OK', cancelText: '', onConfirm: closeDialog });
      return;
    }

    if (reason.trim().length < 3) {
      haptics.warning();
      setDialog({ visible: true, type: 'warning', title: 'Motivo obrigatório', message: 'Informe o motivo da devolução (mínimo 3 caracteres).', confirmText: 'OK', cancelText: '', onConfirm: closeDialog });
      return;
    }

    if (missingReplacement) {
      haptics.warning();
      setDialog({ visible: true, type: 'warning', title: 'Escolha a peça nova', message: 'Esta loja não devolve dinheiro: para cada peça devolvida, escolha a peça que o cliente leva no lugar.', confirmText: 'OK', cancelText: '', onConfirm: closeDialog });
      return;
    }
    if (hasExchange && netToPay < -0.005 && !allowRefund) {
      haptics.warning();
      setDialog({ visible: true, type: 'warning', title: 'Peça nova vale menos', message: `A peça nova vale ${formatCurrency(-netToPay)} a menos que a devolvida e a loja não devolve dinheiro. Escolha uma peça de valor igual ou maior.`, confirmText: 'OK', cancelText: '', onConfirm: closeDialog });
      return;
    }

    const isFullReturn = eligibility.items.every(
      item => selectedItems.get(item.sale_item_id) === item.quantity_available_for_return
    );

    haptics.warning();
    setDialog({
      visible: true,
      type: 'warning',
      title: isFullReturn ? 'Confirmar Devolução Total' : 'Confirmar Devolução Parcial',
      message: hasExchange
        ? `Confirmar a troca de ${selectedCount} item(ns)?\n\n${netToPay > 0.005 ? `O cliente paga agora ${formatCurrency(netToPay)} de diferença (${settlementLabel(settlement)}).` : 'Sem diferença a pagar.'}\nO estoque será atualizado.`
        : `Deseja processar a devolução de ${isFullReturn ? 'todos os itens' : `${selectedCount} item(ns)`}?\n\nO reembolso será processado e o estoque será atualizado.`,
      confirmText: 'Confirmar Devolução',
      cancelText: 'Cancelar',
      onConfirm: executeReturn,
    });
  };

  const executeReturn = async () => {
    if (!eligibility) return;
    
    setProcessing(true);
    haptics.heavy();
    
    try {
      // Montar payload
      const items: ReturnItemRequest[] = [];
      selectedItems.forEach((quantity, saleItemId) => {
        if (quantity > 0) {
          const rep = replacements.get(saleItemId);
          items.push({
            sale_item_id: saleItemId,
            quantity,
            restock: !defects.has(saleItemId),
            replacement_variant_id: rep?.variant_id,
          });
        }
      });
      
      await processReturn(saleId, {
        items,
        reason: reason.trim(),
        refund_method: 'original',
        settlement_method: settlement,
      });
      
      haptics.success();
      setDialog({
        visible: true,
        type: 'success',
        title: 'Devolução Concluída',
        message: hasExchange
          ? `Troca concluída.${netToPay > 0.005 ? ` Diferença recebida: ${formatCurrency(netToPay)}.` : ''}\n\nO estoque foi atualizado automaticamente.`
          : `A devolução de ${formatCurrency(totalRefund)} foi processada com sucesso.\n\nO estoque foi atualizado automaticamente.`,
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => { closeDialog(); onSuccess(); onDismiss(); },
      });
    } catch (error: any) {
      haptics.error();
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Erro na Devolução',
        message: error.response?.data?.detail || error.message || 'Erro ao processar devolução. Tente novamente.',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: closeDialog,
      });
    } finally {
      setProcessing(false);
    }
  };

  const settlementLabel = (m: string) =>
    ({ cash: 'dinheiro', pix: 'PIX', debit_card: 'débito', credit_card: 'crédito' } as Record<string, string>)[m] || m;

  // Dias restantes
  const daysRemaining = eligibility 
    ? Math.max(0, eligibility.max_return_days - eligibility.days_since_sale)
    : 0;
  const isUrgent = daysRemaining <= 2 && daysRemaining >= 0;
  // o servidor aceita até o último dia (dias <= prazo): no último dia é "Último dia!", não "expirado"
  const isExpired = eligibility && eligibility.days_since_sale > eligibility.max_return_days;

  return (
    <>
      <BottomSheet
        visible={visible}
        onDismiss={onDismiss}
        title="Troca e devolução"
        subtitle={saleNumber}
        icon="return-up-back-outline"
        dismissOnBackdrop={!processing}
        actions={
          eligibility?.is_eligible
            ? [
                {
                  label: 'Cancelar',
                  onPress: onDismiss,
                  variant: 'secondary',
                  disabled: processing,
                },
                {
                  label: hasExchange ? 'Confirmar troca' : 'Processar Devolução',
                  onPress: handleProcessReturn,
                  variant: hasExchange ? 'primary' : 'danger',
                  loading: processing,
                  disabled: processing || selectedItems.size === 0,
                },
              ]
            : [{ label: 'Fechar', onPress: onDismiss, variant: 'secondary' }]
        }
      >
        <Portal.Host>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={brandingColors.primary} />
              <Text style={styles.loadingText}>Verificando elegibilidade...</Text>
            </View>
          ) : !eligibility?.is_eligible ? (
            <View style={styles.notEligibleContainer}>
              <Ionicons name="close-circle-outline" size={64} color={Colors.light.error} />
              <Text style={styles.notEligibleTitle}>Devolução não permitida</Text>
              <Text style={styles.notEligibleReason}>{eligibility?.reason}</Text>
            </View>
          ) : (
            <View>
            <View style={[
              styles.infoBanner,
              { backgroundColor: brandingColors.primary + '12' },
              isExpired && styles.infoBannerError,
              isUrgent && !isExpired && styles.infoBannerWarning,
            ]}>
              <Ionicons
                name={isExpired ? 'close-circle' : isUrgent ? 'alert-circle' : 'information-circle'}
                size={20}
                color={isExpired ? Colors.light.error : isUrgent ? Colors.light.warning : brandingColors.primary}
              />
              <View style={styles.infoBannerText}>
                <Text style={[
                  styles.infoBannerTitle,
                  { color: brandingColors.primary },
                  isExpired && styles.infoBannerTitleError,
                  isUrgent && !isExpired && styles.infoBannerTitleWarning,
                ]}>
                  {isExpired
                    ? 'Prazo expirado'
                    : daysRemaining === 0
                      ? 'Último dia!'
                      : `${daysRemaining} dias restantes`}
                </Text>
                <Text style={styles.infoBannerSubtext}>
                  Prazo de {eligibility.max_return_days} dias após a compra
                </Text>
              </View>
            </View>

            {!allowRefund && (
              <Text style={styles.infoBannerSubtext}>
                Esta loja não devolve dinheiro: para cada peça devolvida, escolha a peça que o cliente leva no lugar.
              </Text>
            )}

            {/* Ações Rápidas */}
            <View style={styles.quickActions}>
              <Button
                mode="outlined"
                onPress={handleSelectAll}
                disabled={isAllSelected}
                compact
                icon="check-all"
                style={styles.quickActionButton}
              >
                Selecionar todos
              </Button>
              <Button
                mode="outlined"
                onPress={handleClearSelection}
                disabled={selectedCount === 0}
                compact
                icon="close"
                style={styles.quickActionButton}
              >
                Limpar
              </Button>
            </View>

            {/* Itens */}
            <Text style={styles.sectionTitle}>Itens para Devolução</Text>

            {eligibility.items.map((item) => {
              const selectedQuantity = selectedItems.get(item.sale_item_id) || 0;
              const isSelected = selectedQuantity > 0;

              return (
                <View
                  key={item.sale_item_id}
                  style={[
                    styles.itemCard,
                    isSelected && { borderColor: brandingColors.primary, backgroundColor: brandingColors.primary + '10' },
                  ]}
                >
                  <View style={styles.itemHeader}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.product_name}{item.variant_label ? ` (${item.variant_label})` : ''}</Text>
                      <Text style={styles.itemPrice}>{formatCurrency(item.unit_price)} cada</Text>
                    </View>
                    <View style={styles.itemQuantityInfo}>
                      <Text style={[styles.itemQuantityLabel, { color: brandingColors.primary }]}>
                        Disponível: {item.quantity_available_for_return}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.quantityControl}>
                    <IconButton
                      icon="minus"
                      size={20}
                      mode="contained"
                      containerColor={Colors.light.error}
                      iconColor="#fff"
                      onPress={() => handleQuantityChange(item.sale_item_id, selectedQuantity - 1, item.quantity_available_for_return)}
                      disabled={selectedQuantity === 0}
                    />
                    <Text style={styles.quantity}>{selectedQuantity}</Text>
                    <IconButton
                      icon="plus"
                      size={20}
                      mode="contained"
                      containerColor={brandingColors.primary}
                      iconColor="#fff"
                      onPress={() => handleQuantityChange(item.sale_item_id, selectedQuantity + 1, item.quantity_available_for_return)}
                      disabled={selectedQuantity >= item.quantity_available_for_return}
                    />
                  </View>

                  {selectedQuantity > 0 && (
                    <Text style={styles.itemRefund}>
                      {allowRefund ? 'Reembolso' : 'Valor da peça devolvida'}: {formatCurrency((selectedQuantity / item.quantity_available_for_return) * item.max_refund_amount)}
                    </Text>
                  )}

                  {selectedQuantity > 0 && (
                    <View style={{ marginTop: 8 }}>
                      {replacements.has(item.sale_item_id) ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="swap-horizontal" size={18} color={brandingColors.primary} />
                          <Text style={{ flex: 1, color: Colors.light.text }}>
                            Leva: {replacements.get(item.sale_item_id)!.label} ({formatCurrency(replacements.get(item.sale_item_id)!.price)})
                          </Text>
                          <Button compact onPress={() => setReplacements((prev) => { const m = new Map(prev); m.delete(item.sale_item_id); return m; })}>
                            Tirar
                          </Button>
                        </View>
                      ) : (
                        <Button mode="outlined" icon="swap-horizontal" compact onPress={() => setPickerItemId(item.sale_item_id)}>
                          Trocar por outra peça
                        </Button>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        <Switch
                          value={defects.has(item.sale_item_id)}
                          onValueChange={(v) => setDefects((prev) => { const s = new Set(prev); if (v) s.add(item.sale_item_id); else s.delete(item.sale_item_id); return s; })}
                        />
                        <Text style={{ flex: 1, marginLeft: 8, color: Colors.light.textSecondary }}>
                          Peça com defeito (não volta ao estoque; dá para enviar ao fornecedor)
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Motivo */}
            <Text style={styles.sectionTitle}>Motivo da Devolução</Text>
            <TextInput
              mode="outlined"
              placeholder="Ex: Produto com defeito, cliente desistiu..."
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              style={styles.reasonInput}
              maxLength={500}
            />

            {/* Troca: diferença a pagar na hora */}
            {hasExchange && (
              <View style={[styles.summaryCard, { borderColor: brandingColors.primary }]}>
                <Text style={styles.summaryTitle}>Resumo da troca</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Valor das peças devolvidas</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(totalRefund)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Valor das peças novas</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(totalNew)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{netToPay >= 0 ? 'Cliente paga agora' : 'Diferença a devolver'}</Text>
                  <Text style={[styles.summaryValue, styles.summaryTotal, { color: brandingColors.primary }]}>
                    {formatCurrency(Math.abs(netToPay))}
                  </Text>
                </View>
                {netToPay > 0.005 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {(['cash', 'pix', 'debit_card', 'credit_card'] as const).map((m) => (
                      <Chip key={m} selected={settlement === m} onPress={() => setSettlement(m)} mode={settlement === m ? 'flat' : 'outlined'}>
                        {settlementLabel(m).charAt(0).toUpperCase() + settlementLabel(m).slice(1)}
                      </Chip>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Resumo */}
            {!hasExchange && totalRefund > 0 && (
              <View style={[styles.summaryCard, { borderColor: brandingColors.primary }]}>
                <Text style={styles.summaryTitle}>Resumo da Devolução</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Itens selecionados</Text>
                  <Text style={styles.summaryValue}>{selectedCount}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total do Reembolso</Text>
                  <Text style={[styles.summaryValue, styles.summaryTotal, { color: brandingColors.primary }]}>
                    {formatCurrency(totalRefund)}
                  </Text>
                </View>
              </View>
            )}

            </View>
          )}

          <ReplacementPicker
            visible={pickerItemId !== null}
            productId={eligibility?.items.find((i) => i.sale_item_id === pickerItemId)?.product_id}
            excludeVariantId={eligibility?.items.find((i) => i.sale_item_id === pickerItemId)?.variant_id}
            onClose={() => setPickerItemId(null)}
            onSelect={(choice) => {
              if (pickerItemId !== null) setReplacements((prev) => new Map(prev).set(pickerItemId, choice));
              setPickerItemId(null);
            }}
          />

          <ConfirmDialog
            visible={dialog.visible}
            type={dialog.type}
            title={dialog.title}
            message={dialog.message}
            confirmText={dialog.confirmText}
            cancelText={dialog.cancelText}
            onConfirm={dialog.onConfirm}
            onCancel={closeDialog}
          />
        </Portal.Host>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.textSecondary,
  },
  notEligibleContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notEligibleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginTop: 16,
    marginBottom: 8,
  },
  notEligibleReason: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  infoBannerWarning: {
    backgroundColor: Colors.light.warning + '15',
  },
  infoBannerError: {
    backgroundColor: Colors.light.error + '12',
  },
  infoBannerText: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoBannerTitleWarning: {
    color: Colors.light.warning,
  },
  infoBannerTitleError: {
    color: Colors.light.error,
  },
  infoBannerSubtext: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },

  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
  },
  quickActionButton: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
    marginTop: 8,
  },

  // Item Card
  itemCard: {
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  itemQuantityInfo: {
    alignItems: 'flex-end',
  },
  itemQuantityLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quantity: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'center',
  },
  itemRefund: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.success,
    textAlign: 'center',
    marginTop: 8,
  },

  // Reason Input
  reasonInput: {
    marginBottom: 16,
  },

  // Summary Card
  summaryCard: {
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  summaryTotal: {
    fontSize: 18,
  },
});