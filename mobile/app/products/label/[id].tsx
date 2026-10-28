/** Etiquetas de um produto: adesivo do verso da tag (PDF para a gráfica ou folha A4). Ver components/labels/StickerStudio. */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import StickerStudio, { type StickerItem } from '@/components/labels/StickerStudio';
import useBackToList from '@/hooks/useBackToList';
import { Colors } from '@/constants/Colors';
import { getProductById } from '@/services/productService';
import { getProductVariants } from '@/services/productVariantService';
import { variantCodeText } from '@/utils/shortCode';

export default function ProductLabelScreen() {
  const { id, variantId } = useLocalSearchParams<{ id: string; variantId?: string }>();
  const { goBack } = useBackToList('/(tabs)/products');
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery({ queryKey: ['product', id], queryFn: () => getProductById(Number(id)), enabled: !!id });
  const { data: variants } = useQuery({ queryKey: ['product-variants', id], queryFn: () => getProductVariants(Number(id)), enabled: !!id });

  const items: StickerItem[] = useMemo(() => {
    if (!product) return [];
    const BIG = Number.MAX_SAFE_INTEGER; // ordem da grade = ordem do código (#101-1, #101-2...); sem código vai pro fim
    return [...(variants ?? [])]
      .sort((a, b) => (a.variant_number ?? BIG) - (b.variant_number ?? BIG) || (a.short_code ?? BIG) - (b.short_code ?? BIG))
      .map((v) => ({
        variantId: v.id,
        productName: product.name,
        color: v.color,
        size: v.size,
        price: Number(v.price),
        code: variantCodeText(v),
        stock: v.current_stock ?? 0,
      }));
  }, [product, variants]);

  // vindo de uma peça específica: só ela começa com 1; as outras ficam em 0
  const initialQty = useMemo(() => {
    const only = variantId && !Number.isNaN(Number(variantId)) ? Number(variantId) : null;
    if (only == null || !items.some((i) => i.variantId === only)) return undefined;
    return Object.fromEntries(items.map((i) => [i.variantId, i.variantId === only ? 1 : 0]));
  }, [items, variantId]);

  return (
    <View style={styles.container}>
      <PageHeader title="Etiquetas" subtitle={product?.name ?? ''} showBackButton onBack={goBack} />
      {isLoading || !product ? (
        <View style={styles.center}><Text style={styles.muted}>Carregando...</Text></View>
      ) : (
        <StickerStudio
          items={items}
          initialQty={initialQty}
          emptyText="Este produto ainda não tem peça cadastrada. Dê entrada no estoque antes de imprimir."
          onGenerated={() => queryClient.invalidateQueries({ queryKey: ['product-variants', id] })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: Colors.light.textSecondary },
});
