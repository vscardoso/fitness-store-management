/**
 * "Outra variação deste produto": lança numa entrada existente uma peça de outra cor/tamanho de um produto
 * já cadastrado (ex.: faltou 1 unidade do Preto G). Se a variação não existe, o servidor cria; tudo de uma vez.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Colors, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { addVariantToEntry } from '@/services/stockEntryService';
import { parseApiError } from '@/utils/apiError';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';

interface Props {
  visible: boolean;
  onClose: () => void;
  entryId: number;
  productId: number;
  productName: string;
  /** Custo da peça já lançada, só para sugerir o valor. */
  suggestedCost?: number;
  /** Preço de venda atual, só para sugerir o valor. */
  suggestedPrice?: number;
}

export default function AddVariantModal({ visible, onClose, entryId, productId, productName, suggestedCost, suggestedPrice }: Props) {
  const brand = useBrandingColors();
  const queryClient = useQueryClient();
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setColor('');
      setSize('');
      setQuantity('1');
      setCost(suggestedCost ? maskCurrencyBR(String(Math.round(suggestedCost * 100))) : '');
      setPrice(suggestedPrice ? maskCurrencyBR(String(Math.round(suggestedPrice * 100))) : '');
      setError('');
      setDone(null);
    }
  }, [visible, suggestedCost, suggestedPrice]);

  const mutation = useMutation({
    mutationFn: () =>
      addVariantToEntry(entryId, {
        product_id: productId,
        color: color.trim() || undefined,
        size: size.trim() || undefined,
        quantity: parseInt(quantity, 10),
        cost_price: unmaskCurrency(cost),
        price: unmaskCurrency(price) > 0 ? unmaskCurrency(price) : undefined,
      }),
    onSuccess: (r) => {
      ['stock-entry', 'stock-entries', 'lot-analytics', 'lot-costs', 'lot-profit-ranking', 'grouped-products', 'products', 'inventory-valuation']
        .forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      setDone(
        `${r.variant_created ? 'Variação criada e ' : ''}${r.quantity_received} un lançada(s): ${[r.color, r.size].filter(Boolean).join(' / ')} (SKU ${r.sku}).`
      );
    },
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível lançar. Tente de novo.'),
  });

  const submit = () => {
    if (!color.trim() && !size.trim()) return setError('Informe a cor ou o tamanho.');
    const q = parseInt(quantity, 10);
    if (!Number.isFinite(q) || q <= 0) return setError('A quantidade deve ser maior que zero.');
    if (unmaskCurrency(cost) <= 0) return setError('Informe quanto custou cada peça.');
    setError('');
    mutation.mutate();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Outra variação deste produto</Text>
            <Text style={styles.product} numberOfLines={2}>{productName}</Text>
            <Text style={styles.help}>
              Use quando faltou lançar uma peça de outra cor ou tamanho deste produto. Se essa variação ainda não existe, o app cria e já
              lança na entrada. Se já existe, só soma a quantidade.
            </Text>

            {done ? (
              <>
                <Text style={styles.success}>{done}</Text>
                <TouchableOpacity style={[styles.save, { backgroundColor: brand.primary }]} onPress={onClose}>
                  <Text style={styles.saveText}>Fechar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput label="Cor (ex.: Preto)" value={color} onChangeText={setColor} mode="outlined" style={styles.input} />
                <TextInput label="Tamanho (ex.: G)" value={size} onChangeText={setSize} mode="outlined" autoCapitalize="characters" style={styles.input} />
                <TextInput label="Quantidade" value={quantity} onChangeText={(t) => setQuantity(t.replace(/\D/g, ''))} mode="outlined" keyboardType="numeric" style={styles.input} />
                <TextInput
                  label="Quanto custou cada peça?"
                  value={cost}
                  onChangeText={(t) => setCost(maskCurrencyBR(t))}
                  mode="outlined"
                  keyboardType="numeric"
                  placeholder="0,00"
                  left={<TextInput.Affix text="R$" />}
                  style={styles.input}
                />
                <TextInput
                  label="Preço de venda (se vazio, igual às outras)"
                  value={price}
                  onChangeText={(t) => setPrice(maskCurrencyBR(t))}
                  mode="outlined"
                  keyboardType="numeric"
                  placeholder="0,00"
                  left={<TextInput.Affix text="R$" />}
                  style={styles.input}
                />
                {!!error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.buttons}>
                  <TouchableOpacity style={styles.cancel} onPress={onClose}>
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.save, { backgroundColor: brand.primary, flex: 1 }, mutation.isPending && { opacity: 0.6 }]}
                    onPress={submit}
                    disabled={mutation.isPending}
                  >
                    <Text style={styles.saveText}>{mutation.isPending ? 'Lançando...' : 'Lançar na entrada'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 18, maxHeight: '92%' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  product: { fontSize: 14, fontWeight: '600', color: Colors.light.textSecondary, marginTop: 2 },
  help: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 8 },
  input: { marginTop: 10, backgroundColor: Colors.light.card },
  error: { color: VALUE_COLORS.negative, marginTop: 10, fontSize: 13 },
  success: { color: VALUE_COLORS.positive, marginTop: 14, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancel: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, alignItems: 'center' },
  cancelText: { color: Colors.light.text, fontWeight: '600' },
  save: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#fff', fontWeight: '700' },
});
