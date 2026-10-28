/** Estúdio de etiquetas em lote: escolhe peças de vários produtos e gera o adesivo do verso da tag. */
import React, { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { View, StyleSheet } from 'react-native';

import PageHeader from '@/components/layout/PageHeader';
import StickerStudio, { type StickerItem } from '@/components/labels/StickerStudio';
import LabelProductPickerModal, { type PickedItem } from '@/components/labels/LabelProductPickerModal';
import useBackToList from '@/hooks/useBackToList';
import { Colors } from '@/constants/Colors';
import { variantCodeText } from '@/utils/shortCode';
import { getProductVariants } from '@/services/productVariantService';

export default function LabelStudioScreen() {
  const { goBack } = useBackToList('/(tabs)/products');
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [open, setOpen] = useState(false);

  // a lista do seletor não traz o código da etiqueta (#101-1): busca as variações completas de cada produto escolhido
  const productIds = useMemo(() => [...new Set(picked.map((p) => p.product.id))], [picked]);
  const fullVariants = useQueries({
    queries: productIds.map((id) => ({ queryKey: ['product-variants', String(id)], queryFn: () => getProductVariants(id) })),
  });
  const codeOf = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const q of fullVariants) for (const v of q.data ?? []) map.set(v.id, variantCodeText(v));
    return map;
  }, [fullVariants]);

  const items: StickerItem[] = useMemo(
    () =>
      picked.map(({ product, variant }) => ({
        variantId: variant.id,
        productName: product.name,
        color: variant.color,
        size: variant.size,
        price: Number(variant.price),
        code: codeOf.get(variant.id) ?? variantCodeText(variant),
        stock: variant.current_stock ?? 0,
      })),
    [picked, codeOf],
  );

  // o seletor devolve a seleção completa: o que saiu dela sai da lista, o que já estava mantém a ordem
  const onConfirm = (all: PickedItem[], ids: number[]) =>
    setPicked((prev) => {
      const byId = new Map<number, PickedItem>([...prev, ...all].map((p) => [p.variant.id, p]));
      return ids.map((id) => byId.get(id)).filter((p): p is PickedItem => !!p);
    });

  return (
    <View style={styles.container}>
      <PageHeader title="Estúdio de etiquetas" subtitle="Escolha as peças e as quantidades" showBackButton onBack={goBack} />
      <StickerStudio
        items={items}
        onAddMore={() => setOpen(true)}
        onRemove={(vid) => setPicked((prev) => prev.filter((p) => p.variant.id !== vid))}
      />
      <LabelProductPickerModal
        visible={open}
        onDismiss={() => setOpen(false)}
        onConfirm={(all, ids) => { onConfirm(all, ids); setOpen(false); }}
        alreadyAdded={new Set(picked.map((p) => `${p.product.id}_${p.variant.id}`))}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.light.background } });
