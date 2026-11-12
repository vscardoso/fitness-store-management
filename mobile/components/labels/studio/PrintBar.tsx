/**
 * Barra fixa de baixo: UM botão principal que muda conforme a etapa.
 *   edit       "Gerar PDF e imprimir" (gerar o PDF já salva a impressão: tira da fila e anda a folha)
 *   done       "Abrir o PDF e imprimir" (abre no Safari; de lá o Compartilhar entrega ao Label Expert)   [Compartilhar o arquivo PDF]   [Não saiu? Desfazer]   [Imprimir mais]
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import PdfActions from '@/components/ui/PdfActions';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { LabelPrint } from './useLabelPrint';

interface Props {
  p: LabelPrint;
  /** Texto curto do que vai sair: medida e papel. */
  summary: string;
}

export default function PrintBar({ p, summary }: Props) {
  const brand = useBrandingColors();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(brand.primary), [brand.primary]);
  const busy = !!p.busy;

  return (
    <View style={styles.bar}>
      {p.error ? <Text style={styles.error} accessibilityLiveRegion="polite">{p.error}</Text> : null}
      {p.notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{p.notice}</Text> : null}

      {p.step === 'edit' ? (
        <>
          {p.canQueue && p.total > 0 ? (
            <View style={styles.queueRow}>
              <TouchableOpacity style={styles.link} onPress={p.sendToQueue} disabled={busy} accessibilityRole="button" accessibilityLabel="Colocar na fila de impressão">
                <Ionicons name="list-outline" size={18} color={brand.primary} />
                <Text style={styles.linkText}>{p.busy === 'queue' ? 'Colocando...' : 'Colocar na fila de impressão'}</Text>
              </TouchableOpacity>
              {p.queuedCount > 0 ? (
                <TouchableOpacity style={styles.link} onPress={() => router.push('/etiquetas/fila' as any)} accessibilityRole="button">
                  <Text style={styles.linkText}>Abrir a fila</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.total}>{p.total} etiqueta{p.total !== 1 ? 's' : ''}</Text>
              <Text style={styles.sub} numberOfLines={2}>{summary}</Text>
            </View>
            <TouchableOpacity style={[styles.primary, (p.total === 0 || busy) && styles.disabled]} onPress={p.generate} disabled={p.total === 0 || busy} accessibilityRole="button">
              <Ionicons name="download-outline" size={18} color={Colors.light.white} />
              <Text style={styles.primaryText}>{p.busy === 'generate' ? 'Gerando...' : 'Gerar PDF e imprimir'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sub}>Ao gerar o PDF, as etiquetas já contam como impressas e saem da fila. Se não saírem, use “Não saiu? Desfazer”.</Text>
        </>
      ) : null}

      {p.step === 'done' ? (
        <>
          <Text style={styles.title}>
            PDF gerado e salvo{p.printedTotal > 0 ? `: ${p.printedTotal} etiqueta${p.printedTotal !== 1 ? 's' : ''}` : ''}
          </Text>
          <Text style={styles.sub}>
            As etiquetas já estão marcadas como impressas. Toque em “Abrir o PDF e imprimir”; com o PDF aberto, use o Compartilhar do Safari e escolha o app da impressora.
          </Text>
          <PdfActions pdf={p.pdf} showOpen openFirst openLabel="Abrir o PDF e imprimir" shareLabel="Compartilhar o arquivo PDF" />
          <View style={styles.row}>
            {p.lastJob ? (
              <TouchableOpacity style={styles.secondary} onPress={p.undo} disabled={busy} accessibilityRole="button" accessibilityLabel="Não saiu, desfazer">
                <Text style={styles.secondaryText}>{p.busy === 'undo' ? 'Desfazendo...' : 'Não saiu? Desfazer'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={p.backToEdit} disabled={busy} accessibilityRole="button">
              <Text style={styles.secondaryText}>Imprimir mais</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
}

const makeStyles = (primary: string) => StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: theme.spacing.md, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.lg,
    backgroundColor: Colors.light.background, borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  queueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md, paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  linkText: { color: primary, fontWeight: '700', fontSize: theme.fontSize.sm },
  title: { fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text },
  total: { fontSize: theme.fontSize.lg, fontWeight: '800', color: Colors.light.text },
  sub: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  notice: { color: Colors.light.success, fontWeight: '700', fontSize: 13 },
  error: { color: Colors.light.errorDark, fontSize: theme.fontSize.sm },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: primary, borderRadius: theme.borderRadius.xxl, paddingHorizontal: 20, paddingVertical: 14 },
  primaryText: { color: Colors.light.white, fontWeight: '800', fontSize: theme.fontSize.base },
  secondary: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: theme.borderRadius.xl, borderWidth: 1.5, borderColor: Colors.light.border },
  secondaryText: { color: Colors.light.text, fontWeight: '700', fontSize: theme.fontSize.sm },
  disabled: { opacity: 0.45 },
});
