/**
 * Tabela do modo notebook (app web com 1024 px ou mais; docs/PLANO_WEB_NOTEBOOK.md, fase 3).
 * Colunas com largura proporcional, ordenar clicando no título, linha clicável com realce do mouse e páginas de 25.
 * Tudo no aparelho: a tela entrega a lista completa e a tabela ordena e pagina.
 */
import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBrandingColors } from '@/store/brandingStore';

export interface DataColumn<T> {
  key: string;
  title: string;
  /** Peso da coluna na largura (padrão 1) */
  flex?: number;
  /** Largura mínima em px (a coluna não encolhe abaixo disso) */
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  /** Com isto a coluna ordena ao clicar no título */
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowPress?: (row: T) => void;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  emptyTitle?: string;
  emptyHint?: string;
  /** Muda quando os filtros mudam: volta para a página 1 */
  resetKey?: string;
}

const INK = '#160F28';
const MUTED = '#5B5670';
const LINE = '#E6E3EE';

export default function DataTable<T>({
  columns, rows, rowKey, onRowPress, defaultSort, pageSize = 25, emptyTitle = 'Nada por aqui', emptyHint, resetKey,
}: Props<T>) {
  const colors = useBrandingColors();
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [resetKey, sort?.key, sort?.dir]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (col: DataColumn<T>) => {
    if (!col.sortValue) return;
    setSort((s) => (s?.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }));
  };

  const cellStyle = (col: DataColumn<T>) => [
    styles.cell,
    { flexGrow: col.flex ?? 1, flexBasis: 0, minWidth: col.minWidth ?? 80 },
    col.align === 'right' && styles.right,
    col.align === 'center' && styles.center,
  ];

  return (
    <View style={styles.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flexGrow: 1, minWidth: '100%' as any }}>
          <View style={styles.headRow}>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <Pressable
                  key={col.key}
                  disabled={!col.sortValue}
                  onPress={() => toggleSort(col)}
                  style={cellStyle(col)}
                  accessibilityRole={col.sortValue ? 'button' : undefined}
                  accessibilityLabel={col.sortValue ? `Ordenar por ${col.title}` : undefined}
                >
                  <View style={[styles.headInner, col.align === 'right' && { justifyContent: 'flex-end' }, col.align === 'center' && { justifyContent: 'center' }]}>
                    <Text style={[styles.headText, active && { color: colors.primary }]} numberOfLines={1}>{col.title.toUpperCase()}</Text>
                    {col.sortValue ? (
                      <Ionicons
                        name={active ? (sort!.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                        size={12}
                        color={active ? colors.primary : '#B3ADC4'}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {visible.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              {emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null}
            </View>
          ) : (
            visible.map((row) => (
              <Pressable
                key={rowKey(row)}
                onPress={onRowPress ? () => onRowPress(row) : undefined}
                style={((state: any) => [styles.row, state.hovered && onRowPress ? { backgroundColor: '#F7F4FF' } : null]) as any}
              >
                {columns.map((col) => (
                  <View key={col.key} style={cellStyle(col)}>{col.render(row)}</View>
                ))}
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {sorted.length === 0 ? 'Nenhum registro' : `Mostrando ${current * pageSize + 1} a ${current * pageSize + visible.length} de ${sorted.length}`}
        </Text>
        {pages > 1 && (
          <View style={styles.pager}>
            <Pressable disabled={current === 0} onPress={() => setPage(current - 1)} style={[styles.pageBtn, current === 0 && styles.pageBtnOff]} accessibilityLabel="Página anterior">
              <Ionicons name="chevron-back" size={16} color={INK} />
            </Pressable>
            <Text style={styles.pageText}>Página {current + 1} de {pages}</Text>
            <Pressable disabled={current >= pages - 1} onPress={() => setPage(current + 1)} style={[styles.pageBtn, current >= pages - 1 && styles.pageBtnOff]} accessibilityLabel="Próxima página">
              <Ionicons name="chevron-forward" size={16} color={INK} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  headRow: { flexDirection: 'row', backgroundColor: '#FBFAFD', borderBottomWidth: 1, borderBottomColor: LINE },
  headInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headText: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F0EDF5', minHeight: 56 },
  cell: { paddingHorizontal: 14, paddingVertical: 11, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  center: { alignItems: 'center' },
  empty: { padding: 40, alignItems: 'center', gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: INK },
  emptyHint: { fontSize: 13, color: MUTED, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FBFAFD' },
  footerText: { fontSize: 13, color: MUTED },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  pageBtnOff: { opacity: 0.4 },
  pageText: { fontSize: 13, color: INK, fontWeight: '500' },
});
