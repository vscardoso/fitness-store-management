/**
 * Últimos PDFs gerados (24 horas): abre de novo o arquivo para imprimir, sem salvar nada outra vez.
 * O servidor refaz o PDF com as mesmas peças, quantidades, papel e posição na folha; depois de 24 horas some da lista.
 * No iPhone o compartilhar só abre a partir de um toque: se o aparelho recusar logo depois de baixar, a linha passa a mostrar
 * "Toque para imprimir" com o PDF já pronto.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { fetchRecentPrintPdf, type PrintedPdf } from '@/services/labelService';
import { getRecentPrints, type RecentPrint } from '@/services/labelQueueService';
import { parseApiDate } from '@/utils/format';

const PAPER = { sheet: 'folha 10 × 15', a4: 'folha A4', roll: 'uma por página' } as const;

function when(iso: string): string {
  const d = parseApiDate(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return mesmoDia ? `Hoje ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

export default function RecentPrints() {
  const { data } = useQuery({ queryKey: ['label-recent-prints'], queryFn: getRecentPrints, refetchInterval: 60_000 });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [ready, setReady] = useState<Record<number, PrintedPdf>>({});
  const [error, setError] = useState<string | null>(null);

  if (!data || data.length === 0) return null;

  const open = async (job: RecentPrint) => {
    if (busyId != null) return;
    setBusyId(job.id);
    setError(null);
    try {
      const pdf = ready[job.id] ?? (await fetchRecentPrintPdf(job.id, `etiquetas-${job.width_mm}x${job.height_mm}-${job.total}un.pdf`));
      const r = await pdf.deliver().catch(() => 'blocked' as const);
      if (r === 'blocked') setReady((p) => ({ ...p, [job.id]: pdf }));
      else setReady((p) => { const n = { ...p }; delete n[job.id]; return n; });
    } catch (e: any) {
      setError(e?.message || 'Não foi possível abrir o PDF.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Últimos PDFs gerados</Text>
      <Text style={styles.hint}>Ficam por 24 horas. Abrir de novo não marca nada como impresso outra vez.</Text>
      {data.map((job) => (
        <View key={job.id} style={styles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.main}>{when(job.at)} · {job.total} etiqueta{job.total !== 1 ? 's' : ''}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {PAPER[job.layout]}{job.layout === 'roll' ? '' : `, começa na posição ${job.start_position}`}{job.by ? ` · ${job.by}` : ''}
            </Text>
          </View>
          <AppButton
            label={ready[job.id] ? 'Toque para imprimir' : 'Abrir'}
            icon="print-outline"
            variant={ready[job.id] ? 'primary' : 'outlined'}
            size="sm"
            loading={busyId === job.id}
            disabled={busyId != null}
            onPress={() => open(job)}
          />
        </View>
      ))}
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.borderRadius.xl, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.border },
  title: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  hint: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: Colors.light.border },
  main: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  sub: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  error: { color: Colors.light.errorDark, fontSize: theme.fontSize.sm },
});
