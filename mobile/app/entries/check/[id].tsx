/**
 * Conferir o recebimento de uma entrada: bipe cada peça que chegou e veja na hora se bate com a nota (quantas faltam, quantas
 * vieram a mais, qual peça nem estava na entrada). Não altera estoque nem a entrada.
 *
 * É a MESMA conferência compartilhada da Conferência de estoque (mesmo serviço no servidor, mesmo motor de bipe no app:
 * `useSharedCountSync`), só que com escopo de UMA entrada. Várias vendedoras conferem juntas: cada bipada soma com as das
 * outras e a tela se atualiza sozinha a cada 4 s. Bipar de novo a mesma peça avisa que está duplicada e só conta se a pessoa
 * confirmar (`useDuplicateScan`).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ScanBar, { type ScanStatus } from '@/components/scan/ScanBar';
import DuplicateScanNotice from '@/components/scan/DuplicateScanNotice';
import { Colors, VALUE_COLORS } from '@/constants/Colors';
import useBackToList from '@/hooks/useBackToList';
import { useSharedCountSync } from '@/hooks/useSharedCountSync';
import { useDuplicateScan } from '@/hooks/useDuplicateScan';
import { useBrandingColors } from '@/store/brandingStore';
import { useAuthStore } from '@/store/authStore';
import { applyReceiptCheck, getReceiptCheck, receiptRevisionKey, resetReceiptCheck, type ReceiptCheckState } from '@/services/receiptCheckService';
import { lookupCode, variantLabel } from '@/services/codeResolver';
import { overlayOps, type CountMap } from '@/utils/countOps';
import { isManagerRole } from '@/utils/roles';
import { playScan } from '@/utils/scanFeedback';
import { formatInt } from '@/utils/format';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import ScreenLoader from '@/components/ui/ScreenLoader';

export default function EntryReceiveCheckScreen() {
  const desktopContent = useDesktopContentStyle();
  const brand = useBrandingColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const { goBack } = useBackToList('/(tabs)/entries');
  const canReset = isManagerRole(useAuthStore((s) => s.user?.role));
  const legacyKey = `@provador:recebimento:${entryId}`;   // contagem de antes, que ficava só no aparelho

  const [server, setServer] = useState<ReceiptCheckState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [tick, bump] = useState(0);      // redesenha quando muda a fila deste aparelho
  const localNames = useRef<Record<number, { name: string; label: string }>>({});
  const dup = useDuplicateScan();

  const sync = useSharedCountSync<ReceiptCheckState>({
    enabled: !!server,
    fetchDetail: () => getReceiptCheck(entryId, true),
    revisionOf: receiptRevisionKey,
    sendOps: async (ops, batchId) => {
      const s = await applyReceiptCheck(entryId, ops, batchId);
      setServer(s);
      return receiptRevisionKey(s);
    },
    onDetail: (d) => setServer(d),
    onEnded: () => {
      setServer(null);
      setLoadError('Esta entrada não existe mais.');
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const s = await getReceiptCheck(entryId);
      sync.setRevision(receiptRevisionKey(s));
      setServer(s);
      // Contagem antiga que ficava só neste aparelho: entra UMA vez, só se a conferência do servidor ainda está vazia
      // (nunca soma por cima: 05/11/2026 somar a cópia do aparelho dobrou uma conferência inteira)
      const raw = await AsyncStorage.getItem(legacyKey).catch(() => null);
      if (raw) {
        await AsyncStorage.removeItem(legacyKey).catch(() => {});
        if (s.revision === 0) {
          try {
            const saved = JSON.parse(raw)?.counts ?? {};
            const known = new Set(s.lines.map((l) => l.variant_id));
            Object.entries(saved).forEach(([vid, n]) => {
              const q = Number(n);
              if (known.has(Number(vid)) && Number.isFinite(q) && q > 0) sync.queueOp({ variant_id: Number(vid), set: q });
            });
            bump((x) => x + 1);
          } catch { /* contagem antiga ilegível: ignora */ }
        }
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Não foi possível abrir a conferência desta entrada.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, legacyKey]);

  useEffect(() => {
    if (Number.isFinite(entryId)) load();
  }, [entryId, load]);

  // O que a tela mostra: o que o servidor tem (todas as pessoas) mais o que este aparelho bipou e ainda não foi confirmado
  const lines = server?.lines ?? [];
  const lineIds = useMemo(() => new Set(lines.map((l) => l.variant_id)), [lines]);
  const counts: CountMap = useMemo(() => {
    const base: CountMap = {};
    server?.lines.forEach((l) => { if (l.counted > 0) base[l.variant_id] = l.counted; });
    server?.extras.forEach((x) => { base[x.variant_id] = x.quantity; });
    return overlayOps(base, sync.getPending());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, tick]);

  const handleCode = useCallback(
    async (code: string) => {
      try {
        const found = await lookupCode(code);
        if (!found) {
          playScan('error');
          setStatus({ kind: 'error', text: 'Código ' + code + ' não encontrado nesta loja.' });
          return;
        }
        const vid = found.variant.id;
        const title = found.product.name + ' · ' + variantLabel(found.variant);
        const line = lines.find((l) => l.variant_id === vid);
        localNames.current[vid] = { name: found.product.name, label: variantLabel(found.variant) };
        const before = counts[vid] ?? 0;

        const count = () => {
          sync.queueOp({ variant_id: vid, delta: 1 });
          bump((x) => x + 1);
          if (!line) {
            playScan('warn');
            setStatus({ kind: 'warn', text: title + ': esta peça NÃO está nesta entrada.' });
            return;
          }
          const next = before + 1;
          const over = next > line.expected;
          playScan(over ? 'warn' : 'ok');
          setStatus({
            kind: over ? 'warn' : 'ok',
            text: title + ': ' + next + ' de ' + line.expected + (over ? ' (veio a mais que na nota)' : next === line.expected ? ' (completo)' : ''),
          });
        };

        // Mesma peça bipada de novo nesta conferência: avisa que está duplicada e só conta se a pessoa confirmar
        if (!dup.check({ variantId: vid, title, alreadyCounted: before, expected: line?.expected }, count)) {
          playScan('warn');
          setStatus({ kind: 'warn', text: title + ': duplicada. Confirme abaixo se é outra peça igual.' });
          return;
        }
        count();
      } catch (e: any) {
        playScan('error');
        setStatus({ kind: 'error', text: e?.message || 'Não foi possível consultar o código. Tente de novo.' });
      }
    },
    [lines, counts, sync, dup],
  );

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

  const step = (variantId: number, delta: 1 | -1) => {
    if (delta < 0 && (counts[variantId] ?? 0) <= 0) return;
    sync.queueOp({ variant_id: variantId, delta });
    bump((x) => x + 1);
  };

  const totals = useMemo(() => {
    let expected = 0;
    let read = 0;
    let missing = 0;
    let over = 0;
    lines.forEach((l) => {
      const c = counts[l.variant_id] ?? 0;
      expected += l.expected;
      read += c;
      if (c < l.expected) missing += l.expected - c;
      else over += c - l.expected;
    });
    return { expected, read, missing, over };
  }, [lines, counts]);

  // Peças lidas que não são desta entrada (as do servidor e as que só este aparelho bipou ainda)
  const extras = useMemo(() => {
    const out: { variantId: number; name: string; label: string; qty: number }[] = [];
    Object.entries(counts).forEach(([vidRaw, qty]) => {
      const vid = Number(vidRaw);
      if (lineIds.has(vid) || qty <= 0) return;
      const fromServer = server?.extras.find((x) => x.variant_id === vid);
      const local = localNames.current[vid];
      out.push({ variantId: vid, name: fromServer?.product_name ?? local?.name ?? 'Peça', label: fromServer?.label ?? local?.label ?? '', qty });
    });
    return out;
  }, [counts, lineIds, server]);
  const extraTotal = extras.reduce((a, b) => a + b.qty, 0);

  const people = useMemo(() => {
    const s = new Set<string>();
    server?.lines.forEach((l) => l.counted_by_name && s.add(l.counted_by_name));
    server?.extras.forEach((x) => x.counted_by_name && s.add(x.counted_by_name));
    return Array.from(s);
  }, [server]);

  const visible = onlyMissing ? lines.filter((l) => (counts[l.variant_id] ?? 0) !== l.expected) : lines;

  const doReset = async () => {
    setConfirmClear(false);
    try {
      sync.reset();
      const s = await resetReceiptCheck(entryId);
      sync.setRevision(receiptRevisionKey(s));
      setServer(s);
      bump((x) => x + 1);
      setStatus({ kind: 'ok', text: 'Leituras zeradas para todas as pessoas.' });
    } catch (e: any) {
      setStatus({ kind: 'error', text: e?.message || 'Não foi possível zerar. Tente de novo.' });
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Conferir recebimento" subtitle={server ? 'Entrada ' + server.entry.entry_code : undefined} showBackButton onBack={goBack} />
      <ScrollView contentContainerStyle={[styles.content, desktopContent]} keyboardShouldPersistTaps="handled">
        {loading && !server ? (
          <ScreenLoader inline />
        ) : loadError || !server ? (
          <View style={styles.empty}>
            <Ionicons name="wifi-outline" size={40} color={Colors.light.textTertiary} />
            <Text style={styles.emptyText}>{loadError || 'Não foi possível abrir a entrada.'}</Text>
            <TouchableOpacity onPress={load}><Text style={[styles.link, { color: brand.primary }]}>Tentar novamente</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            <ScanBar onCode={handleCode} status={status} placeholder="Bipe ou digite o código" />
            <DuplicateScanNotice dup={dup} />

            {sync.syncError && (
              <View style={styles.offline}>
                <Ionicons name="cloud-offline-outline" size={16} color={Colors.light.warningDarker} />
                <Text style={styles.offlineText}>Sem conexão: as bipadas deste aparelho vão ser enviadas assim que a internet voltar.</Text>
              </View>
            )}

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
                <Text style={[styles.cardValue, { color: totals.over > 0 ? Colors.light.warningDark : Colors.light.text }]}>{formatInt(totals.over)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Fora da entrada</Text>
                <Text style={[styles.cardValue, { color: extraTotal > 0 ? Colors.light.warningDark : Colors.light.text }]}>{formatInt(extraTotal)}</Text>
              </View>
            </View>

            {people.length > 0 && (
              <Text style={styles.people} accessibilityLabel={'Contaram: ' + people.join(', ')}>
                Conferência compartilhada · contaram: {people.join(', ')}
              </Text>
            )}

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
                style={[styles.chip, dup.warn && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                onPress={() => dup.setWarn(!dup.warn)}
                activeOpacity={0.8}
                accessibilityRole="switch"
                accessibilityState={{ checked: dup.warn }}
                accessibilityLabel="Avisar quando a mesma peça for bipada de novo"
              >
                <Ionicons name={dup.warn ? 'checkbox' : 'square-outline'} size={16} color={dup.warn ? brand.primary : Colors.light.textSecondary} />
                <Text style={[styles.chipText, dup.warn && { color: brand.primary }]}>Avisar peça repetida</Text>
              </TouchableOpacity>
              {canReset && (
                <TouchableOpacity
                  style={[styles.chip, (totals.read === 0 && extraTotal === 0) && { opacity: 0.5 }]}
                  onPress={() => (totals.read || extraTotal) && setConfirmClear(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-outline" size={16} color={Colors.light.textSecondary} />
                  <Text style={styles.chipText}>Zerar leituras</Text>
                </TouchableOpacity>
              )}
            </View>

            {extras.length > 0 && (
              <View style={styles.extraBox}>
                <Text style={styles.extraTitle}>Peças lidas que não são desta entrada</Text>
                {extras.map((x) => (
                  <Text key={x.variantId} style={styles.extraRow}>{x.qty}x {x.name}{x.label ? ' · ' + x.label : ''}</Text>
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
                const c = counts[l.variant_id] ?? 0;
                const diff = c - l.expected;
                return (
                  <View key={l.variant_id} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>{l.product_name}</Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {l.label || 'Única'}{l.counted_by_name && c > 0 ? ' · ' + l.counted_by_name : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => step(l.variant_id, -1)} style={styles.stepBtn} accessibilityLabel="Diminuir">
                      <Ionicons name="remove" size={18} color={Colors.light.text} />
                    </TouchableOpacity>
                    <Text style={styles.qty}>{formatInt(c)}<Text style={styles.qtyOf}> / {formatInt(l.expected)}</Text></Text>
                    <TouchableOpacity onPress={() => step(l.variant_id, 1)} style={styles.stepBtn} accessibilityLabel="Aumentar">
                      <Ionicons name="add" size={18} color={Colors.light.text} />
                    </TouchableOpacity>
                    <View style={styles.diff}>
                      {diff === 0 ? (
                        <Ionicons name="checkmark-circle" size={22} color={VALUE_COLORS.positive} accessibilityLabel="Completo" />
                      ) : (
                        <Text style={[styles.diffText, { color: diff < 0 ? VALUE_COLORS.negative : Colors.light.warningDark }]}>
                          {diff < 0 ? 'falta ' + formatInt(-diff) : 'a mais ' + formatInt(diff)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
            <Text style={styles.footer}>
              Esta tela só confere. Ela não muda a entrada nem o estoque. Todas as pessoas da loja contam juntas: cada bipada soma com a das outras.
            </Text>
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmClear}
        type="warning"
        title="Zerar as leituras?"
        message="A contagem desta entrada será apagada para TODAS as pessoas que estão conferindo. A entrada não muda."
        confirmText="Zerar"
        cancelText="Cancelar"
        onConfirm={doReset}
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
  people: { fontSize: 12, color: Colors.light.textSecondary },
  offline: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: Colors.light.warningLight, borderRadius: 12, padding: 10 },
  offlineText: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.light.warningDarker },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  extraBox: { backgroundColor: Colors.light.warningLight, borderRadius: 12, padding: 12, gap: 4 },
  extraTitle: { fontSize: 13, fontWeight: '800', color: Colors.light.warningDarker },
  extraRow: { fontSize: 13, color: Colors.light.warningDarker },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.light.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.light.border },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 12, color: Colors.light.textSecondary },
  stepBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.backgroundSecondary },
  qty: { minWidth: 56, textAlign: 'center', fontSize: 16, fontWeight: '800', color: Colors.light.text },
  qtyOf: { fontSize: 12, fontWeight: '600', color: Colors.light.textTertiary },
  diff: { width: 62, alignItems: 'center' },
  diffText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.light.textSecondary, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
  footer: { fontSize: 12, color: Colors.light.textTertiary, textAlign: 'center', marginTop: 8 },
});
