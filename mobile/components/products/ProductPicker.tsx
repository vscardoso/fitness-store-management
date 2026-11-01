/**
 * Seletor único de produto já cadastrado (o "catálogo" da loja): usado na Nova entrada e na entrada existente.
 *
 * Busca no servidor por nome, marca, SKU ou código da etiqueta (#123, 123, #123-1, PV#123-1). Cada produto mostra o
 * código e o estoque; tocar abre a grade de cores e tamanhos com o código de cada peça (#123-1). "Nova cor ou tamanho"
 * cria a próxima variação do MESMO produto (mesmo #123). Peças que já estão na entrada aparecem marcadas.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import BottomSheet from '@/components/ui/BottomSheet';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, theme } from '@/constants/Colors';
import { getThumbUrl } from '@/constants/Config';
import { useBrandingColors } from '@/store/brandingStore';
import { getGroupedProducts } from '@/services/productService';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import type { Product, ProductGrouped, ProductVariant } from '@/types';

/** Produto da lista agrupada no formato `Product` que as telas de entrada já usam. */
export function groupedToProduct(g: ProductGrouped): Product {
  const first = g.variants?.[0];
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    category_id: g.category_id,
    brand: g.brand,
    image_url: g.image_url,
    price: first?.price ?? g.min_price ?? 0,
    cost_price: first?.cost_price ?? 0,
    sku: first?.sku,
    is_active: true,
    is_catalog: false,
    variants: g.variants,
    current_stock: g.total_stock,
  } as unknown as Product;
}

const productCode = (g: ProductGrouped): string | null => {
  const dc = g.variants?.find((v) => v.display_code)?.display_code;
  return dc ? dc.split('-')[0] : null;
};

const variantLabel = (v: ProductVariant) => [v.color, v.size].filter(Boolean).join(' · ') || 'Única';

interface ListProps {
  onPick: (product: ProductGrouped, variant?: ProductVariant) => void;
  /** Mostra "Nova cor ou tamanho" (cria a próxima variação do mesmo produto) */
  onNewVariant?: (product: ProductGrouped) => void;
  /** Variações que já estão nesta entrada (aparecem marcadas) */
  markedVariantIds?: number[];
  /** Só este produto, já aberto na grade (sem busca): quando a tela já sabe qual é o produto */
  fixedProduct?: ProductGrouped;
}

