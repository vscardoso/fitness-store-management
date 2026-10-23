/**
 * Escolha da peça que o cliente leva no lugar (troca).
 * Começa pelas outras cores/tamanhos do mesmo produto; dá para buscar outro produto pelo nome.
 */
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getProductById, searchProducts } from '@/services/productService';
import { formatCurrency } from '@/utils/format';
import type { Product } from '@/types';

export interface ReplacementChoice {
  variant_id: number;
  label: string;
  price: number;
}

interface Props {
  visible: boolean;
  /** Produto da peça devolvida: as variações dele aparecem primeiro. */
  productId?: number;
  /** Variação devolvida (não pode ser escolhida de volta). */
  excludeVariantId?: number | null;
  onSelect: (choice: ReplacementChoice) => void;
  onClose: () => void;
}

export default function ReplacementPicker({ visible, productId, excludeVariantId, onSelect, onClose }: Props) {
  const brand = useBrandingColors();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setError('');
    setProducts([]);
    if (productId) {
      getProductById(productId)
        .then((p) => setProducts([p]))
        .catch(() => setError('Não foi possível carregar as peças.'));
    }
  }, [visible, productId]);

  useEffect(() => {
    if (!visible || query.trim().length < 2) return;
    const t = setTimeout(() => {
      searchProducts(query.trim())
        .then((r) => setProducts(r))
        .catch(() => setError('Não foi possível buscar.'));
    }, 300);
    return () => clearTimeout(t);
  }, [query, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Qual peça o cliente leva?</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.light.text} />
            </TouchableOpacity>
          </View>
          <TextInput
            mode="outlined"
            label="Buscar outro produto"
            value={query}
            onChangeText={setQuery}
            style={{ marginBottom: 8, backgroundColor: Colors.light.card }}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <ScrollView keyboardShouldPersistTaps="handled">
            {products.map((p) => {
              const variants = (p.variants || []).filter(
                (v) => v.is_active !== false && v.id !== excludeVariantId && (v.current_stock ?? 0) > 0,
              );
              if (variants.length === 0) return null;
              return (
                <View key={p.id} style={{ marginBottom: 10 }}>
                  <Text style={styles.productName}>{p.name}</Text>
                  {variants.map((v) => {
                    const label = [p.name, [v.color, v.size].filter(Boolean).join(' / ')].filter(Boolean).join(' - ');
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[styles.option, { borderColor: brand.primary + '40' }]}
                        onPress={() => onSelect({ variant_id: v.id, label, price: Number(v.price) })}
                      >
                        <Text style={styles.optionLabel}>{[v.color, v.size].filter(Boolean).join(' / ') || 'Única'}</Text>
                        <Text style={styles.optionMeta}>{v.current_stock} em estoque</Text>
                        <Text style={[styles.optionPrice, { color: brand.primary }]}>{formatCurrency(Number(v.price))}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
            {products.length > 0 && products.every((p) => !(p.variants || []).some((v) => v.id !== excludeVariantId && (v.current_stock ?? 0) > 0)) && (
              <Text style={styles.empty}>Sem peça disponível em estoque. Busque outro produto.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  productName: { fontSize: 14, fontWeight: '700', color: Colors.light.text, marginBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 },
  optionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.light.text },
  optionMeta: { fontSize: 12, color: Colors.light.textSecondary, marginRight: 10 },
  optionPrice: { fontSize: 14, fontWeight: '700' },
  error: { color: Colors.light.error, marginBottom: 6 },
  empty: { color: Colors.light.textSecondary, textAlign: 'center', padding: 12 },
});
