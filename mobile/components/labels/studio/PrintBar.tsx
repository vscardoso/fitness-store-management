/**
 * Barra fixa de baixo: UM botão principal que muda conforme a etapa.
 *   edit       "Gerar PDF"
 *   generated  "Já imprimi" (marca como impresso)   [Não imprimi]
 *   done       "Imprimir mais"                      [Desfazer]
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

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
              <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={p.sendToQueue} disabled={busy} accessibilityRole="button">
                <Text style={styles.secondaryText}>{p.busy === 'queue' ? 'Colocando...' : 'Colocar na fila de impressão'}</Text>
              </TouchableOpacity>
              {p.queuedCount > 0 ? (
                <TouchableOpacity style={styles.secondary} onPress={() => router.push('/etiquetas/fila' as any)} accessibilityRole="button">
                  <Text style={[styles.secondaryText, { color: brand.primary }]}>Abrir a fila</Text>
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
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.primaryText}>{p.busy === 'generate' ? 'Gerando...' : 'Gerar PDF'}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {p.step === 'generated' ? (
        <>
          <Text style={styles.title}>PDF gerado</Text>
          <Text style={styles.sub}>Imprima o arquivo. Depois de imprimir, toque em “Já imprimi” para marcar. Se não imprimiu, nada é marcado.</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.secondary]} onPress={p.backToEdit} disabled={busy} accessibilityRole="button">
              <Text style={styles.secondaryText}>Não imprimi</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primary, { flex: 1, justifyContent: 'center' }, busy && styles.disabled]} onPress={p.confirm} disabled={busy} accessibilityRole="button">
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.primaryText}>{p.busy === 'confirm' ? 'Marcando...' : 'Já imprimi'}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {p.step === 'done' ? (
        <View style={styles.row}>
          {p.lastJob ? (
            <TouchableOpacity style={styles.secondary} onPress={p.undo} disabled={busy} accessibilityRole="button" accessibilityLabel="Não saiu, desfazer">
              <Text style={styles.secondaryText}>{p.busy === 'undo' ? 'Desfazendo...' : 'Não saiu? Desfazer'}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.primary, { flex: 1, justifyContent: 'center' }]} onPress={p.backToEdit} accessibilityRole="button">
            <Text style={styles.primaryText}>Imprimir mais</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (primary: string) => StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: theme.spacing.sm, padding: theme.spacing.md,
    backgroundColor: Colors.light.background, borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  queueRow: { flexDirection: 'row', gap: theme.spacing.sm },
  title: { fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text },
  total: { fontSize: theme.fontSize.lg, fontWeight: '800', color: Colors.light.text },
  sub: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  notice: { color: Colors.light.success, fontWeight: '700', fontSize: 13 },
  error: { color: '#b91c1c', fontSize: theme.fontSize.sm },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: primary, borderRadius: theme.borderRadius.xxl, paddingHorizontal: 20, paddingVertical: 14 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: theme.fontSize.base },
  secondary: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: theme.borderRadius.xl, borderWidth: 1.5, borderColor: Colors.light.border },
  secondaryText: { color: Colors.light.text, fontWeight: '700', fontSize: theme.fontSize.sm },
  disabled: { opacity: 0.45 },
});
