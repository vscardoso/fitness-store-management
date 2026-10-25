/**
 * Escolha da peça que o cliente leva no lugar (troca), no padrão BottomSheet do app.
 * A lista já abre carregada com as outras cores/tamanhos do mesmo produto; a busca por nome traz outros produtos.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import BottomSheet from '@/components/ui/BottomSheet';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, theme } from '@/constants/Colors';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setError('');
    setProducts([]);
    if (productId) {
      setLoading(true);
      getProductById(productId)
        .then((p) => setProducts([p]))
        .catch(() => setError('Não foi possível carregar as peças.'))
        .finally(() => setLoading(false));
    }
  }, [visible, productId]);

  useEffect(() => {
    if (!visible || query.trim().length < 2) return;
    const t = setTimeout(() => {
      setLoading(true);
      searchProducts(query.trim())
        .then((r) => setProducts(r))
        .catch(() => setError('Não foi possível buscar.'))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, visible]);

  const available = (p: Product) =>
    (p.variants || []).filter((v) => v.is_active !== false && v.id !== excludeVariantId && (v.current_stock ?? 0) > 0);
  const withStock = products.filter((p) => available(p).length > 0);

  return (
    <BottomSheet visible={visible} onDismiss={onClose} title="Qual peça o cliente leva?" subtitle="Só aparecem peças com estoque" icon="swap-horizontal-outline">
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
        <RNTextInput
          style={styles.searchInput}
          placeholder="Buscar outro produto pelo nome"
          placeholderTextColor={Colors.light.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <ActivityIndicator size="small" color={brand.primary} style={{ marginVertical: 24 }} />
      ) : withStock.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={40} color={Colors.light.textTertiary} />
          <Text style={styles.emptyText}>Sem peça disponível em estoque. Busque outro produto.</Text>
        </View>
      ) : (
        withStock.map((p) => (
          <View key={p.id} style={{ marginBottom: theme.spacing.sm }}>
            <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
            {available(p).map((v) => {
              const detail = [v.color, v.size].filter(Boolean).join(' / ') || 'Única';
              return (
                <TouchableOpacity
                  key={v.id}
                  style={styles.row}
                  activeOpacity={0.75}
                  onPress={() => onSelect({ variant_id: v.id, label: `${p.name} - ${detail}`, price: Number(v.price) })}
                >
                  <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
                    <Ionicons name="shirt-outline" size={18} color={brand.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{detail}</Text>
                    <Text style={styles.rowMeta}>{v.current_stock} em estoque</Text>
                  </View>
                  <Text style={[styles.rowPrice, { color: brand.primary }]}>{formatCurrency(Number(v.price))}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    height: 44,
    marginBottom: theme.spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.light.text },
  productName: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary, marginBottom: 4, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.card,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  rowMeta: { fontSize: 12, color: Colors.light.textSecondary },
  rowPrice: { fontSize: 14, fontWeight: '700' },
  error: { color: Colors.light.error, marginBottom: theme.spacing.sm },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center' },
});
