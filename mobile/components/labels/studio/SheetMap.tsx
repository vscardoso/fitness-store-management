/** Passo 3 da tela de etiquetas: a folha com cada posição (já impressa em cinza, a que sai agora destacada). */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { SheetCell } from '@/services/labelQueueService';

interface Props {
  start: number;
  onPick: (position: number) => void;
  onNewSheet: () => void;
  perSheet: number;
  total: number;
  sheets: number;
  leftover: number;
  usedCells: SheetCell[];
  /** Última impressão salva, com a opção de desfazer (some quando a barra de baixo já oferece). */
  lastJob?: { total: number; by: string | null } | null;
  onUndo?: () => void;
  undoing?: boolean;
}

export default function SheetMap({ start, onPick, onNewSheet, perSheet, total, sheets, leftover, usedCells, lastJob, onUndo, undoing }: Props) {
  const brand = useBrandingColors();
  const styles = useMemo(() => makeStyles(brand.primary), [brand.primary]);

  const status = start === 1
    ? 'Folha nova. A impressão começa na posição 1.'
    : `Esta folha já tem ${start - 1} etiqueta${start - 1 !== 1 ? 's' : ''}. A impressão começa na posição ${start}.`;
  const summary = total > 0
    ? `${total} etiqueta${total !== 1 ? 's' : ''} = ${sheets} folha${sheets !== 1 ? 's' : ''}${leftover === 0 ? ', sem sobra.' : `. A última fica com ${leftover} de ${perSheet} usadas.`}`
    : 'Escolha as quantidades para ver quantas folhas vão precisar.';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>3. Folha</Text>
      <View style={styles.card}>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.muted}>{summary}</Text>
        <View style={styles.grid}>
          {Array.from({ length: perSheet }, (_, i) => i + 1).map((pos) => {
            const done = usedCells.find((c) => c.position === pos);
            const used = pos < start;
            const isNew = pos >= start && pos < start + total;
            return (
              <TouchableOpacity
                key={pos}
                style={[styles.cell, used && styles.cellUsed, isNew && styles.cellNew]}
                onPress={() => onPick(pos)}
                accessibilityLabel={used ? `Posição ${pos}, já impressa${done?.code ? ` (${done.code})` : ''}` : `Começar na posição ${pos}`}
              >
                {used ? (
                  <>
                    <Text style={styles.cellUsedText}>{done?.code ?? '✕'}</Text>
                    {done ? <Text style={styles.cellSub} numberOfLines={1}>{[done.color, done.size].filter(Boolean).join(' ')}</Text> : null}
                  </>
                ) : (
                  <Text style={[styles.cellText, isNew && { color: brand.primary }]}>{pos}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.muted}>Cinza: já impresso, não sai de novo. Rosa: sai agora. Toque numa posição para mudar o início.</Text>
        {start > 1 ? (
          <TouchableOpacity onPress={onNewSheet} accessibilityRole="button" style={styles.outline}>
            <Text style={styles.outlineText}>Coloquei uma folha nova (começar no 1)</Text>
          </TouchableOpacity>
        ) : null}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 48, height: 40, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border, alignItems: 'center', justifyContent: 'center' },
  cellUsed: { backgroundColor: '#e4e4e7', borderColor: '#d4d4d8' },
  cellNew: { borderColor: primary, backgroundColor: primary + '18' },
  cellText: { fontWeight: '700', color: Colors.light.text },
  cellUsedText: { fontSize: 11, fontWeight: '700', color: Colors.light.textSecondary },
  cellSub: { fontSize: 9, color: Colors.light.textSecondary },
  outline: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: primary },
  outlineText: { color: primary, fontWeight: '700', fontSize: 13 },
  last: { gap: 8, borderTopWidth: 1, borderTopColor: Colors.light.border, paddingTop: theme.spacing.md },
});
