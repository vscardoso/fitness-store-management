/**
 * Fila de impressão de etiquetas: tudo que a loja quer etiquetar e ainda não imprimiu (de várias entradas juntas, aproveitando a mesma folha).
 * Gerar o PDF não tira nada da fila: só "Imprimi, tirar da fila" tira e anda a folha.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import StickerStudio, { type StickerItem } from '@/components/labels/StickerStudio';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors } from '@/constants/Colors';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useBrandingColors } from '@/store/brandingStore';
import { getLabelQueue } from '@/services/labelQueueService';
import { parseApiError } from '@/utils/apiError';

export default function LabelQueueScreen() {
  const desktopColumn = useDesktopContentStyle();
  const brand = useBrandingColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['label-queue'], queryFn: getLabelQueue });

  // uma linha por variação (a fila guarda uma por variação e entrada)
  const { items, initialQty } = useMemo(() => {
    const byVariant = new Map<number, StickerItem>();
    const qty: Record<number, number> = {};
    for (const r of data?.items ?? []) {
      if (!byVariant.has(r.variant_id)) {
        byVariant.set(r.variant_id, {
          variantId: r.variant_id, productName: r.product_name, color: r.color, size: r.size,
          price: r.price, code: r.code, stock: r.quantity,
        });
        qty[r.variant_id] = 0;
      }
      qty[r.variant_id] += r.quantity;
    }
    return { items: [...byVariant.values()].sort((a, b) => String(a.code ?? 'zzz').localeCompare(String(b.code ?? 'zzz'), 'pt-BR', { numeric: true })), initialQty: qty };
  }, [data]);

  return (
    <View style={styles.container}>
      <PageHeader title="Fila de impressão" subtitle={data ? `${data.total} etiqueta${data.total !== 1 ? 's' : ''} na fila` : ''}
        showBackButton backFallback="/(tabs)/more" />
      <View style={[{ flex: 1 }, desktopColumn]}>
        {isLoading ? (
          <ScreenLoader message="Carregando a fila..." />
        ) : error ? (
          <View style={styles.center}><Text style={styles.muted}>{parseApiError(error) || 'Não foi possível carregar a fila.'}</Text></View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.title}>A fila está vazia</Text>
            <Text style={styles.muted}>Abra uma entrada e toque em “Colocar na fila de impressão”. As peças de várias entradas juntam aqui e aproveitam a mesma folha.</Text>
            <TouchableOpacity style={[styles.btn, { borderColor: brand.primary }]} onPress={() => router.push('/entries' as any)} accessibilityRole="button">
              <Text style={[styles.btnText, { color: brand.primary }]}>Ver entradas</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <StickerStudio
            items={items}
            initialQty={initialQty}
            fromQueue
            emptyText="A fila está vazia."
            onPrinted={() => queryClient.invalidateQueries({ queryKey: ['label-queue'] })}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.light.text },
  muted: { color: Colors.light.textSecondary, textAlign: 'center' },
  btn: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  btnText: { fontWeight: '700' },
});
