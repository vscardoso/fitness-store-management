/** Passo 3 da tela de etiquetas: só informa onde a impressão continua na folha. Tudo automático: sem escolher posição nem "folha nova". */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

interface Props {
  start: number;
  perSheet: number;
  total: number;
  sheets: number;
  leftover: number;
  /** Última impressão salva, com a opção de desfazer (some quando a barra de baixo já oferece). */
  lastJob?: { total: number; by: string | null } | null;
  onUndo?: () => void;
  undoing?: boolean;
}

export default function SheetMap({ start, perSheet, total, sheets, leftover, lastJob, onUndo, undoing }: Props) {
  const brand = useBrandingColors();
  const styles = useMemo(() => makeStyles(brand.primary), [brand.primary]);

  const status = start === 1
    ? 'Folha nova: as etiquetas saem a partir da primeira posição.'
    : `A folha em uso já tem ${start - 1} etiqueta${start - 1 !== 1 ? 's' : ''}: as próximas saem a partir da posição ${start}.`;
  const summary = total > 0
    ? `${total} etiqueta${total !== 1 ? 's' : ''} = ${sheets} folha${sheets !== 1 ? 's' : ''}${leftover === 0 ? ', sem sobra.' : `. A última fica com ${leftover} de ${perSheet} usadas.`}`
    : 'Escolha as quantidades para ver quantas folhas vão precisar.';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>3. Folha</Text>
      <View style={styles.card}>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.muted}>{summary}</Text>
        {lastJob && onUndo ? (
          <View style={styles.last}>
            <Text style={styles.muted}>Última impressão salva: {lastJob.total} etiqueta{lastJob.total !== 1 ? 's' : ''}{lastJob.by ? `, por ${lastJob.by}` : ''}.</Text>
            <TouchableOpacity onPress={onUndo} disabled={undoing} accessibilityRole="button" accessibilityLabel="Não saiu, desfazer" style={styles.outline}>
              <Text style={styles.outlineText}>{undoing ? 'Desfazendo...' : 'Não saiu? Desfazer'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (primary: string) => StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  title: { fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text },
  card: { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, padding: theme.spacing.md, gap: theme.spacing.md },
  status: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  muted: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  outline: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: primary },
  outlineText: { color: primary, fontWeight: '700', fontSize: 13 },
  last: { gap: 8, borderTopWidth: 1, borderTopColor: Colors.light.border, paddingTop: theme.spacing.md },
});
