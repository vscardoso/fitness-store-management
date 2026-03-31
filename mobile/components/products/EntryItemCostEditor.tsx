/**
 * EntryItemCostEditor
 *
 * Modal reutilizável para editar custo/quantidade/preço de um item de entrada.
 *
 * Usado em:
 *  - app/products/edit/[id].tsx  (showQuantity=false, showSellPrice=false)
 *  - app/entries/[id].tsx        (todos os campos)
 *
 * O componente cuida apenas da UI e validação.
 * O caller é responsável pela mutation e invalidação de cache.
 */

import { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import { maskCurrencyBR, unmaskCurrency, toBRNumber } from '@/utils/priceFormatter';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface EntryItemEditorData {
  /** ID principal do item (entries/[id].tsx usa `id`, edit/[id].tsx usa `entry_item_id`) */
  id?: number;
  entry_item_id?: number;
  entry_code?: string;
  product_name?: string;
  quantity_received: number;
  unit_cost: number;
  /** Preço de venda atual do produto */
  product_price?: number;
  notes?: string;
}

export interface EntryItemUpdate {
  quantity_received?: number;
  unit_cost: number;
  sell_price?: number;
  notes?: string;
}

interface EntryItemCostEditorProps {
  visible: boolean;
  item: EntryItemEditorData | null;
  /** Exibe campo de quantidade recebida. Padrão: true */
  showQuantity?: boolean;
  /** Exibe campo de preço de venda. Padrão: true */
  showSellPrice?: boolean;
  /** Exibe campo de observações. Padrão: false */
  showNotes?: boolean;
  /** Texto customizado do aviso. */
  warningText?: string;
  /** Indica que a mutation externa está em progresso. */
  loading?: boolean;
  onDismiss: () => void;
  /** Chamado com os dados validados — o caller realiza a mutation. */
  onConfirm: (data: EntryItemUpdate) => void;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export default function EntryItemCostEditor({
  visible,
  item,
  showQuantity = true,
  showSellPrice = true,
  showNotes = false,
  warningText,
  loading = false,
  onDismiss,
  onConfirm,
}: EntryItemCostEditorProps) {
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const brandingColors = useBrandingColors();

  // Preencher campos quando o item muda
  useEffect(() => {
    if (item && visible) {
      setQuantity(item.quantity_received.toString());
      setCost(toBRNumber(item.unit_cost));
      setPrice(toBRNumber(item.product_price ?? 0));
      setNotes(item.notes ?? '');
      setError('');
    }
  }, [item, visible]);

  const handleDismiss = () => {
    setError('');
    onDismiss();
  };

  const handleConfirm = () => {
    setError('');

    const qty = showQuantity ? parseInt(quantity, 10) : undefined;
    const unitCost = unmaskCurrency(cost);
    const sellPrice = showSellPrice ? unmaskCurrency(price) : undefined;

    // Validações
    if (showQuantity && (isNaN(qty!) || qty! <= 0)) {
      setError('Quantidade deve ser maior que zero');
      return;
    }
    if (isNaN(unitCost) || unitCost < 0) {
      setError('Custo unitário inválido');
      return;
    }
    if (showSellPrice && (isNaN(sellPrice!) || sellPrice! < 0)) {
      setError('Preço de venda inválido');
      return;
    }

    onConfirm({
      quantity_received: qty,
      unit_cost: unitCost,
      sell_price: sellPrice,
      notes: showNotes ? (notes.trim() || undefined) : undefined,
    });
  };

  const defaultWarning = showQuantity
    ? 'Ao editar quantidade ou custo, o inventário será recalculado automaticamente.'
    : 'Ao editar o custo unitário, o custo do produto será atualizado automaticamente.';

  const priceWarn =
    showSellPrice &&
    unmaskCurrency(price) > 0 &&
    unmaskCurrency(price) < unmaskCurrency(cost);

  return (
    <CustomModal
      visible={visible}
      onDismiss={handleDismiss}
      title="Editar Item da Entrada"
      subtitle={item?.product_name ?? (item?.entry_code ? `Entrada ${item.entry_code}` : undefined)}
    >
      {/* Aviso */}
      <View style={styles.warningBox}>
        <Ionicons name="information-circle" size={20} color={brandingColors.primary} />
        <Text style={styles.warningText}>{warningText ?? defaultWarning}</Text>
      </View>

      {/* Quantidade */}
      {showQuantity && (
        <TextInput
          label="Quantidade Recebida *"
          value={quantity}
          onChangeText={(t) => {
            setError('');
            setQuantity(t.replace(/\D/g, ''));
          }}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
        />
      )}

      {/* Custo */}
      <TextInput
        label="Custo Unitário (R$) *"
        value={cost}
        onChangeText={(t) => {
          setError('');
          setCost(maskCurrencyBR(t));
        }}
        keyboardType="numeric"
        mode="outlined"
        style={styles.input}
        placeholder="0,00"
        left={<TextInput.Affix text="R$" />}
        autoFocus={!showQuantity}
      />

      {/* Preço de venda */}
      {showSellPrice && (
        <>
          <TextInput
            label="Preço de Venda (R$)"
            value={price}
            onChangeText={(t) => setPrice(maskCurrencyBR(t))}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            placeholder="0,00"
            left={<TextInput.Affix text="R$" />}
            right={
              priceWarn ? (
                <TextInput.Icon icon="alert" color={Colors.light.warning} />
              ) : undefined
            }
          />
          {priceWarn && (
            <HelperText type="info" visible style={{ color: Colors.light.warning }}>
              ⚠️ Preço de venda menor que o custo
            </HelperText>
          )}
        </>
      )}

      {/* Observações */}
      {showNotes && (
        <TextInput
          label="Observações"
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
          placeholder="Observações sobre este item (opcional)"
        />
      )}

      {/* Erro de validação */}
      {!!error && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}

      <ModalActions
        onCancel={handleDismiss}
        onConfirm={handleConfirm}
        cancelText="Cancelar"
        confirmText="Salvar Alterações"
        loading={loading}
        confirmColor={brandingColors.primary}
      />
    </CustomModal>
  );
}

const styles = StyleSheet.create({
  warningBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.light.info + '15',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.info,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
});
