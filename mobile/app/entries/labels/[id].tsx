/**
 * Etiquetas da entrada: uma por peça recebida, só das variações que vieram nesta compra (peça antiga do mesmo produto não sai).
 * Mostra quantas já foram impressas e quantas faltam; "Colocar na fila de impressão" junta o que falta com as outras entradas.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import StickerStudio, { type StickerItem } from '@/components/labels/StickerStudio';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors } from '@/constants/Colors';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useBrandingColors } from '@/store/brandingStore';
import { addEntryToQueue, getEntryLabelProgress } from '@/services/labelQueueService';
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
  const brand = useBrandingColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const queryClient = useQueryClient();
  const { data: entry, isLoading, error } = useQuery({ queryKey: ['stock-entry', entryId], queryFn: () => getStockEntryById(entryId), enabled: !!entryId });
  const { data: progress } = useQuery({ queryKey: ['label-progress', entryId], queryFn: () => getEntryLabelProgress(entryId), enabled: !!entryId });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // soma por variação o que foi RECEBIDO nesta entrada; a quantidade já vem só com o que ainda falta imprimir
  const { items, initialQty } = useMemo(() => {
    const byVariant = new Map<number, StickerItem>();
    const received: Record<number, number> = {};
    for (const it of entry?.entry_items ?? []) {
      if (it.is_active === false || !it.variant_id) continue;
      const q = Number(it.quantity_received ?? 0);
      if (byVariant.has(it.variant_id)) {
        received[it.variant_id] += q;
        continue;
      }
      const { color, size } = splitLabel(it.variant_label);
      byVariant.set(it.variant_id, {
        variantId: it.variant_id,
        productName: it.product_name ?? 'Produto',
        color, size,
        price: Number(it.product_price ?? 0),
        code: it.variant_code ?? null,
        stock: q,
      });
      received[it.variant_id] = q;
    }
    const missing = new Map((progress?.lines ?? []).map((l) => [l.variant_id, l.missing]));
    const qty: Record<number, number> = {};
    for (const [vid, rec] of Object.entries(received)) qty[Number(vid)] = progress ? (missing.get(Number(vid)) ?? rec) : rec;
    const list = [...byVariant.values()].sort((a, b) => String(a.code ?? 'zzz').localeCompare(String(b.code ?? 'zzz'), 'pt-BR', { numeric: true }));
    return { items: list, initialQty: qty };
  }, [entry, progress]);

  const total = progress?.received ?? Object.values(initialQty).reduce((n, q) => n + q, 0);

  const addToQueue = async () => {
    if (adding) return;
    setAdding(true);
    setMsg(null);
    try {
      const r = await addEntryToQueue(entryId);
      await queryClient.invalidateQueries({ queryKey: ['label-queue'] });
      await queryClient.invalidateQueries({ queryKey: ['label-progress', entryId] });
      if (r.added === 0) setMsg('Nada a pôr na fila: tudo desta entrada já foi impresso ou já está na fila.');
      else router.push('/etiquetas/fila' as any);
    } catch (e: any) {
      setMsg(parseApiError(e) || 'Não foi possível pôr na fila.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Etiquetas da entrada" subtitle={entry ? `${entry.entry_code} · ${total} peças` : ''}
        showBackButton backFallback={`/entries/${entryId}`} />
      <View style={[{ flex: 1 }, desktopColumn]}>
        {isLoading || !entry ? (
          error ? <View style={styles.center}><Text style={styles.muted}>{parseApiError(error) || 'Não foi possível carregar a entrada.'}</Text></View> : <ScreenLoader message="Carregando a entrada..." />
        ) : (
          <>
            {progress ? (
              <View style={styles.progress}>
                <Text style={styles.progressText}>
                  {progress.printed} de {progress.received} impressas
                  {progress.queued > 0 ? ` · ${progress.queued} na fila` : ''}
                  {progress.missing > 0 ? ` · faltam ${progress.missing}` : ' · tudo certo'}
                </Text>
                <View style={styles.progressRow}>
                  {progress.missing > 0 ? (
                    <TouchableOpacity style={[styles.btn, { backgroundColor: brand.primary }]} onPress={addToQueue} disabled={adding} accessibilityRole="button">
                      <Text style={styles.btnTextOn}>{adding ? 'Colocando...' : 'Colocar na fila de impressão'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {progress.queued > 0 ? (
                    <TouchableOpacity style={[styles.btn, { borderColor: brand.primary, borderWidth: 1 }]} onPress={() => router.push('/etiquetas/fila' as any)} accessibilityRole="button">
                      <Text style={[styles.btnText, { color: brand.primary }]}>Abrir a fila</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {msg ? <Text style={styles.muted}>{msg}</Text> : null}
              </View>
            ) : null}
            <StickerStudio
              items={items}
              initialQty={initialQty}
              entryId={entryId}
              emptyText="Esta entrada ainda não tem peça com cor e tamanho. Lance os produtos antes de imprimir."
              onGenerated={() => queryClient.invalidateQueries({ queryKey: ['stock-entry', entryId] })}
              onPrinted={() => queryClient.invalidateQueries({ queryKey: ['label-progress', entryId] })}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: Colors.light.textSecondary, textAlign: 'center', fontSize: 12 },
  progress: { gap: 8, padding: 12, marginHorizontal: 12, marginTop: 8, borderRadius: 12, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.border },
  progressText: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  progressRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  btnTextOn: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnText: { fontWeight: '700', fontSize: 13 },
});
