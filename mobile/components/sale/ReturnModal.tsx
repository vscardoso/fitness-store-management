/**
 * Modal de Devolução
 * Permite devolver itens de uma venda (parcial ou total)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  TextInput,
  IconButton,
  Portal,
  Switch,
  Chip,
} from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { haptics } from '@/utils/haptics';
import BottomSheet from '@/components/ui/BottomSheet';
import AppButton from '@/components/ui/AppButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getReceipt, sendReceiptViaStoreWhatsapp } from '@/services/receiptService';

// Nativo: o ConfirmDialog (Portal do Paper) precisa de um Host dentro da folha para aparecer por cima dela. Na web ele já é uma janela própria.
const DialogHost = ({ children }: { children: React.ReactNode }) => (Platform.OS === 'web' ? <>{children}</> : <Portal.Host>{children}</Portal.Host>);
import {
  checkReturnEligibility,
  processReturn,
  ReturnEligibility,
  ReturnItemRequest,
} from '@/services/returnService';
import ReplacementPicker, { ReplacementChoice } from '@/components/sale/ReplacementPicker';
import ItemDiscountEditor from '@/components/sale/ItemDiscountEditor';
import { percentLabel, percentOf, unitNet } from '@/utils/itemDiscount';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { plural } from '@/utils/plural';

/** Preço de cada peça nova já com o desconto que quem vende digitou. */
const netUnit = (c: ReplacementChoice): number => unitNet(c.price, c.unitDiscount ?? 0);

interface ReturnModalProps {
  visible: boolean;
  saleId: number;
  saleNumber: string;
  onDismiss: () => void;
  onSuccess: () => void;
  /** Estorno por erro de lançamento (só admin): vale fora do prazo e devolve o dinheiro mesmo em loja que só troca */
  correction?: boolean;
}

