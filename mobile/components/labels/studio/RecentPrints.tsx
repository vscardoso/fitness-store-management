/**
 * Últimos PDFs gerados (só os 3 últimos; os mais antigos somem sozinhos): manda de novo o arquivo para a impressora, sem salvar nada
 * outra vez. O servidor refaz o PDF com as mesmas peças, quantidades, papel e posição, num link https assinado. Os botões e o
 * "toque de novo" do iPhone vêm do <PdfActions /> (o mesmo de todo PDF do app).
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import PdfActions from '@/components/ui/PdfActions';
import { Colors, theme } from '@/constants/Colors';
import { pdfFromUrl } from '@/services/pdfDelivery';
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

/** Uma linha: o PDF vira objeto UMA vez (arquivo baixado e reaproveitado pelos toques) e usa os mesmos botões do resto do app. */
function JobRow({ job }: { job: RecentPrint }) {
  const pdf = useMemo(() => pdfFromUrl(job.url, job.filename, 'Etiquetas'), [job.url, job.filename]);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.main}>{when(job.at)} · {job.total} etiqueta{job.total !== 1 ? 's' : ''}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {PAPER[job.layout]}{job.layout === 'roll' ? '' : `, começa na posição ${job.start_position}`}{job.by ? ` · ${job.by}` : ''}
        </Text>
      </View>
      {/* só o Compartilhar o arquivo PDF (Victor, 12/11/2026): sem Abrir, sem Baixar */}
      <PdfActions pdf={pdf} iconOnly shareLabel="Compartilhar o arquivo PDF" />
    </View>
  );
}

export default function RecentPrints() {
  const { data } = useQuery({ queryKey: ['label-recent-prints'], queryFn: getRecentPrints, refetchInterval: 60_000 });
  if (!data || data.length === 0) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Últimos PDFs gerados</Text>
      <Text style={styles.hint}>Ficam só os 3 últimos. Compartilhar de novo não marca nada como impresso outra vez.</Text>
      {data.map((job) => <JobRow key={job.id} job={job} />)}
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