export function ProductPickerList({ onPick, onNewVariant, markedVariantIds = [], fixedProduct }: ListProps) {
  const brand = useBrandingColors();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState<number | null>(fixedProduct?.id ?? null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: found = [], isLoading: loadingList, isFetching, error, refetch } = useQuery({
    queryKey: ['product-picker', debounced],
    queryFn: () => getGroupedProducts({ search: debounced || undefined, limit: 60 }, { headers: { 'X-Skip-Loading': 'true' } }),
    staleTime: 30 * 1000,
    enabled: !fixedProduct,
  });
  const data = fixedProduct ? [fixedProduct] : found;
  const isLoading = fixedProduct ? false : loadingList;

  const tapProduct = (g: ProductGrouped) => {
    const variants = g.variants ?? [];
    if (variants.length === 0) return onPick(g, undefined);
    if (variants.length === 1 && !onNewVariant) return onPick(g, variants[0]);
    setOpen((cur) => (cur === g.id ? null : g.id));
  };

  return (
    <View>
      {!fixedProduct && <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Nome, código (#123) ou SKU"
          placeholderTextColor={Colors.light.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Buscar produto"
        />
        {isFetching && !isLoading ? <ActivityIndicator size="small" color={brand.primary} /> : null}
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Limpar busca">
            <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
          </TouchableOpacity>
        )}
      </View>}

      {isLoading ? (
        <ActivityIndicator size="small" color={brand.primary} style={{ marginVertical: 24 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{parseApiError(error) || 'Não foi possível carregar os produtos'}</Text>
          <TouchableOpacity onPress={() => refetch()}><Text style={[styles.link, { color: brand.primary }]}>Tentar novamente</Text></TouchableOpacity>
        </View>
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={36} color={Colors.light.textTertiary} />
          <Text style={styles.emptyTitle}>{debounced ? `Nada encontrado para "${debounced}"` : 'Nenhum produto cadastrado'}</Text>
          <Text style={styles.emptyHint}>Busque pelo nome, pelo código da etiqueta (#123) ou pelo SKU.</Text>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {!debounced && data.length >= 60 && (
            <Text style={styles.hint}>Mostrando os primeiros 60 em ordem alfabética. Busque para achar os outros.</Text>
          )}
          {data.map((g) => {
            const code = productCode(g);
            const expanded = open === g.id;
            const variants = g.variants ?? [];
            const marked = variants.filter((v) => markedVariantIds.includes(v.id)).length;
            return (
              <View key={g.id} style={[styles.card, expanded && { borderColor: brand.primary + '66' }]}>
                <TouchableOpacity style={styles.cardHead} onPress={() => tapProduct(g)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`Produto ${g.name}`}>
                  <View style={[styles.thumb, { backgroundColor: brand.primary + '14' }]}>
                    {g.image_url ? (
                      <Image source={{ uri: getThumbUrl(g.image_url, 48) }} style={styles.thumbImg} />
                    ) : (
                      <Ionicons name="shirt-outline" size={20} color={brand.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={2}>{g.name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[code, `${g.total_stock ?? 0} em estoque`, variants.length > 1 ? `${variants.length} variações` : null, marked ? `${marked} já nesta entrada` : null]
                        .filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : variants.length > 1 || onNewVariant ? 'chevron-down' : 'add-circle-outline'} size={20} color={brand.primary} />
                </TouchableOpacity>
                {expanded && (
                  <View style={styles.grid}>
                    {variants.map((v) => {
                      const isMarked = markedVariantIds.includes(v.id);
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.chip, isMarked && { borderColor: Colors.light.warning, backgroundColor: Colors.light.warningLight }]}
                          onPress={() => onPick(g, v)}
                          activeOpacity={0.75}
                          accessibilityRole="button"
                          accessibilityLabel={`Variação ${variantLabel(v)}`}
                        >
                          <Text style={styles.chipTitle} numberOfLines={1}>{variantLabel(v)}</Text>
                          <Text style={styles.chipMeta} numberOfLines={1}>
                            {[v.display_code, `${v.current_stock ?? 0} un`, formatCurrency(Number(v.price || 0))].filter(Boolean).join(' · ')}
                          </Text>
                          {isMarked && <Text style={[styles.chipMeta, { color: Colors.light.warning, fontWeight: '700' }]}>Já nesta entrada</Text>}
                        </TouchableOpacity>
                      );
                    })}
                    {onNewVariant && (
                      <TouchableOpacity
                        style={[styles.chip, styles.chipNew, { borderColor: brand.primary + '66' }]}
                        onPress={() => onNewVariant(g)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel="Nova cor ou tamanho"
                      >
                        <Ionicons name="add" size={16} color={brand.primary} />
                        <Text style={[styles.chipTitle, { color: brand.primary }]}>Nova cor ou tamanho</Text>
                        <Text style={styles.chipMeta}>Mesmo produto{code ? ` (${code})` : ''}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface SheetProps extends ListProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  subtitle?: string;
}

export default function ProductPickerSheet({ visible, onDismiss, title = 'Produto já cadastrado', subtitle, ...list }: SheetProps) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={title} subtitle={subtitle} icon="cube-outline">
      {visible ? <ProductPickerList {...list} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg, paddingHorizontal: theme.spacing.md, height: 44, marginBottom: theme.spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.light.text },
  hint: { fontSize: 12, color: Colors.light.textSecondary },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: Colors.light.text, textAlign: 'center' },
  emptyHint: { fontSize: 12, color: Colors.light.textSecondary, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '600' },
  card: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: theme.borderRadius.lg, backgroundColor: Colors.light.card, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.sm },
  thumb: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  meta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  chip: {
    minWidth: 120, flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.light.backgroundSecondary, gap: 2,
  },
  chipNew: { backgroundColor: Colors.light.card, borderStyle: 'dashed', alignItems: 'flex-start' },
  chipTitle: { fontSize: 13, fontWeight: '700', color: Colors.light.text },
  chipMeta: { fontSize: 11, color: Colors.light.textSecondary },
});

/** `Product` (com variações) no formato da lista agrupada, para abrir o seletor já no produto. */
export function productToGrouped(p: Product): ProductGrouped {
  const variants = ((p as any).variants ?? []).filter((v: ProductVariant) => v.is_active !== false) as ProductVariant[];
  return {
    id: p.id, name: p.name, description: p.description, category_id: p.category_id, brand: p.brand,
    image_url: p.image_url, is_digital: false, is_activewear: false, variants, variant_count: variants.length,
    total_stock: variants.reduce((n, v) => n + (v.current_stock ?? 0), 0),
    min_price: Math.min(...variants.map((v) => Number(v.price) || 0), Number(p.price) || 0),
    max_price: Math.max(...variants.map((v) => Number(v.price) || 0), Number(p.price) || 0),
  } as ProductGrouped;
}
