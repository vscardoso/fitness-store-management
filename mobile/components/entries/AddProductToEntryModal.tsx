/**
 * Lança um produto JÁ CADASTRADO numa entrada que já existe: escolhe o produto e a variação, a quantidade, o que
 * pagou, o preço de tabela (opcional) e o fornecedor (padrão: o da entrada). Tudo vai numa chamada só.
 */
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { searchProducts } from '@/services/productService';
import { addItemToEntry } from '@/services/stockEntryService';
import SupplierPickerSheet from '@/components/suppliers/SupplierPickerSheet';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import type { Product, Supplier } from '@/types';

interface Props {
  visible: boolean;
  entryId: number;
  entrySupplierName?: string;
  onClose: () => void;
}

interface Choice {
  productId: number;
  variantId?: number;
  label: string;
  cost: number;
  price: number;
}

export default function AddProductToEntryModal({ visible, entryId, entrySupplierName, onClose }: Props) {
  const brand = useBrandingColors();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [pickSupplier, setPickSupplier] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setProducts([]);
    setChoice(null);
    setQty('1');
    setCost('');
    setListPrice('');
    setSupplier(null);
    setError('');
  }, [visible]);

  useEffect(() => {
    if (!visible || query.trim().length < 2) return;
    const t = setTimeout(() => {
      searchProducts(query.trim())
        .then(setProducts)
        .catch(() => setError('Não foi possível buscar.'));
    }, 300);
    return () => clearTimeout(t);
  }, [query, visible]);

  const pick = (p: Product, v?: { id: number; color?: string; size?: string; cost_price?: number; price: number }) => {
    const label = [p.name, v ? [v.color, v.size].filter(Boolean).join(' / ') : ''].filter(Boolean).join(' - ');
    const c = Number(v?.cost_price ?? (p as any).cost_price ?? 0);
    setChoice({ productId: p.id, variantId: v?.id, label, cost: c, price: Number(v?.price ?? (p as any).price ?? 0) });
    setCost(c > 0 ? maskCurrencyBR(String(Math.round(c * 100))) : '');
    setError('');
  };

  const add = useMutation({
    mutationFn: () =>
      addItemToEntry(entryId, {
        product_id: choice!.productId,
        variant_id: choice!.variantId,
        quantity_received: parseInt(qty, 10),
        unit_cost: unmaskCurrency(cost),
        selling_price: choice!.price || undefined,
        supplier_id: supplier?.id ?? undefined,
        list_unit_cost: unmaskCurrency(listPrice) > 0 ? unmaskCurrency(listPrice) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-entry', entryId] });
      qc.invalidateQueries({ queryKey: ['stock-entries'] });
      qc.invalidateQueries({ queryKey: ['lot-analytics', entryId] });
      qc.invalidateQueries({ queryKey: ['lot-costs', entryId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['grouped-products'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      onClose();
    },
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível lançar. Tente de novo.'),
  });

  const submit = () => {
    const n = parseInt(qty, 10);
    if (!choice) return setError('Escolha o produto.');
    if (!n || n < 1) return setError('Informe a quantidade.');
    const paid = unmaskCurrency(cost);
    if (paid <= 0) return setError('Informe quanto você pagou em cada peça.');
    const list = unmaskCurrency(listPrice);
    if (list > 0 && list < paid) return setError('O preço de tabela não pode ser menor que o preço pago.');
    setError('');
    add.mutate();
  };

  const list = unmaskCurrency(listPrice);
  const paid = unmaskCurrency(cost);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Adicionar produto cadastrado</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.light.text} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {!choice ? (
              <>
                <TextInput mode="outlined" label="Buscar produto pelo nome" value={query} onChangeText={setQuery} style={styles.input} />
                {products.map((p) => {
                  const variants = (p.variants || []).filter((v) => v.is_active !== false);
                  return (
                    <View key={p.id} style={{ marginTop: 10 }}>
                      <Text style={styles.productName}>{p.name}</Text>
                      {variants.length === 0 ? (
                        <TouchableOpacity style={[styles.option, { borderColor: brand.primary + '40' }]} onPress={() => pick(p)}>
                          <Text style={styles.optionLabel}>Usar este produto</Text>
                        </TouchableOpacity>
                      ) : (
                        variants.map((v) => (
                          <TouchableOpacity key={v.id} style={[styles.option, { borderColor: brand.primary + '40' }]} onPress={() => pick(p, v as any)}>
                            <Text style={styles.optionLabel}>{[v.color, v.size].filter(Boolean).join(' / ') || 'Única'}</Text>
                            <Text style={styles.optionMeta}>{v.current_stock ?? 0} em estoque</Text>
                            <Text style={[styles.optionPrice, { color: brand.primary }]}>{formatCurrency(Number(v.price))}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  );
                })}
                {query.trim().length >= 2 && products.length === 0 && <Text style={styles.note}>Nenhum produto encontrado.</Text>}
              </>
            ) : (
              <>
                <Text style={styles.productName}>{choice.label}</Text>
                <TouchableOpacity onPress={() => setChoice(null)}>
                  <Text style={[styles.link, { color: brand.primary }]}>Trocar produto</Text>
                </TouchableOpacity>
                <TextInput mode="outlined" label="Quantas peças" value={qty} onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={styles.input} />
                <TextInput
                  mode="outlined"
                  label="Quanto você pagou em cada peça"
                  value={cost}
                  onChangeText={(t) => setCost(maskCurrencyBR(t))}
                  keyboardType="numeric"
                  left={<TextInput.Affix text="R$" />}
                  style={styles.input}
                />
                <TextInput
                  mode="outlined"
                  label="Preço de tabela (opcional)"
                  value={listPrice}
                  onChangeText={(t) => setListPrice(maskCurrencyBR(t))}
                  keyboardType="numeric"
                  left={<TextInput.Affix text="R$" />}
                  style={styles.input}
                />
                {list > paid && paid > 0 && (
                  <Text style={styles.note}>Desconto no item: {formatCurrency(list - paid)} por peça (já está no preço pago).</Text>
                )}
                <TouchableOpacity style={[styles.supplierRow, { borderColor: brand.primary + '50' }]} onPress={() => setPickSupplier(true)}>
                  <Ionicons name="business-outline" size={18} color={brand.primary} />
                  <Text style={styles.optionLabel}>
                    Fornecedor: {supplier?.name ?? entrySupplierName ?? 'o da entrada'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
                </TouchableOpacity>
              </>
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          {choice && (
            <View style={styles.buttons}>
              <TouchableOpacity style={styles.cancel} onPress={onClose}>
                <Text style={{ color: Colors.light.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.save, { backgroundColor: brand.primary }, add.isPending && { opacity: 0.6 }]}
                onPress={submit}
                disabled={add.isPending}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{add.isPending ? 'Lançando...' : 'Lançar na entrada'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <SupplierPickerSheet
        visible={pickSupplier}
        onClose={() => setPickSupplier(false)}
        onSelect={(s: Supplier | null) => {
          setSupplier(s);
          setPickSupplier(false);
        }}
        productId={choice?.productId}
        selectedSupplierId={supplier?.id}
        noneLabel={`Usar o fornecedor da entrada${entrySupplierName ? ` (${entrySupplierName})` : ''}`}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  input: { marginTop: 10, backgroundColor: Colors.light.card },
  productName: { fontSize: 14, fontWeight: '700', color: Colors.light.text, marginBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 },
  optionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.light.text },
  optionMeta: { fontSize: 12, color: Colors.light.textSecondary, marginRight: 10 },
  optionPrice: { fontSize: 14, fontWeight: '700' },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  link: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  note: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 8 },
  error: { color: Colors.light.error, marginTop: 10, fontSize: 13 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancel: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border },
  save: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
});
