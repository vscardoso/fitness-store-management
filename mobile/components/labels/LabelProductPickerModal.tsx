/**
 * LabelProductPickerModal
 * Seleção em massa de produtos/variantes para o Estúdio de Etiquetas.
 * O usuário marca todos que quer e confirma de uma vez.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Text, Searchbar, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { getGroupedProducts } from '@/services/productService';
import type { ProductGrouped, ProductVariant } from '@/types';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PickedItem {
  product: ProductGrouped;
  variant: ProductVariant;
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (items: PickedItem[]) => void;
  /** Chaves já adicionadas no estúdio, para marcar como já selecionadas */
  alreadyAdded?: Set<string>;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function LabelProductPickerModal({
  visible,
  onDismiss,
  onConfirm,
  alreadyAdded = new Set(),
}: Props) {
  const [search, setSearch]     = useState('');
  // key: `${productId}_${variantId}`
  const [selected, setSelected] = useState<Map<string, PickedItem>>(new Map());

  const { data: products, isLoading } = useQuery({
    queryKey: ['grouped-products-modal'],
    queryFn: () => getGroupedProducts({ limit: 500 }),
    enabled: visible,
  });

  // Resetar ao abrir
  useEffect(() => {
    if (visible) {
      setSearch('');
      setSelected(new Map());
    }
  }, [visible]);

  // Filtro de busca
  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p: ProductGrouped) =>
      p.name.toLowerCase().includes(q) ||
      (p.brand ?? '').toLowerCase().includes(q) ||
      p.variants.some(v => (v.sku ?? '').toLowerCase().includes(q))
    );
  }, [products, search]);

  // Toggle de uma variante
  const toggle = (product: ProductGrouped, variant: ProductVariant) => {
    const key = `${product.id}_${variant.id}`;
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { product, variant });
      }
      return next;
    });
  };

  // Toggle de um produto inteiro (todas as variantes)
  const toggleProduct = (product: ProductGrouped) => {
    const keys = product.variants.map(v => `${product.id}_${v.id}`);
    const allSelected = keys.every(k => selected.has(k));
    setSelected(prev => {
      const next = new Map(prev);
      if (allSelected) {
        keys.forEach(k => next.delete(k));
      } else {
        product.variants.forEach(v => next.set(`${product.id}_${v.id}`, { product, variant: v }));
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected.values()));
    onDismiss();
  };

  const totalSelected = selected.size;

  // ── Render item ────────────────────────────────────────────────────────────

  const renderProduct = ({ item: product }: { item: ProductGrouped }) => {
    const variantKeys   = product.variants.map(v => `${product.id}_${v.id}`);
    const allChecked    = variantKeys.length > 0 && variantKeys.every(k => selected.has(k));
    const someChecked   = variantKeys.some(k => selected.has(k));
    const singleVariant = product.variants.length === 1;

    return (
      <View style={styles.productCard}>
        {/* Cabeçalho do produto */}
        <TouchableOpacity
          style={styles.productRow}
          onPress={() => toggleProduct(product)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.checkbox,
            allChecked && styles.checkboxChecked,
            someChecked && !allChecked && styles.checkboxPartial,
          ]}>
            {allChecked && <Ionicons name="checkmark" size={13} color="#fff" />}
            {someChecked && !allChecked && <View style={styles.checkboxDash} />}
          </View>

          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
            <View style={styles.productMeta}>
              {product.brand && (
                <Text style={styles.productBrand}>{product.brand}</Text>
              )}
              <Text style={styles.productStock}>
                {product.total_stock} em estoque
              </Text>
            </View>
          </View>

          {singleVariant && (
            <Text style={styles.variantPrice}>
              {formatCurrency(Number(product.variants[0].price))}
            </Text>
          )}
        </TouchableOpacity>

        {/* Variantes (se mais de uma) */}
        {!singleVariant && (
          <View style={styles.variantsContainer}>
            {product.variants.map(variant => {
              const key     = `${product.id}_${variant.id}`;
              const checked = selected.has(key);
              const parts   = [variant.size, variant.color].filter(Boolean);
              const label   = parts.length > 0 ? parts.join(' / ') : variant.sku ?? '—';

              return (
                <TouchableOpacity
                  key={variant.id}
                  style={styles.variantRow}
                  onPress={() => toggle(product, variant)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, styles.checkboxSmall, checked && styles.checkboxChecked]}>
                    {checked && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </View>
                  <Text style={[styles.variantLabel, checked && styles.variantLabelChecked]} numberOfLines={1}>
                    {label}
                  </Text>
                  <Text style={styles.variantStock}>{variant.current_stock} un</Text>
                  <Text style={styles.variantPrice}>{formatCurrency(Number(variant.price))}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // ── Modal ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.light.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Selecionar Produtos</Text>
          {totalSelected > 0 && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>{totalSelected}</Text>
            </View>
          )}
          {totalSelected === 0 && <View style={styles.closeBtn} />}
        </View>

        {/* Busca */}
        <View style={styles.searchContainer}>
          <Searchbar
            placeholder="Buscar por nome, marca ou SKU…"
            value={search}
            onChangeText={setSearch}
            style={styles.searchbar}
            inputStyle={styles.searchInput}
          />
        </View>

        {/* Legenda rápida */}
        {totalSelected > 0 && (
          <View style={styles.selectionBar}>
            <Ionicons name="checkmark-circle" size={15} color={Colors.light.primary} />
            <Text style={styles.selectionBarText}>
              {totalSelected} variante{totalSelected !== 1 ? 's' : ''} selecionada{totalSelected !== 1 ? 's' : ''}
            </Text>
            <TouchableOpacity onPress={() => setSelected(new Map())}>
              <Text style={styles.clearText}>Limpar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lista */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.light.primary} />
            <Text style={styles.loadingText}>Carregando produtos…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => String(item.id)}
            renderItem={renderProduct}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="search-outline" size={40} color={Colors.light.textTertiary} />
                <Text style={styles.emptyText}>Nenhum produto encontrado</Text>
              </View>
            }
          />
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, totalSelected === 0 && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={totalSelected === 0}
            activeOpacity={0.8}
          >
            <Ionicons
              name="pricetags-outline"
              size={18}
              color={totalSelected === 0 ? Colors.light.textTertiary : '#fff'}
            />
            <Text style={[styles.confirmBtnText, totalSelected === 0 && styles.confirmBtnTextDisabled]}>
              {totalSelected === 0
                ? 'Selecione produtos acima'
                : `Adicionar ${totalSelected} item${totalSelected !== 1 ? 's' : ''} ao estúdio`}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', color: Colors.light.text },
  selectedBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.light.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedBadgeText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Search
  searchContainer: { padding: 12, backgroundColor: '#fff' },
  searchbar: { elevation: 0, backgroundColor: Colors.light.backgroundSecondary },
  searchInput: { fontSize: 14 },

  // Selection bar
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.light.primary + '10',
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.primary + '20',
  },
  selectionBarText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.light.primary },
  clearText: { fontSize: 13, fontWeight: '600', color: Colors.light.error },

  // List
  list: { padding: 12, gap: 8, paddingBottom: 100 },

  // Product card
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  productInfo: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  productMeta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  productBrand: { fontSize: 12, color: Colors.light.textSecondary },
  productStock: { fontSize: 12, color: Colors.light.textSecondary },

  // Checkbox
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.light.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: '#fff',
  },
  checkboxSmall: { width: 18, height: 18, borderRadius: 4 },
  checkboxChecked: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  checkboxPartial: { borderColor: Colors.light.primary },
  checkboxDash: {
    width: 10, height: 2, borderRadius: 1,
    backgroundColor: Colors.light.primary,
  },

  // Variants
  variantsContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundSecondary,
  },
  variantLabel: { flex: 1, fontSize: 14, color: Colors.light.textSecondary },
  variantLabelChecked: { color: Colors.light.text, fontWeight: '600' },
  variantStock: { fontSize: 12, color: Colors.light.textTertiary, minWidth: 36, textAlign: 'right' },
  variantPrice: { fontSize: 13, fontWeight: '600', color: Colors.light.primary, minWidth: 60, textAlign: 'right' },

  // States
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 14, color: Colors.light.textSecondary },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  confirmBtnDisabled: { backgroundColor: Colors.light.backgroundSecondary },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  confirmBtnTextDisabled: { color: Colors.light.textTertiary },
});
