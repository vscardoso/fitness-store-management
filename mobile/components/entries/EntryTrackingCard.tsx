/**
 * Rastreio das peças de uma entrada: para onde foi cada peça recebida.
 * Conta fechada do lote: recebidas = vendidas + com a cliente + saíram sem venda + em estoque.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { getEntryTracking } from '@/services/stockEntryService';

function fmtWhen(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export default function EntryTrackingCard({ entryId }: { entryId: number }) {
  const [open, setOpen] = useState(false);
  const [onlyOut, setOnlyOut] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data } = useQuery({ queryKey: ['entry-tracking', entryId], queryFn: () => getEntryTracking(entryId), enabled: open });
  const t = data?.totals;
  const rows = (data?.items ?? []).filter(r => (onlyOut ? r.removed > 0 : true));

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.head} onPress={() => setOpen(o => !o)} accessibilityRole="button">
        <Ionicons name="git-compare-outline" size={20} color={Colors.light.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Rastreio das peças</Text>
          <Text style={styles.sub}>Para onde foi cada peça: vendida, com a cliente, saiu sem venda ou ainda em estoque</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.light.textSecondary} />
      </TouchableOpacity>

      {open && t && (
        <View style={{ gap: 10 }}>
          <Text style={styles.sum}>
            Recebidas {t.received} = vendidas {t.sold} + com a cliente {t.with_customer} + saíram sem venda {t.removed} + em estoque {t.remaining}
          </Text>
          {t.removed_unrecorded > 0 && (
            <Text style={styles.warn}>
              {t.removed_unrecorded} peça(s) saíram sem venda e sem registro na hora (aconteceu antes do registro existir). Ficam marcadas em laranja.
            </Text>
          )}
          <TouchableOpacity onPress={() => setOnlyOut(v => !v)} style={styles.filter}>
            <Text style={styles.filterTxt}>{onlyOut ? 'Mostrando só as que saíram sem venda (toque para ver todas)' : 'Mostrar só as que saíram sem venda'}</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <Text style={[styles.cName, styles.th]}>Peça</Text>
            <Text style={[styles.cNum, styles.th]}>Rec.</Text>
            <Text style={[styles.cNum, styles.th]}>Vend.</Text>
            <Text style={[styles.cNum, styles.th]}>Sem venda</Text>
            <Text style={[styles.cNum, styles.th]}>Estoque</Text>
          </View>
          {rows.map(r => (
            <View key={r.item_id}>
              <TouchableOpacity style={styles.row} onPress={() => setExpanded(e => (e === r.item_id ? null : r.item_id))}>
                <View style={styles.cName}>
                  <Text style={styles.name} numberOfLines={2}>{r.product_name}</Text>
                  <Text style={styles.variant} numberOfLines={1}>{[r.variant_label, r.variant_code].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={styles.cNum}>{r.received}</Text>
                <Text style={styles.cNum}>{r.sold + r.with_customer}</Text>
                <Text style={[styles.cNum, r.removed > 0 && { color: r.removed_unrecorded > 0 ? '#D97706' : Colors.light.text, fontWeight: '700' }]}>{r.removed}</Text>
                <Text style={styles.cNum}>{r.remaining}</Text>
              </TouchableOpacity>
              {expanded === r.item_id && (
                <View style={styles.hist}>
                  {r.history.length === 0 && <Text style={styles.histTxt}>Sem histórico gravado para esta peça ainda.</Text>}
                  {r.history.map((h, i) => (
                    <Text key={i} style={styles.histTxt}>
                      {fmtWhen(h.when)} · {h.label} · {h.delta > 0 ? '+' : ''}{h.delta}{h.reconstructed ? ' (refeito depois)' : ''}{h.note ? ` · ${h.note}` : ''}
                    </Text>
                  ))}
                  {r.removed_unrecorded > 0 && (
                    <Text style={[styles.histTxt, { color: '#D97706' }]}>
                      {r.removed_unrecorded} peça(s) saíram sem venda e sem registro na hora.
                    </Text>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, gap: 12, marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  sum: { fontSize: 13, color: Colors.light.text },
  warn: { fontSize: 12, color: '#B45309' },
  filter: { alignSelf: 'flex-start' },
  filterTxt: { fontSize: 12, color: Colors.light.primary, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  th: { fontSize: 11, color: Colors.light.textSecondary, fontWeight: '700' },
  cName: { flex: 1 },
  cNum: { width: 52, textAlign: 'center', fontSize: 13, color: Colors.light.text },
  name: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  variant: { fontSize: 11, color: Colors.light.textSecondary },
  hist: { backgroundColor: Colors.light.background, borderRadius: 10, padding: 10, gap: 4, marginBottom: 6 },
  histTxt: { fontSize: 12, color: Colors.light.textSecondary },
});