export default function ReturnModal({
  visible,
  saleId,
  saleNumber,
  onDismiss,
  onSuccess,
  correction = false,
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
  // Troca: peças a mais que o cliente leva para completar o valor (a primeira escolhida pode valer menos que a devolvida)
  const [extras, setExtras] = useState<ReplacementChoice[]>([]);
  const [pickerExtra, setPickerExtra] = useState(false);
  const [settlement, setSettlement] = useState<'cash' | 'pix' | 'debit_card' | 'credit_card'>('cash');
  const [dialog, setDialog] = useState<{
    visible: boolean;
    type: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    /** Cancelar com ação própria (ex.: "Avisar o cliente"); sem isso só fecha o diálogo */
    onCancel?: () => void;
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
      const data = await checkReturnEligibility(saleId, correction);
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
      if (r) t += netUnit(r) * qty;
    });
    return t + extras.reduce((a, e) => a + netUnit(e), 0);
  })();
  // Desconto dado nas peças novas (digitado por quem vende): aparece no resumo da troca
  const newDiscount = (() => {
    let d = 0;
    selectedItems.forEach((qty, id) => { const r = replacements.get(id); if (r?.unitDiscount) d += r.unitDiscount * qty; });
    return d + extras.reduce((a, e) => a + (e.unitDiscount ?? 0), 0);
  })();
  const hasExchange = replacements.size > 0 || extras.length > 0;
  const netToPay = hasExchange ? totalNew - totalRefund : 0;
  const missingReplacement = !allowRefund && !hasExchange;
  // Loja que não devolve dinheiro: com peça marcada e nenhuma peça nova, o próximo passo é escolher a peça
  const needsPick = missingReplacement && selectedItems.size > 0 && !correction;
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
      setDialog({ visible: true, type: 'warning', title: 'Escolha a peça nova', message: 'Esta loja não devolve dinheiro: escolha a peça que o cliente leva no lugar.', confirmText: 'OK', cancelText: '', onConfirm: closeDialog });
      return;
    }
    if (hasExchange && netToPay < -0.005 && !allowRefund) {
      haptics.warning();
      setDialog({ visible: true, type: 'warning', title: 'Falta completar o valor', message: `As peças novas valem ${formatCurrency(-netToPay)} a menos que as devolvidas e a loja não devolve dinheiro. Adicione outra peça para completar (se passar do valor, o cliente paga a diferença).`, confirmText: 'OK', cancelText: '', onConfirm: closeDialog });
      return;
    }

    const isFullReturn = eligibility.items.every(
      item => selectedItems.get(item.sale_item_id) === item.quantity_available_for_return
    );

    haptics.warning();
    setDialog({
      visible: true,
      type: 'warning',
      title: hasExchange ? 'Confirmar a troca' : isFullReturn ? 'Devolução de toda a venda' : 'Devolução de parte da venda',
      message: hasExchange
        ? `Trocar ${plural(selectedCount, 'peça', 'peças')}?\n\n${netToPay > 0.005 ? `O cliente paga agora ${formatCurrency(netToPay)} de diferença (${settlementLabel(settlement)}).` : 'Sem diferença a pagar.'}\nO estoque será atualizado.`
        : `Devolver ${isFullReturn ? 'todas as peças' : plural(selectedCount, 'peça', 'peças')} e reembolsar ${formatCurrency(totalRefund)}?\n\nO estoque será atualizado.`,
      confirmText: hasExchange ? 'Trocar' : 'Devolver',
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
            replacement_unit_price: rep?.unitDiscount ? netUnit(rep) : undefined,
          });
        }
      });
      
      await processReturn(saleId, {
        items,
        reason: reason.trim(),
        extra_pieces: extras.length ? extras.map((e) => ({ variant_id: e.variant_id, quantity: 1, unit_price: e.unitDiscount ? netUnit(e) : undefined })) : undefined,
        refund_method: 'original',
        settlement_method: settlement,
        is_correction: correction || undefined,
      });
      
      haptics.success();
      // Devolução comum: oferece avisar o cliente pelo WhatsApp da loja (comprovante atualizado, estorno e pontos).
      // Estorno por erro de lançamento não avisa: foi erro da loja.
      let canNotify = false;
      if (!correction) {
        try {
          const info = await getReceipt(saleId);
          canNotify = !!info.store_whatsapp.connected && !!info.whatsapp_url;
        } catch { /* sem aviso: a devolução já foi gravada */ }
      }
      const finish = () => { closeDialog(); onSuccess(); onDismiss(); };
      const notify = async () => {
        closeDialog();
        try {
          const r = await sendReceiptViaStoreWhatsapp(saleId);
          setDialog({
            visible: true, type: 'success', title: 'Cliente avisado',
            message: `${r.customer} recebeu o comprovante atualizado pelo WhatsApp da loja.`,
            confirmText: 'OK', cancelText: '', onConfirm: finish,
          });
        } catch (e: any) {
          setDialog({
            visible: true, type: 'warning', title: 'Não consegui avisar o cliente',
            message: `${e?.response?.data?.detail || e?.message || 'Tente de novo pelo botão de comprovante da venda.'}

A devolução já está registrada.`,
            confirmText: 'OK', cancelText: '', onConfirm: finish,
          });
        }
      };
      setDialog({
        visible: true,
        type: 'success',
        title: 'Devolução Concluída',
        message: hasExchange
          ? `Troca concluída.${netToPay > 0.005 ? ` Diferença recebida: ${formatCurrency(netToPay)}.` : ''}\n\nO estoque foi atualizado automaticamente.`
          : `A devolução de ${formatCurrency(totalRefund)} foi processada com sucesso.\n\nO estoque foi atualizado automaticamente.`,
        confirmText: 'OK',
        cancelText: canNotify ? 'Avisar o cliente' : '',
        onConfirm: finish,
        onCancel: canNotify ? notify : undefined,
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
  const isUrgent = !correction && daysRemaining <= 2 && daysRemaining >= 0;
  // o servidor aceita até o último dia (dias <= prazo): no último dia é "Último dia!", não "expirado"
  // No estorno do administrador o prazo não vale: o aviso de prazo vencido (vermelho) só confunde
  const isExpired = !correction && eligibility && eligibility.days_since_sale > eligibility.max_return_days;

  return (
    <>
      <BottomSheet
        visible={visible}
        onDismiss={onDismiss}
        title={correction ? 'Estorno por erro de lançamento' : 'Troca e devolução'}
        subtitle={`Venda #${saleNumber.split('-').pop() || saleNumber}`}
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
                  label: hasExchange ? 'Confirmar troca' : needsPick ? 'Escolher peça nova' : (correction ? 'Confirmar estorno' : 'Processar Devolução'),
                  onPress: needsPick ? () => setPickerItemId(Array.from(selectedItems.keys())[0]) : handleProcessReturn,
                  variant: hasExchange || needsPick ? 'primary' : 'danger',
                  loading: processing,
                  disabled: processing || selectedItems.size === 0,
                },
              ]
            : [{ label: 'Fechar', onPress: onDismiss, variant: 'secondary' }]
        }
      >
        <DialogHost>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ScreenLoader inline />
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
            {/* Prazo e regra da loja: uma linha só (quem já usou 50 vezes não precisa reler um parágrafo) */}
            <View style={styles.deadlineRow}>
              <Ionicons
                name={isExpired ? 'close-circle' : isUrgent ? 'alert-circle' : 'time-outline'}
                size={16}
                color={isExpired ? Colors.light.error : isUrgent ? Colors.light.warning : Colors.light.textSecondary}
              />
              <Text style={[styles.deadlineText, isExpired && { color: Colors.light.error }, isUrgent && !isExpired && { color: Colors.light.warning }]}>
                {correction
                  ? 'Estorno do administrador: devolve o dinheiro e a peça volta ao estoque. Fica registrado em seu nome.'
                  : isExpired
                  ? 'Prazo expirado'
                  : daysRemaining === 0
                    ? 'Último dia do prazo'
                    : `${daysRemaining === 1 ? 'Falta 1 dia' : `Faltam ${daysRemaining} dias`} para o fim do prazo`}
                {!correction && !allowRefund ? ' · A loja só troca por outra peça' : ''}
              </Text>
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitleInline}>O que está voltando</Text>
              {eligibility.items.length > 1 && (
                <AppButton
                  label={isAllSelected ? 'Limpar' : 'Selecionar todos'}
                  variant="text" size="sm"
                  onPress={isAllSelected ? handleClearSelection : handleSelectAll}
                />
              )}
            </View>

            {eligibility.items.map((item) => {
              const selectedQuantity = selectedItems.get(item.sale_item_id) || 0;
              const isSelected = selectedQuantity > 0;
              const rep = replacements.get(item.sale_item_id);
              const value = (Math.max(selectedQuantity, 1) / item.quantity_available_for_return) * item.max_refund_amount;
              const valueCaption = rep || correction ? '' : allowRefund ? 'reembolso' : 'vale na troca';
              const isDefect = defects.has(item.sale_item_id);

              return (
                <View key={item.sale_item_id} style={[styles.pieceCard, isSelected && { borderColor: brandingColors.primary }]}>
                  <TouchableOpacity
                    style={styles.pieceHead}
                    activeOpacity={0.7}
                    onPress={() => handleQuantityChange(item.sale_item_id, isSelected ? 0 : 1, item.quantity_available_for_return)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`${item.product_name}${item.variant_label ? `, ${item.variant_label}` : ''}`}
                  >
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={isSelected ? brandingColors.primary : Colors.light.textTertiary}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pieceName} numberOfLines={2}>{item.product_name}{item.variant_label ? ` (${item.variant_label})` : ''}</Text>
                      <Text style={styles.pieceSub}>
                        {formatCurrency(item.unit_price)} cada{(() => {
                          const paid = item.quantity_available_for_return > 0 ? item.max_refund_amount / item.quantity_available_for_return : item.unit_price;
                          return paid < item.unit_price - 0.005 ? ` · vendida com ${percentLabel(percentOf(item.unit_price - paid, item.unit_price))} de desconto` : '';
                        })()}{item.quantity_available_for_return > 1 ? ` · pode devolver ${item.quantity_available_for_return}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.pieceValue}>{formatCurrency(value)}</Text>
                      {isSelected && !!valueCaption && <Text style={styles.pieceCaption}>{valueCaption}</Text>}
                    </View>
                  </TouchableOpacity>

                  {isSelected && item.quantity_available_for_return > 1 && (
                    <View style={styles.qtyRow}>
                      <Text style={styles.pieceSub}>Quantas voltam</Text>
                      <View style={styles.qtyStepper}>
                        <IconButton icon="minus" size={18} mode="contained-tonal"
                          onPress={() => handleQuantityChange(item.sale_item_id, selectedQuantity - 1, item.quantity_available_for_return)} />
                        <Text style={styles.quantity}>{selectedQuantity}</Text>
                        <IconButton icon="plus" size={18} mode="contained-tonal"
                          onPress={() => handleQuantityChange(item.sale_item_id, selectedQuantity + 1, item.quantity_available_for_return)}
                          disabled={selectedQuantity >= item.quantity_available_for_return} />
                      </View>
                    </View>
                  )}

                  {isSelected && (
                    <View style={styles.pieceBody}>
                      {rep ? (
                        <>
                        <View style={styles.swapRow}>
                          <Ionicons name="arrow-forward-circle-outline" size={20} color={brandingColors.primary} />
                          <Text style={styles.swapText} numberOfLines={2}>{rep.label} · {formatCurrency(rep.price)}</Text>
                          <AppButton label="Mudar" variant="text" size="sm" onPress={() => setPickerItemId(item.sale_item_id)} />
                          <AppButton label="Tirar" variant="text" size="sm" onPress={() => setReplacements((prev) => { const m = new Map(prev); m.delete(item.sale_item_id); return m; })} />
                        </View>
                        {/* A peça nova pode sair com desconto: quem vende digita (% ou R$ por peça), sem valores prontos */}
                        <ItemDiscountEditor
                          unitPrice={rep.price}
                          quantity={selectedQuantity}
                          unitDiscount={rep.unitDiscount}
                          onApply={(d) => setReplacements((prev) => new Map(prev).set(item.sale_item_id, { ...rep, unitDiscount: d }))}
                          onClear={() => setReplacements((prev) => new Map(prev).set(item.sale_item_id, { ...rep, unitDiscount: undefined }))}
                        />
                        </>
                      ) : (
                        <AppButton
                          label={needsPick ? 'Escolher peça nova' : 'Trocar por outra peça'}
                          variant="outlined" size="sm" icon="swap-horizontal" fullWidth
                          onPress={() => setPickerItemId(item.sale_item_id)}
                        />
                      )}
                      {rep && netToPay < -0.005 && !allowRefund && (
                        <View style={styles.missingBox}>
                          <Text style={styles.missingText}>Falta {formatCurrency(-netToPay)} para completar o valor</Text>
                          <AppButton label="Adicionar peça" variant="outlined" size="sm" icon="add-circle-outline" onPress={() => setPickerExtra(true)} />
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.defectRow}
                        activeOpacity={0.7}
                        onPress={() => setDefects((prev) => { const st = new Set(prev); if (st.has(item.sale_item_id)) st.delete(item.sale_item_id); else st.add(item.sale_item_id); return st; })}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isDefect }}
                      >
                        <Ionicons name={isDefect ? 'checkbox' : 'square-outline'} size={18} color={isDefect ? Colors.light.error : Colors.light.textTertiary} />
                        <Text style={styles.defectText}>Veio com defeito (não volta ao estoque)</Text>
                      </TouchableOpacity>
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
                {extras.map((e, i) => (
                  <View key={`${e.variant_id}-${i}`} style={{ marginBottom: 4 }}>
                    <View style={[styles.summaryRow, { alignItems: 'center' }]}>
                      <Text style={[styles.summaryLabel, { flex: 1 }]} numberOfLines={2}>+ {e.label} ({formatCurrency(e.price)})</Text>
                      <AppButton label="Tirar" variant="text" size="sm" onPress={() => setExtras((prev) => prev.filter((_, j) => j !== i))} />
                    </View>
                    <ItemDiscountEditor
                      unitPrice={e.price}
                      quantity={1}
                      unitDiscount={e.unitDiscount}
                      onApply={(d) => setExtras((prev) => prev.map((x, j) => (j === i ? { ...x, unitDiscount: d } : x)))}
                      onClear={() => setExtras((prev) => prev.map((x, j) => (j === i ? { ...x, unitDiscount: undefined } : x)))}
                    />
                  </View>
                ))}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Valor das peças devolvidas</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(totalRefund)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{newDiscount > 0.005 ? 'Valor das peças novas (com desconto)' : 'Valor das peças novas'}</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(totalNew)}</Text>
                </View>
                {newDiscount > 0.005 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Desconto dado nas peças novas</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(newDiscount)}</Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{netToPay >= 0 ? 'Cliente paga agora' : allowRefund ? 'Diferença a devolver' : 'Falta completar'}</Text>
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
            {!hasExchange && totalRefund > 0 && needsPick && (
              <View style={[styles.summaryCard, { borderColor: brandingColors.primary }]}>
                <Text style={styles.summaryTitle}>Próximo passo: a peça nova</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Vale na troca</Text>
                  <Text style={[styles.summaryValue, styles.summaryTotal, { color: brandingColors.primary }]}>{formatCurrency(totalRefund)}</Text>
                </View>
                <Text style={styles.summaryLabel}>
                  Bipe a etiqueta ou escolha na lista. Se a peça for mais barata, o cliente completa com outras; se passar, paga a diferença.
                </Text>
              </View>
            )}

            {!hasExchange && totalRefund > 0 && !needsPick && (
              <View style={[styles.summaryCard, { borderColor: brandingColors.primary }]}>
                <Text style={styles.summaryTitle}>Resumo da Devolução</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Peças que voltam</Text>
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
            visible={pickerItemId !== null || pickerExtra}
            productId={pickerExtra ? undefined : eligibility?.items.find((i) => i.sale_item_id === pickerItemId)?.product_id}
            excludeVariantId={pickerExtra ? undefined : eligibility?.items.find((i) => i.sale_item_id === pickerItemId)?.variant_id}
            returnedPrefix={pickerExtra ? 'Falta completar' : 'Voltando'}
            returnedLabel={pickerExtra ? 'valor da troca' : (() => {
              const it = eligibility?.items.find((i) => i.sale_item_id === pickerItemId);
              return it ? [it.product_name, it.variant_label].filter(Boolean).join(' · ') : undefined;
            })()}
            returnedUnitValue={pickerExtra ? Math.max(0, -netToPay) : (() => {
              const it = eligibility?.items.find((i) => i.sale_item_id === pickerItemId);
              return it && it.quantity_available_for_return > 0 ? it.max_refund_amount / it.quantity_available_for_return : undefined;
            })()}
            allowRefund={allowRefund}
            onClose={() => { setPickerItemId(null); setPickerExtra(false); }}
            onSelect={(choice) => {
              if (pickerExtra) setExtras((prev) => [...prev, choice]);
              else if (pickerItemId !== null) setReplacements((prev) => new Map(prev).set(pickerItemId, choice));
              setPickerItemId(null);
              setPickerExtra(false);
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
            onCancel={dialog.onCancel ?? closeDialog}
          />
        </DialogHost>
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
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: theme.spacing.sm },
  deadlineText: { flex: 1, fontSize: 13, color: Colors.light.textSecondary },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.xs, marginBottom: theme.spacing.xs },
  sectionTitleInline: { fontSize: 16, fontWeight: '600', color: Colors.light.text },
  pieceCard: { backgroundColor: Colors.light.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, marginBottom: theme.spacing.sm, overflow: 'hidden' },
  pieceHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.md, minHeight: 56 },
  pieceName: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  pieceSub: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  pieceValue: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  pieceCaption: { fontSize: 12, color: Colors.light.success, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xs },
  qtyStepper: { flexDirection: 'row', alignItems: 'center' },
  pieceBody: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md, gap: theme.spacing.sm },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swapText: { flex: 1, fontSize: 14, color: Colors.light.text },
  missingBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  missingText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.light.warning },
  defectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  defectText: { fontSize: 13, color: Colors.light.textSecondary },
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