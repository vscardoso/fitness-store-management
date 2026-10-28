/**
 * Conferir o recebimento de uma entrada: bipe cada peça que chegou e veja na hora se bate com a nota
 * (quantas faltam, quantas vieram a mais, qual peça nem estava na entrada). Não altera estoque nem a entrada.
 * A contagem fica no aparelho (pode continuar depois).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ScanBar, { type ScanStatus } from '@/components/scan/ScanBar';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, VALUE_COLORS } from '@/constants/Colors';
import useBackToList from '@/hooks/useBackToList';
import { useBrandingColors } from '@/store/brandingStore';
import { getStockEntryById } from '@/services/stockEntryService';
import { lookupCode, variantLabel } from '@/services/codeResolver';
import { playScan } from '@/utils/scanFeedback';
import { formatInt } from '@/utils/format';

type Counts = Record<number, number>; // variant_id -> peças lidas

interface Line {
  variantId: number;
  name: string;
  label: string;
  expected: number;
}

export default function EntryReceiveCheckScreen() {
  const brand = useBrandingColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const { goBack } = useBackToList('/(tabs)/entries');
  const storageKey = `@provador:recebimento:${entryId}`;

  const [counts, setCounts] = useState<Counts>({});
  const [extra, setExtra] = useState<Record<string, number>>({}); // peças lidas que não são desta entrada (por nome)
  const [loaded, setLoaded] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['entry-check', entryId],
    queryFn: () => getStockEntryById(entryId),
    enabled: Number.isFinite(entryId),
  });

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw);
          setCounts(saved.counts ?? {});
          setExtra(saved.extra ?? {});
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(storageKey, JSON.stringify({ counts, extra })).catch(() => {});
  }, [counts, extra, loaded, storageKey]);

  const lines = useMemo<Line[]>(() => {
    const map = new Map<number, Line>();
    (entry?.entry_items ?? []).forEach((it) => {
      if (!it.is_active || !it.variant_id) return;
      const cur = map.get(it.variant_id);
      if (cur) cur.expected += it.quantity_received;
      else map.set(it.variant_id, {
        variantId: it.variant_id,
        name: it.product_name || 'Produto',
        label: it.variant_label || '',
        expected: it.quantity_received,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
  }, [entry]);

  const handleCode = useCallback(
    async (code: string) => {
      try {
        const found = await lookupCode(code);
        if (!found) {
          playScan('error');
          setStatus({ kind: 'error', text: 'Código ' + code + ' não encontrado nesta loja.' });
          return;
        }
        const title = found.product.name + ' · ' + variantLabel(found.variant);
        const line = lines.find((l) => l.variantId === found.variant.id);
        if (!line) {
          playScan('warn');
          setExtra((p) => ({ ...p, [title]: (p[title] ?? 0) + 1 }));
          setStatus({ kind: 'warn', text: title + ': esta peça NÃO está nesta entrada.' });
          return;
        }
        const next = (counts[line.variantId] ?? 0) + 1;
        setCounts((p) => ({ ...p, [line.variantId]: next }));
        const over = next > line.expected;
        playScan(over ? 'warn' : 'ok');
        setStatus({
          kind: over ? 'warn' : 'ok',
          text: title + ': ' + next + ' de ' + line.expected + (over ? ' (veio a mais que na nota)' : next === line.expected ? ' (completo)' : ''),
        });
      } catch (e: any) {
        playScan('error');
        setStatus({ kind: 'error', text: e?.message || 'Não foi possível consultar o código. Tente de novo.' });
      }
    },
    [lines, counts],
  );

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

  const step = (variantId: number, delta: 1 | -1) =>
    setCounts((p) => ({ ...p, [variantId]: Math.max(0, (p[variantId] ?? 0) + delta) }));

  const totals = useMemo(() => {
    let expected = 0;
    let read = 0;
    let missing = 0;
    let over = 0;
    lines.forEach((l) => {
      const c = counts[l.variantId] ?? 0;
      expected += l.expected;
      read += c;
      if (c < l.expected) missing += l.expected - c;
      else over += c - l.expected;
    });
    return { expected, read, missing, over };
  }, [lines, counts]);

  const visible = onlyMissing ? lines.filter((l) => (counts[l.variantId] ?? 0) !== l.expected) : lines;
  const extraTotal = Object.values(extra).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.container}>
      <PageHeader title="Conferir recebimento" subtitle={entry ? 'Entrada ' + entry.entry_code : undefined} showBackButton onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isLoading ? (
          <ActivityIndicator size="large" color={brand.primary} style={{ marginTop: 40 }} />
        ) : error || !entry ? (
          <View style={styles.empty}>
            <Ionicons name="wifi-outline" size={40} color={Colors.light.textTertiary} />
            <Text style={styles.emptyText}>Não foi possível abrir a entrada.</Text>
            <TouchableOpacity onPress={() => refetch()}><Text style={[styles.link, { color: brand.primary }]}>Tentar novamente</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            <ScanBar onCode={handleCode} status={status} placeholder="Bipe ou digite o código" />

            <View style={styles.cards}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Peças lidas</Text>
                <Text style={styles.cardValue}>{formatInt(totals.read)} de {formatInt(totals.expected)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Faltam chegar</Text>
                <Text style={[styles.cardValue, { color: totals.missing > 0 ? VALUE_COLORS.negative : VALUE_COLORS.positive }]}>{formatInt(totals.missing)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Vieram a mais</Text>
                <Text style={[styles.cardValue, { color: totals.over > 0 ? '#B45309' : Colors.light.text }]}>{formatInt(totals.over)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Fora da entrada</Text>
                <Text style={[styles.cardValue, { color: extraTotal > 0 ? '#B45309' : Colors.light.text }]}>{formatInt(extraTotal)}</Text>
              </View>
            </View>

            <View style={styles.toolbar}>
              <TouchableOpacity
                style={[styles.chip, onlyMissing && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                onPress={() => setOnlyMissing((v) => !v)}
                activeOpacity={0.8}
              >
                <Ionicons name={onlyMissing ? 'checkbox' : 'square-outline'} size={16} color={onlyMissing ? brand.primary : Colors.light.textSecondary} />
                <Text style={[styles.chipText, onlyMissing && { color: brand.primary }]}>Só o que falta conferir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, (totals.read === 0 && extraTotal === 0) && { opacity: 0.5 }]}
                onPress={() => (totals.read || extraTotal) && setConfirmClear(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh-outline" size={16} color={Colors.light.textSecondary} />
                <Text style={styles.chipText}>Zerar leituras</Text>
              </TouchableOpacity>
            </View>

            {Object.keys(extra).length > 0 && (
              <View style={styles.extraBox}>
                <Text style={styles.extraTitle}>Peças lidas que não são desta entrada</Text>
                {Object.entries(extra).map(([name, n]) => (
                  <Text key={name} style={styles.extraRow}>{n}x {name}</Text>
                ))}
              </View>
            )}

            {visible.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-circle-outline" size={40} color={VALUE_COLORS.positive} />
                <Text style={styles.emptyText}>Tudo conferido.</Text>
              </View>
            ) : (
              visible.map((l) => {
                const c = counts[l.variantId] ?? 0;
                const diff = c - l.expected;
                return (
                  <View key={l.variantId} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>{l.name}</Text>
                      <Text style={styles.sub} numberOfLines={1}>{l.label || 'Única'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => step(l.variantId, -1)} style={styles.stepBtn} accessibilityLabel="Diminuir">
                      <Ionicons name="remove" size={18} color={Colors.light.text} />
                    </TouchableOpacity>
                    <Text style={styles.qty}>{formatInt(c)}<Text style={styles.qtyOf}> / {formatInt(l.expected)}</Text></Text>
                    <TouchableOpacity onPress={() => step(l.variantId, 1)} style={styles.stepBtn} accessibilityLabel="Aumentar">
                      <Ionicons name="add" size={18} color={Colors.light.text} />
                    </TouchableOpacity>
                    <View style={styles.diff}>
                      {diff === 0 ? (
                        <Ionicons name="checkmark-circle" size={22} color={VALUE_COLORS.positive} accessibilityLabel="Completo" />
                      ) : (
                        <Text style={[styles.diffText, { color: diff < 0 ? VALUE_COLORS.negative : '#B45309' }]}>
                          {diff < 0 ? 'falta ' + formatInt(-diff) : 'a mais ' + formatInt(diff)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
            <Text style={styles.footer}>Esta tela só confere. Ela não muda a entrada nem o estoque.</Text>
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmClear}
        type="warning"
        title="Zerar as leituras?"
        message="As peças que você já bipou nesta entrada serão apagadas deste aparelho. A entrada não muda."
        confirmText="Zerar"
        cancelText="Cancelar"
        onConfirm={() => {
          setCounts({});
          setExtra({});
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: '45%', backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  cardLabel: { fontSize: 12, color: Colors.light.textSecondary },
  cardValue: { fontSize: 20, fontWeight: '800', color: Colors.light.text, marginTop: 4 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  extraBox: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, gap: 4 },
  extraTitle: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  extraRow: { fontSize: 13, color: '#92400E' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.light.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.light.border },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 12, color: Colors.light.textSecondary },
  stepBtn: { width: 32, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.backgroundSecondary },
  qty: { minWidth: 56, textAlign: 'center', fontSize: 16, fontWeight: '800', color: Colors.light.text },
  qtyOf: { fontSize: 12, fontWeight: '600', color: Colors.light.textTertiary },
  diff: { width: 62, alignItems: 'center' },
  diffText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.light.textSecondary, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
  footer: { fontSize: 12, color: Colors.light.textTertiary, textAlign: 'center', marginTop: 8 },
});
