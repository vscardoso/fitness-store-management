/**
 * Últimos PDFs gerados (só os 3 últimos; os mais antigos somem sozinhos): abre de novo o arquivo para imprimir, sem salvar nada outra vez.
 * O servidor refaz o PDF com as mesmas peças, quantidades, papel e posição na folha, num link https assinado; e só os 3 últimos ficam na lista.
 * "Abrir" mostra o PDF numa aba (dali o compartilhar do visualizador manda o arquivo certo à impressora). O ícone de compartilhar
 * manda o arquivo direto; no iPhone isso só abre a partir de um toque: se o aparelho recusar logo depois de baixar, a linha mostra
 * "Toque para compartilhar" com o PDF já pronto.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { pdfFromUrl, type PdfMode, type PrintedPdf } from '@/services/labelService';
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
  const pdfs = useRef<Record<number, PrintedPdf>>({});   // guarda o arquivo baixado: o 2º toque em compartilhar não espera
  const [blocked, setBlocked] = useState<Record<number, boolean>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data || data.length === 0) return null;

  // Abrir não espera nada antes de abrir (o link já veio na lista): o toque ainda vale para o navegador abrir o PDF
  const open = async (job: RecentPrint, mode: PdfMode) => {
    if (busyId != null) return;
    setError(null);
    const pdf = (pdfs.current[job.id] ??= pdfFromUrl(job.url, job.filename));
    if (mode === 'open') {
      try { await pdf.deliver('open'); } catch (e: any) { setError(e?.message || 'Não foi possível abrir o PDF.'); }
      return;
    }
    setBusyId(job.id);
    try {
      const r = await pdf.deliver('share').catch(() => 'blocked' as const);
      setBlocked((p) => ({ ...p, [job.id]: r === 'blocked' }));
    } catch (e: any) {
      setError(e?.message || 'Não foi possível compartilhar o PDF.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Últimos PDFs gerados</Text>
      <Text style={styles.hint}>Ficam só os 3 últimos. Abrir de novo não marca nada como impresso outra vez.</Text>
      {data.map((job) => (
        <View key={job.id} style={styles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.main}>{when(job.at)} · {job.total} etiqueta{job.total !== 1 ? 's' : ''}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {PAPER[job.layout]}{job.layout === 'roll' ? '' : `, começa na posição ${job.start_position}`}{job.by ? ` · ${job.by}` : ''}
            </Text>
          </View>
          <AppButton
            label={blocked[job.id] ? 'Toque para compartilhar' : 'Compartilhar o arquivo'}
            icon="share-outline"
            iconOnly={!blocked[job.id]}
            variant={blocked[job.id] ? 'primary' : 'ghost'}
            loading={busyId === job.id}
            size="sm"
            disabled={busyId != null}
            onPress={() => open(job, 'share')}
          />
          <AppButton
            label="Abrir"
            icon="print-outline"
            variant="outlined"
            size="sm"
            disabled={busyId != null}
            onPress={() => open(job, 'open')}
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
