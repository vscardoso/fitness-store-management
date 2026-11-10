/**
 * Etiquetas da entrada: uma por peça recebida, só das variações que vieram nesta compra (peça antiga do mesmo produto não sai).
 * Mostra quantas já foram impressas e quantas faltam. O que vai para a fila ou para o PDF é SÓ o que está marcado na lista abaixo
 * (antes um botão levava a entrada inteira e ignorava o que a pessoa tinha desmarcado).
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import StickerStudio, { type StickerItem } from '@/components/labels/StickerStudio';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors, theme } from '@/constants/Colors';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useBrandingColors } from '@/store/brandingStore';
import { getEntryLabelProgress } from '@/services/labelQueueService';
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
  const { data: progress, isLoading: progressLoading } = useQuery({ queryKey: ['label-progress', entryId], queryFn: () => getEntryLabelProgress(entryId), enabled: !!entryId });
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

  return (
    <View style={styles.container}>
      <PageHeader title="Etiquetas da entrada" subtitle={entry ? `${entry.entry_code} · ${total} peças` : ''}
        showBackButton backFallback={`/entries/${entryId}`} />
      <View style={[{ flex: 1 }, desktopColumn]}>
        {/* Só monta a lista depois de saber o que já foi impresso: antes ela abria com TODAS as peças e imprimia de novo as que já tinham saído */}
        {isLoading || !entry || progressLoading ? (
          error ? <View style={styles.center}><Text style={styles.muted}>{parseApiError(error) || 'Não foi possível carregar a entrada.'}</Text></View> : <ScreenLoader message="Carregando a entrada..." />
        ) : (
          <>
            {progress ? (
              <View style={styles.progress}>
                <Text style={styles.progressTitle}>Etiquetas desta entrada</Text>
                <View style={styles.track} accessibilityLabel={`${progress.printed} de ${progress.received} impressas`}>
                  <View style={[styles.fill, { backgroundColor: brand.primary, width: `${progress.received > 0 ? Math.min(100, Math.round((progress.printed / progress.received) * 100)) : 0}%` }]} />
                </View>
                <View style={styles.stats}>
                  <View style={styles.stat}><Text style={styles.statNum}>{progress.printed}</Text><Text style={styles.statLabel}>impressas</Text></View>
                  <View style={styles.stat}><Text style={styles.statNum}>{progress.queued}</Text><Text style={styles.statLabel}>na fila</Text></View>
                  <View style={styles.stat}><Text style={styles.statNum}>{progress.missing}</Text><Text style={styles.statLabel}>faltam</Text></View>
                </View>
                <Text style={styles.progressHint}>
                  {progress.printed >= progress.received
                    ? 'Todas as etiquetas desta entrada foram impressas.'
                    : progress.missing === 0
                      ? 'Tudo já está na fila de impressão. Falta imprimir.'
                      : `Faltam ${progress.missing}. Escolha abaixo as peças e quantidades: só o que estiver marcado sai ou vai para a fila.`}
                </Text>
                {(progress.reprinted ?? 0) > 0 ? (
                  <Text style={styles.progressHint}>{progress.reprinted} etiqueta{progress.reprinted !== 1 ? 's' : ''} foram impressas mais de uma vez (reimpressão).</Text>
                ) : null}
                {progress.queued > 0 ? (
                  <TouchableOpacity style={[styles.btn, { borderColor: brand.primary, borderWidth: 1.5 }]} onPress={() => router.push('/etiquetas/fila' as any)} accessibilityRole="button">
                    <Text style={[styles.btnText, { color: brand.primary }]}>Abrir a fila ({progress.queued})</Text>
                  </TouchableOpacity>
                ) : null}
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
  okMsg: { color: Colors.light.success, fontWeight: '700', fontSize: 13 },
  progress: { gap: theme.spacing.sm, padding: theme.spacing.md, marginHorizontal: theme.spacing.md, marginTop: theme.spacing.md, borderRadius: 16, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.border },
  progressTitle: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.light.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stats: { flexDirection: 'row', gap: theme.spacing.sm },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.light.backgroundSecondary },
  statNum: { fontSize: 20, fontWeight: '800', color: Colors.light.text },
  statLabel: { fontSize: 11, color: Colors.light.textSecondary },
  progressHint: { fontSize: 12, color: Colors.light.textSecondary },
  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', alignSelf: 'stretch' },
  btnTextOn: { color: Colors.light.white, fontWeight: '800', fontSize: 14 },
  btnText: { fontWeight: '700', fontSize: 14 },
});
