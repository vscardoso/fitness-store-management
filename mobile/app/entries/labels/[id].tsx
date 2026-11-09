/** Etiquetas da entrada: uma por peça recebida, só das variações que vieram nesta compra (peça antiga do mesmo produto não sai). */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import StickerStudio, { type StickerItem } from '@/components/labels/StickerStudio';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors } from '@/constants/Colors';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { getStockEntryById } from '@/services/stockEntryService';
import { parseApiError } from '@/utils/apiError';

/** "Preto · M" ou "Preto / M" vira cor e tamanho para a prévia (o PDF vem do servidor com os dados reais). */
function splitLabel(label?: string | null): { color: string | null; size: string | null } {
  const parts = (label ?? '').split(/\s*[·/]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { color: null, size: null };
  if (parts.length === 1) return { color: parts[0], size: null };
  return { color: parts[0], size: parts[parts.length - 1] };
}

export default function EntryLabelsScreen() {
  const desktopColumn = useDesktopContentStyle();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const queryClient = useQueryClient();
  const { data: entry, isLoading, error } = useQuery({ queryKey: ['stock-entry', entryId], queryFn: () => getStockEntryById(entryId), enabled: !!entryId });

  // mesma conta do servidor: soma por variação o que foi RECEBIDO nesta entrada
  const { items, initialQty } = useMemo(() => {
    const byVariant = new Map<number, StickerItem>();
    const qty: Record<number, number> = {};
    for (const it of entry?.entry_items ?? []) {
      if (it.is_active === false || !it.variant_id) continue;
      const received = Number(it.quantity_received ?? 0);
      if (byVariant.has(it.variant_id)) {
        qty[it.variant_id] += received;
        continue;
      }
      const { color, size } = splitLabel(it.variant_label);
      byVariant.set(it.variant_id, {
        variantId: it.variant_id,
        productName: it.product_name ?? 'Produto',
        color, size,
        price: Number(it.product_price ?? 0),
        code: it.variant_code ?? null,
        stock: received,
      });
      qty[it.variant_id] = received;
    }
    const list = [...byVariant.values()].sort((a, b) => String(a.code ?? 'zzz').localeCompare(String(b.code ?? 'zzz'), 'pt-BR', { numeric: true }));
    return { items: list, initialQty: qty };
  }, [entry]);

  return (
    <View style={styles.container}>
      <PageHeader title="Etiquetas da entrada" subtitle={entry ? `${entry.entry_code} · ${Object.values(initialQty).reduce((n, q) => n + q, 0)} peças` : ''}
        showBackButton backFallback={`/entries/${entryId}`} />
      <View style={[{ flex: 1 }, desktopColumn]}>
        {isLoading || !entry ? (
          error ? <View style={styles.center}><Text style={styles.muted}>{parseApiError(error) || 'Não foi possível carregar a entrada.'}</Text></View> : <ScreenLoader message="Carregando a entrada..." />
        ) : (
          <StickerStudio
            items={items}
            initialQty={initialQty}
            emptyText="Esta entrada ainda não tem peça com cor e tamanho. Lance os produtos antes de imprimir."
            onGenerated={() => queryClient.invalidateQueries({ queryKey: ['stock-entry', entryId] })}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: Colors.light.textSecondary, textAlign: 'center' },
});
