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
import { useBrandingColors } from '@/store/brandingStore';
import AppButton from '@/components/ui/AppButton';
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
  onConfirm: (items: PickedItem[], selectedVariantIds: number[]) => void;
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
  const brandingColors = useBrandingColors();
  const [search, setSearch]     = useState('');
  const [showOnlyNotAdded, setShowOnlyNotAdded] = useState(false);
  // key: `${productId}_${variantId}`
  const [selected, setSelected] = useState<Map<string, PickedItem>>(new Map());
  const [hydratedSelection, setHydratedSelection] = useState(false);

  const getVariantKey = (productId: number, variantId: number) => `${productId}_${variantId}`;

  const isAlreadyAddedVariant = (productId: number, variantId: number) => {
    return alreadyAdded.has(getVariantKey(productId, variantId)) || alreadyAdded.has(`v_${variantId}`);
  };

  const { data: products, isLoading } = useQuery({
    queryKey: ['grouped-products-modal'],
    queryFn: () => getGroupedProducts({ limit: 500 }),
    enabled: visible,
  });

  // Resetar ao abrir
  useEffect(() => {
    if (visible) {
      setSearch('');
      setShowOnlyNotAdded(false);
      setSelected(new Map());
      setHydratedSelection(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !products || hydratedSelection) return;

    const initialSelection = new Map<string, PickedItem>();

    products.forEach((product: ProductGrouped) => {
      product.variants.forEach((variant) => {
        const key = getVariantKey(product.id, variant.id);
        if (alreadyAdded.has(key) || alreadyAdded.has(`v_${variant.id}`)) {
          initialSelection.set(key, { product, variant });
        }
      });
    });

    setSelected(initialSelection);
    setHydratedSelection(true);
  }, [visible, products, hydratedSelection, alreadyAdded]);

  // Filtro de busca
  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    return products
      .map((product: ProductGrouped) => {
        const hasSearchMatch =
          !q ||
          product.name.toLowerCase().includes(q) ||
          (product.brand ?? '').toLowerCase().includes(q) ||
          product.variants.some((variant) => (variant.sku ?? '').toLowerCase().includes(q));

        if (!hasSearchMatch) return null;

        if (!showOnlyNotAdded) {
          return product;
        }

        const hasAnyNotAddedVariant = product.variants.some(
          (variant) => !isAlreadyAddedVariant(product.id, variant.id)
        );

        return hasAnyNotAddedVariant ? product : null;
      })
      .filter((product): product is ProductGrouped => Boolean(product));
  }, [products, search, showOnlyNotAdded]);

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

    if (keys.length === 0) return;

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
    const values = Array.from(selected.values());
    const selectedVariantIds = values.map((item) => item.variant.id);
    onConfirm(values, selectedVariantIds);
    onDismiss();
  };

  const totalSelected = selected.size;
  const totalAlreadyAdded = useMemo(() => {
    if (!products) return 0;

    return products.reduce((acc: number, product: ProductGrouped) => {
      const count = product.variants.filter((variant) => isAlreadyAddedVariant(product.id, variant.id)).length;
      return acc + count;
    }, 0);
  }, [products, alreadyAdded]);

  // ── Render item ────────────────────────────────────────────────────────────

  const renderProduct = ({ item: product }: { item: ProductGrouped }) => {
    const variantStates = product.variants.map((variant) => {
      const key = `${product.id}_${variant.id}`;
      const already = isAlreadyAddedVariant(product.id, variant.id);
      const picked = selected.has(key);
      return {
        key,
        variant,
        already,
        picked,
      };
    });

    const allChecked    = variantStates.length > 0 && variantStates.every((state) => state.picked);
    const someChecked   = variantStates.some((state) => state.picked);
    const hasAlreadyAdded = variantStates.some((state) => state.already);
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
            allChecked && { backgroundColor: brandingColors.primary, borderColor: brandingColors.primary },
            someChecked && !allChecked && { borderColor: brandingColors.primary },
          ]}>
            {allChecked && <Ionicons name="checkmark" size={13} color="#fff" />}
            {someChecked && !allChecked && <View style={[styles.checkboxDash, { backgroundColor: brandingColors.primary }]} />}
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
            <View style={styles.singleVariantRight}>
              {hasAlreadyAdded && (
                <View style={styles.alreadyBadge}>
                  <Text style={styles.alreadyBadgeText}>Ja no estudio</Text>
                </View>
              )}
              <Text style={[styles.variantPrice, { color: brandingColors.primary }]}> 
                {formatCurrency(Number(product.variants[0].price))}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Variantes (se mais de uma) */}
        {!singleVariant && (
          <View style={styles.variantsContainer}>
            {product.variants.map(variant => {
              const key     = `${product.id}_${variant.id}`;
              const already = isAlreadyAddedVariant(product.id, variant.id);
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
                  <View style={[
                    styles.checkbox,
                    styles.checkboxSmall,
                    checked && {
                      backgroundColor: brandingColors.primary,
                      borderColor: brandingColors.primary,
                    },
                  ]}>
                    {checked && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </View>
                  <Text style={[styles.variantLabel, checked && styles.variantLabelChecked]} numberOfLines={1}>
                    {label}
                  </Text>
                  {already && !checked && <Text style={styles.alreadyInlineText}>Ja</Text>}
                  <Text style={styles.variantStock}>{variant.current_stock} un</Text>
                  <Text style={[styles.variantPrice, { color: brandingColors.primary }]}>{formatCurrency(Number(variant.price))}</Text>
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
          <AppButton variant="ghost" size="sm" icon="close" iconOnly onPress={onDismiss} />
          <Text style={styles.headerTitle}>Selecionar Produtos</Text>
          {totalSelected > 0 && (
            <View style={[styles.selectedBadge, { backgroundColor: brandingColors.primary }]}>
              <Text style={styles.selectedBadgeText}>{totalSelected}</Text>
            </View>
          )}
          {totalSelected === 0 && <View style={{ width: 36 }} />}
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

          <TouchableOpacity
            style={[
              styles.quickFilterChip,
              showOnlyNotAdded && {
                borderColor: brandingColors.primary,
                backgroundColor: brandingColors.primary + '14',
              },
            ]}
            onPress={() => setShowOnlyNotAdded((prev) => !prev)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={showOnlyNotAdded ? 'funnel' : 'funnel-outline'}
              size={13}
              color={showOnlyNotAdded ? brandingColors.primary : Colors.light.textSecondary}
            />
            <Text
              style={[
                styles.quickFilterChipText,
                showOnlyNotAdded && { color: brandingColors.primary },
              ]}
            >
              Mostrar só não selecionadas
            </Text>
          </TouchableOpacity>
        </View>

        {/* Legenda rápida */}
        {(totalSelected > 0 || totalAlreadyAdded > 0) && (
          <View style={[styles.selectionBar, { backgroundColor: brandingColors.primary + '10', borderBottomColor: brandingColors.primary + '20' }]}>
            <Ionicons name="checkmark-circle" size={15} color={brandingColors.primary} />
            <Text style={[styles.selectionBarText, { color: brandingColors.primary }]}>
              {totalSelected} selecionada{totalSelected !== 1 ? 's' : ''} · {totalAlreadyAdded} ja no estudio
            </Text>
            <AppButton variant="text" size="sm" label="Limpar" textColor={Colors.light.error} onPress={() => setSelected(new Map())} />
          </View>
        )}

        {/* Lista */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={brandingColors.primary} />
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
          <AppButton
            variant="primary"
            size="lg"
            fullWidth
            icon="pricetags-outline"
            label={totalSelected === 0
              ? 'Selecione produtos acima'
              : `Aplicar seleção (${totalSelected})`}
            onPress={handleConfirm}
            disabled={totalSelected === 0}
          />
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
    backgroundColor: Colors.light.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', color: Colors.light.text },
  selectedBadge: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedBadgeText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Search
  searchContainer: { padding: 12, backgroundColor: Colors.light.card, gap: 8 },
  searchbar: { elevation: 0, backgroundColor: Colors.light.backgroundSecondary },
  searchInput: { fontSize: 14 },
  quickFilterChip: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Selection bar
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  selectionBarText: { flex: 1, fontSize: 13, fontWeight: '600' },
  clearText: { fontSize: 13, fontWeight: '600', color: Colors.light.error },

  // List
  list: { padding: 12, gap: 8, paddingBottom: 100 },

  // Product card
  productCard: {
    backgroundColor: Colors.light.card,
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
  singleVariantRight: { alignItems: 'flex-end', gap: 4 },
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
    backgroundColor: Colors.light.card,
  },
  checkboxSmall: { width: 18, height: 18, borderRadius: 4 },
  checkboxChecked: {},
  checkboxPartial: {},
  checkboxDash: {
    width: 10, height: 2, borderRadius: 1,
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
  alreadyInlineText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.light.success,
    minWidth: 20,
    textAlign: 'center',
  },
  variantStock: { fontSize: 12, color: Colors.light.textTertiary, minWidth: 36, textAlign: 'right' },
  variantPrice: { fontSize: 13, fontWeight: '600', minWidth: 60, textAlign: 'right' },
  alreadyBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.light.success + '18',
    borderWidth: 1,
    borderColor: Colors.light.success + '35',
  },
  alreadyBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.light.success,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // States
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 14, color: Colors.light.textSecondary },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16,
    backgroundColor: Colors.light.card,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
});
